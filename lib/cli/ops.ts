/**
 * CLI operations — pure domain/mailbox CRUD against a Drizzle connection, with
 * NO `server-only`, HTTP, auth, or `next` coupling. Mirrors the behaviour of
 * the web server actions (lib/actions/{domain,mailbox}.ts) so the CLI writes
 * exactly what the UI writes: relative maildir, {BLF-CRYPT} passwords, the
 * mailbox self-alias, and the same validation/limit checks. The command grammar
 * mirrors phppostfixadmin's `postfixadmin-cli` (the reference being ported).
 *
 * Config defaults are read from the same env vars as lib/env.ts (without
 * importing it, since that module is server-only).
 */
import { and, count, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import { alias, domain, mailbox } from '@/lib/db/schema';
import { hashWithScheme } from '@/lib/auth/crypt';
import { buildMaildir, DEFAULT_MAILDIR_TEMPLATE } from '@/lib/mailbox-path';
import { mbToBytes } from '@/lib/format';

export type Db = MySql2Database<Record<string, never>>;

/** Raised for user-facing validation/conflict errors (clean message, exit 1). */
export class OpError extends Error {}

const domainNameRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const localPartRe = /^[a-z0-9._%+-]+$/;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

const defaults = {
  get aliases() { return envInt('DEFAULT_DOMAIN_ALIASES', 100); },
  get mailboxes() { return envInt('DEFAULT_DOMAIN_MAILBOXES', 100); },
  get mailboxQuotaMb() { return envInt('DEFAULT_MAILBOX_QUOTA_MB', 1024); },
  get domainQuotaMb() { return envInt('DEFAULT_DOMAIN_QUOTA_MB', 10240); },
  get passwordScheme() { return process.env.PASSWORD_SCHEME || 'BLF-CRYPT'; },
  get bcryptRounds() { return envInt('BCRYPT_ROUNDS', 12); },
  get maildirTemplate() { return process.env.MAILDIR_TEMPLATE || DEFAULT_MAILDIR_TEMPLATE; },
};

// ---------------------------------------------------------------------------
// domain
// ---------------------------------------------------------------------------

export interface DomainInput {
  description?: string;
  aliases?: number;
  mailboxes?: number;
  maxquotaMb?: number;
  quotaMb?: number;
  transport?: string;
  backupmx?: boolean;
  active?: boolean;
}

export async function listDomains(db: Db) {
  return db.select().from(domain);
}

export async function getDomain(db: Db, name: string) {
  const [row] = await db.select().from(domain).where(eq(domain.domain, name)).limit(1);
  if (!row) throw new OpError(`Domain ${name} not found.`);
  return row;
}

export async function createDomain(db: Db, name: string, opts: DomainInput) {
  const d = name.trim().toLowerCase();
  if (!domainNameRe.test(d)) throw new OpError(`"${name}" is not a valid domain name.`);
  const [existing] = await db.select({ domain: domain.domain }).from(domain).where(eq(domain.domain, d)).limit(1);
  if (existing) throw new OpError(`Domain ${d} already exists.`);

  const now = new Date();
  await db.insert(domain).values({
    domain: d,
    description: opts.description ?? '',
    aliases: opts.aliases ?? defaults.aliases,
    mailboxes: opts.mailboxes ?? defaults.mailboxes,
    maxquota: mbToBytes(opts.maxquotaMb ?? defaults.mailboxQuotaMb),
    quota: mbToBytes(opts.quotaMb ?? defaults.domainQuotaMb),
    transport: opts.transport ?? '',
    backupmx: opts.backupmx ? 1 : 0,
    active: opts.active === undefined ? 1 : opts.active ? 1 : 0,
    passwordExpiry: 0,
    created: now,
    modified: now,
  });
  return getDomain(db, d);
}

export async function updateDomain(db: Db, name: string, opts: DomainInput) {
  const d = name.trim().toLowerCase();
  await getDomain(db, d); // throws if missing
  const set: Record<string, unknown> = { modified: new Date() };
  if (opts.description !== undefined) set.description = opts.description;
  if (opts.aliases !== undefined) set.aliases = opts.aliases;
  if (opts.mailboxes !== undefined) set.mailboxes = opts.mailboxes;
  if (opts.maxquotaMb !== undefined) set.maxquota = mbToBytes(opts.maxquotaMb);
  if (opts.quotaMb !== undefined) set.quota = mbToBytes(opts.quotaMb);
  if (opts.transport !== undefined) set.transport = opts.transport;
  if (opts.backupmx !== undefined) set.backupmx = opts.backupmx ? 1 : 0;
  if (opts.active !== undefined) set.active = opts.active ? 1 : 0;
  await db.update(domain).set(set).where(eq(domain.domain, d));
  return getDomain(db, d);
}

/** Cascade delete (mailboxes + aliases + domain), matching phppostfixadmin. */
export async function deleteDomain(db: Db, name: string) {
  const d = name.trim().toLowerCase();
  await getDomain(db, d); // throws if missing
  await db.delete(mailbox).where(eq(mailbox.domain, d));
  await db.delete(alias).where(eq(alias.domain, d));
  await db.delete(domain).where(eq(domain.domain, d));
}

// ---------------------------------------------------------------------------
// mailbox
// ---------------------------------------------------------------------------

export interface MailboxInput {
  password?: string;
  name?: string;
  quotaMb?: number;
  active?: boolean;
}

export async function listMailboxes(db: Db, domainFilter?: string) {
  const rows = await db.select().from(mailbox);
  return domainFilter ? rows.filter((r) => r.domain === domainFilter.toLowerCase()) : rows;
}

export async function getMailbox(db: Db, username: string) {
  const u = username.trim().toLowerCase();
  const [row] = await db.select().from(mailbox).where(eq(mailbox.username, u)).limit(1);
  if (!row) throw new OpError(`Mailbox ${u} not found.`);
  return row;
}

export async function createMailbox(db: Db, address: string, opts: MailboxInput) {
  const username = address.trim().toLowerCase();
  const at = username.indexOf('@');
  if (at <= 0 || at === username.length - 1) throw new OpError(`"${address}" is not a valid email address.`);
  const localpart = username.slice(0, at);
  const domainName = username.slice(at + 1);
  if (!localPartRe.test(localpart)) throw new OpError(`Invalid local part "${localpart}".`);
  if (!opts.password) throw new OpError('A password is required (--password).');
  if (opts.password.length < 8) throw new OpError('Password must be at least 8 characters.');

  const [dom] = await db.select().from(domain).where(eq(domain.domain, domainName)).limit(1);
  if (!dom) throw new OpError(`Domain ${domainName} does not exist.`);

  if (dom.mailboxes > 0) {
    const [{ value: currentCount }] = await db
      .select({ value: count() })
      .from(mailbox)
      .where(eq(mailbox.domain, domainName));
    if (Number(currentCount) >= dom.mailboxes) {
      throw new OpError(`Domain ${domainName} is at its mailbox limit (${dom.mailboxes}).`);
    }
  }

  const quotaMb = opts.quotaMb ?? defaults.mailboxQuotaMb;
  const quotaBytes = mbToBytes(quotaMb);
  if (Number(dom.maxquota) > 0 && quotaBytes > Number(dom.maxquota)) {
    throw new OpError(`Quota exceeds domain maximum of ${Math.round(Number(dom.maxquota) / 1024 / 1024)} MB.`);
  }

  const [existing] = await db.select({ u: mailbox.username }).from(mailbox).where(eq(mailbox.username, username)).limit(1);
  if (existing) throw new OpError(`Mailbox ${username} already exists.`);

  const now = new Date();
  const maildir = buildMaildir(localpart, domainName, defaults.maildirTemplate);
  const passwordHash = await hashWithScheme(opts.password, defaults.passwordScheme, defaults.bcryptRounds);
  const active = opts.active === undefined ? 1 : opts.active ? 1 : 0;

  await db.insert(mailbox).values({
    username,
    password: passwordHash,
    name: opts.name ?? '',
    maildir,
    quota: quotaBytes,
    localPart: localpart,
    domain: domainName,
    active,
    created: now,
    modified: now,
  });
  // phppostfixadmin creates a self-alias so Postfix can resolve delivery.
  await db.insert(alias).values({
    address: username,
    goto: username,
    domain: domainName,
    active,
    created: now,
    modified: now,
  });
  return getMailbox(db, username);
}

export async function updateMailbox(db: Db, address: string, opts: MailboxInput) {
  const username = address.trim().toLowerCase();
  await getMailbox(db, username); // throws if missing
  const set: Record<string, unknown> = { modified: new Date() };
  if (opts.name !== undefined) set.name = opts.name;
  if (opts.quotaMb !== undefined) set.quota = mbToBytes(opts.quotaMb);
  if (opts.active !== undefined) set.active = opts.active ? 1 : 0;
  if (opts.password !== undefined) {
    if (opts.password.length < 8) throw new OpError('Password must be at least 8 characters.');
    set.password = await hashWithScheme(opts.password, defaults.passwordScheme, defaults.bcryptRounds);
  }
  await db.update(mailbox).set(set).where(eq(mailbox.username, username));
  // Keep the self-alias active flag in sync.
  if (opts.active !== undefined) {
    await db
      .update(alias)
      .set({ active: opts.active ? 1 : 0, modified: new Date() })
      .where(and(eq(alias.address, username), eq(alias.goto, username)));
  }
  return getMailbox(db, username);
}

export async function deleteMailbox(db: Db, address: string) {
  const username = address.trim().toLowerCase();
  await getMailbox(db, username); // throws if missing
  await db.delete(alias).where(and(eq(alias.address, username), eq(alias.goto, username)));
  await db.delete(mailbox).where(eq(mailbox.username, username));
}
