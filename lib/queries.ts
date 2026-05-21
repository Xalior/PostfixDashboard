import 'server-only';

import { and, count, desc, eq, inArray, like, or, sql, sum } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  alias,
  aliasDomain,
  domain,
  domainAdmins,
  log,
  mailbox,
} from '@/lib/db/schema';
import type { CurrentUser } from '@/lib/auth/current-user';

/**
 * Helpers shared across pages.
 *
 * All `listXxx` helpers take the current user so they can scope results:
 *  - superadmins see everything
 *  - domain admins see only their `allowedDomains`
 *  - mailbox users see only their own mailbox/domain (not handled here —
 *    those pages use /me/...)
 */

export function domainFilter(user: CurrentUser, column: any) {
  if (user.kind !== 'admin') {
    throw new Error('domainFilter called with a non-admin user');
  }
  if (user.isSuperadmin) return undefined;
  const allowed = user.allowedDomains ?? [];
  if (allowed.length === 0) return sql`1 = 0`;
  return inArray(column, allowed);
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export async function dashboardStats(user: CurrentUser) {
  if (user.kind !== 'admin') throw new Error('admin only');

  const dFilter = domainFilter(user, domain.domain);
  const mFilter = domainFilter(user, mailbox.domain);
  const aFilter = domainFilter(user, alias.domain);

  const [domainCountRow] = await db
    .select({ value: count() })
    .from(domain)
    .where(dFilter);
  const [mailboxCountRow] = await db
    .select({ value: count() })
    .from(mailbox)
    .where(mFilter);
  const [aliasCountRow] = await db
    .select({ value: count() })
    .from(alias)
    .where(aFilter);
  const [quotaRow] = await db
    .select({ value: sum(mailbox.quota) })
    .from(mailbox)
    .where(mFilter);

  return {
    domains: Number(domainCountRow?.value ?? 0),
    mailboxes: Number(mailboxCountRow?.value ?? 0),
    aliases: Number(aliasCountRow?.value ?? 0),
    allocatedQuotaBytes: Number(quotaRow?.value ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Domain list with aggregates
// ---------------------------------------------------------------------------

export interface DomainListRow {
  domain: string;
  description: string;
  aliases: number;
  mailboxes: number;
  maxquota: number;
  quota: number;
  active: boolean;
  backupmx: boolean;
  mailboxCount: number;
  aliasCount: number;
  usedQuotaBytes: number;
}

export async function listDomains(user: CurrentUser, search?: string): Promise<DomainListRow[]> {
  if (user.kind !== 'admin') throw new Error('admin only');

  const base = db
    .select({
      d: domain,
      mailboxCount: sql<number>`(
        SELECT COUNT(*) FROM ${mailbox} WHERE ${mailbox.domain} = ${domain.domain}
      )`.as('mailboxCount'),
      aliasCount: sql<number>`(
        SELECT COUNT(*) FROM ${alias}
        WHERE ${alias.domain} = ${domain.domain}
          AND ${alias.address} NOT IN (SELECT ${mailbox.username} FROM ${mailbox})
      )`.as('aliasCount'),
      usedQuotaBytes: sql<number>`(
        SELECT COALESCE(SUM(${mailbox.quota}), 0) FROM ${mailbox}
        WHERE ${mailbox.domain} = ${domain.domain}
      )`.as('usedQuotaBytes'),
    })
    .from(domain);

  const conditions: any[] = [];
  const df = domainFilter(user, domain.domain);
  if (df) conditions.push(df);
  if (search) conditions.push(like(domain.domain, `%${search}%`));
  const rows = await (conditions.length
    ? base.where(and(...conditions))
    : base
  ).orderBy(domain.domain);

  return rows.map((r) => ({
    domain: r.d.domain,
    description: r.d.description,
    aliases: r.d.aliases,
    mailboxes: r.d.mailboxes,
    maxquota: Number(r.d.maxquota),
    quota: Number(r.d.quota),
    active: r.d.active === 1,
    backupmx: r.d.backupmx === 1,
    mailboxCount: Number(r.mailboxCount ?? 0),
    aliasCount: Number(r.aliasCount ?? 0),
    usedQuotaBytes: Number(r.usedQuotaBytes ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Single-domain helpers
// ---------------------------------------------------------------------------

export async function getDomain(user: CurrentUser, name: string) {
  if (user.kind !== 'admin') throw new Error('admin only');
  const [row] = await db.select().from(domain).where(eq(domain.domain, name)).limit(1);
  if (!row) return null;
  if (!user.isSuperadmin && !(user.allowedDomains ?? []).includes(row.domain)) {
    return null;
  }
  return row;
}

// ---------------------------------------------------------------------------
// Mailbox list
// ---------------------------------------------------------------------------

export interface MailboxListRow {
  username: string;
  name: string;
  domain: string;
  quota: number;
  active: boolean;
  created: Date;
}

export async function listMailboxes(
  user: CurrentUser,
  opts: { domain?: string; search?: string } = {},
): Promise<MailboxListRow[]> {
  if (user.kind !== 'admin') throw new Error('admin only');

  const conditions: any[] = [];
  const df = domainFilter(user, mailbox.domain);
  if (df) conditions.push(df);
  if (opts.domain) conditions.push(eq(mailbox.domain, opts.domain));
  if (opts.search) {
    conditions.push(
      or(like(mailbox.username, `%${opts.search}%`), like(mailbox.name, `%${opts.search}%`)),
    );
  }

  const base = db
    .select({
      username: mailbox.username,
      name: mailbox.name,
      domain: mailbox.domain,
      quota: mailbox.quota,
      active: mailbox.active,
      created: mailbox.created,
    })
    .from(mailbox);

  const rows = await (conditions.length
    ? base.where(and(...conditions))
    : base
  ).orderBy(mailbox.username);

  return rows.map((r) => ({ ...r, quota: Number(r.quota), active: r.active === 1 }));
}

// ---------------------------------------------------------------------------
// Alias list
// ---------------------------------------------------------------------------

export interface AliasListRow {
  address: string;
  goto: string;
  domain: string;
  active: boolean;
  isMailbox: boolean;
  created: Date;
}

export async function listAliases(
  user: CurrentUser,
  opts: { domain?: string; search?: string; includeMailbox?: boolean } = {},
): Promise<AliasListRow[]> {
  if (user.kind !== 'admin') throw new Error('admin only');

  const conditions: any[] = [];
  const df = domainFilter(user, alias.domain);
  if (df) conditions.push(df);
  if (opts.domain) conditions.push(eq(alias.domain, opts.domain));
  if (opts.search) {
    conditions.push(or(like(alias.address, `%${opts.search}%`), like(alias.goto, `%${opts.search}%`)));
  }
  if (!opts.includeMailbox) {
    conditions.push(sql`${alias.address} NOT IN (SELECT ${mailbox.username} FROM ${mailbox})`);
  }

  const base = db
    .select({
      address: alias.address,
      goto: alias.goto,
      domain: alias.domain,
      active: alias.active,
      created: alias.created,
      isMailbox: sql<number>`(
        CASE WHEN EXISTS (SELECT 1 FROM ${mailbox} WHERE ${mailbox.username} = ${alias.address})
             THEN 1 ELSE 0 END
      )`.as('isMailbox'),
    })
    .from(alias);

  const rows = await (conditions.length
    ? base.where(and(...conditions))
    : base
  ).orderBy(alias.address);

  return rows.map((r) => ({ ...r, active: r.active === 1, isMailbox: r.isMailbox === 1 }));
}

// ---------------------------------------------------------------------------
// Alias-domain list
// ---------------------------------------------------------------------------

export async function listAliasDomains(user: CurrentUser) {
  if (user.kind !== 'admin') throw new Error('admin only');
  const conditions: any[] = [];
  const df = domainFilter(user, aliasDomain.targetDomain);
  if (df) conditions.push(df);
  const base = db.select().from(aliasDomain);
  const rows = await (conditions.length ? base.where(and(...conditions)) : base).orderBy(
    aliasDomain.aliasDomain,
  );
  return rows.map((r) => ({ ...r, active: r.active === 1 }));
}

// ---------------------------------------------------------------------------
// Log list
// ---------------------------------------------------------------------------

export async function listLogs(user: CurrentUser, limit = 200) {
  if (user.kind !== 'admin') throw new Error('admin only');
  const df = domainFilter(user, log.domain);
  const base = db.select().from(log);
  const rows = await (df ? base.where(df) : base).orderBy(desc(log.timestamp)).limit(limit);
  return rows;
}

