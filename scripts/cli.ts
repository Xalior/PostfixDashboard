#!/usr/bin/env tsx
/**
 * PostfixDashboard CLI — headless domain/mailbox management, mirroring
 * phppostfixadmin's `postfixadmin-cli` grammar:
 *
 *   tsx scripts/cli.ts <module> <task> [<identifier>] [--option value ...]
 *
 * Modules: domain, mailbox        Tasks: view, add, update, delete, help
 *
 * `view` with no identifier lists all items. All writes go through lib/cli/ops
 * (the same logic the web UI uses): relative maildir, {BLF-CRYPT} passwords,
 * mailbox self-alias, identical validation/limits.
 *
 * DB connection from DATABASE_URL (or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/
 * DB_NAME), same as drizzle.config.ts.
 */
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { join } from 'node:path';

import * as ops from '@/lib/cli/ops';
import { OpError } from '@/lib/cli/ops';

function dbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const u = process.env.DB_USER, p = process.env.DB_PASSWORD, n = process.env.DB_NAME;
  if (!u || !p || !n) {
    fail('No DATABASE_URL (or DB_USER/DB_PASSWORD/DB_NAME) set.');
  }
  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '3306';
  return `mysql://${encodeURIComponent(u!)}:${encodeURIComponent(p!)}@${host}:${port}/${n}`;
}

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseBool(v: string, flag: string): boolean {
  const s = v.toLowerCase();
  if (['1', 'true', 'yes', 'on', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'off', 'n'].includes(s)) return false;
  fail(`--${flag} expects a boolean (1/0, yes/no, true/false), got "${v}"`);
}

function parseInt10(v: string, flag: string): number {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) fail(`--${flag} expects an integer, got "${v}"`);
  return n;
}

/** Split argv into a positional identifier + a --key/value option map. */
function parseArgs(rest: string[]): { id?: string; opts: Map<string, string> } {
  const opts = new Map<string, string>();
  let id: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        opts.set(body.slice(0, eq), body.slice(eq + 1));
      } else {
        const next = rest[i + 1];
        if (next === undefined || next.startsWith('--')) opts.set(body, 'true'); // bare flag
        else { opts.set(body, next); i++; }
      }
    } else if (id === undefined) {
      id = a;
    }
  }
  return { id, opts };
}

const USAGE = `PostfixDashboard CLI

Usage:
    cli <module> <task> [<identifier>] [--option value ...]
    cli <init|seed>

Modules: domain, mailbox, admin     Tasks: view  add  update  delete  help

Bootstrap (works on a virgin DB and is a safe no-op on a legacy one):
  init                              create the schema if it isn't there yet
  seed [<username>] [--password X]  create the first superadmin if none exist
                                    (falls back to SEED_SUPERADMIN_USERNAME/PASSWORD)

  domain view [<domain>]
  domain add <domain> [--description x] [--aliases n] [--mailboxes n]
                      [--maxquota MB] [--quota MB] [--transport x]
                      [--backupmx 0|1] [--active 0|1]
  domain update <domain> [same options as add]
  domain delete <domain>            (cascades: mailboxes + aliases + domain)

  mailbox view [<address>]
  mailbox add <address> --password X [--password2 X] [--name "Full Name"]
                        [--quota MB] [--active 0|1]
  mailbox update <address> [--password X] [--name x] [--quota MB] [--active 0|1]
  mailbox delete <address>

  admin view [<email>]
  admin add <email> --password X [--password2 X] [--superadmin 0|1] [--active 0|1]
                    [--domains "a.com,b.com"]
  admin update <email> [--password X] [--superadmin 0|1] [--active 0|1] [--domains "..."]
  admin delete <email>
`;

function fmtBytesMb(b: number): string {
  return `${Math.round(Number(b) / 1024 / 1024)}MB`;
}

function printDomain(d: Awaited<ReturnType<typeof ops.getDomain>>) {
  console.log(`domain      : ${d.domain}`);
  console.log(`description : ${d.description}`);
  console.log(`aliases     : ${d.aliases}`);
  console.log(`mailboxes   : ${d.mailboxes}`);
  console.log(`maxquota    : ${fmtBytesMb(d.maxquota)} (per mailbox)`);
  console.log(`quota       : ${fmtBytesMb(d.quota)} (domain total)`);
  console.log(`backupmx    : ${d.backupmx ? 'YES' : 'NO'}`);
  console.log(`active      : ${d.active ? 'YES' : 'NO'}`);
}

function printMailbox(m: Awaited<ReturnType<typeof ops.getMailbox>>) {
  console.log(`username : ${m.username}`);
  console.log(`name     : ${m.name}`);
  console.log(`maildir  : ${m.maildir}`);
  console.log(`quota    : ${fmtBytesMb(m.quota)}`);
  console.log(`scheme   : ${/^\{([A-Z0-9-]+)\}/.exec(m.password)?.[1] ?? 'CRYPT'}`);
  console.log(`active   : ${m.active ? 'YES' : 'NO'}`);
}

function domainInput(opts: Map<string, string>): ops.DomainInput {
  const o: ops.DomainInput = {};
  if (opts.has('description')) o.description = opts.get('description');
  if (opts.has('aliases')) o.aliases = parseInt10(opts.get('aliases')!, 'aliases');
  if (opts.has('mailboxes')) o.mailboxes = parseInt10(opts.get('mailboxes')!, 'mailboxes');
  if (opts.has('maxquota')) o.maxquotaMb = parseInt10(opts.get('maxquota')!, 'maxquota');
  if (opts.has('quota')) o.quotaMb = parseInt10(opts.get('quota')!, 'quota');
  if (opts.has('transport')) o.transport = opts.get('transport');
  if (opts.has('backupmx')) o.backupmx = parseBool(opts.get('backupmx')!, 'backupmx');
  if (opts.has('active')) o.active = parseBool(opts.get('active')!, 'active');
  return o;
}

function mailboxInput(opts: Map<string, string>): ops.MailboxInput {
  if (opts.has('password') && opts.has('password2') && opts.get('password') !== opts.get('password2')) {
    fail('--password and --password2 do not match.');
  }
  const o: ops.MailboxInput = {};
  if (opts.has('password')) o.password = opts.get('password');
  if (opts.has('name')) o.name = opts.get('name');
  if (opts.has('quota')) o.quotaMb = parseInt10(opts.get('quota')!, 'quota');
  if (opts.has('active')) o.active = parseBool(opts.get('active')!, 'active');
  return o;
}

function printAdmin(a: Awaited<ReturnType<typeof ops.getAdmin>>) {
  console.log(`username   : ${a.username}`);
  console.log(`superadmin : ${a.superadmin ? 'YES' : 'NO'}`);
  console.log(`active     : ${a.active ? 'YES' : 'NO'}`);
}

function adminInput(opts: Map<string, string>): ops.AdminInput {
  if (opts.has('password') && opts.has('password2') && opts.get('password') !== opts.get('password2')) {
    fail('--password and --password2 do not match.');
  }
  const o: ops.AdminInput = {};
  if (opts.has('password')) o.password = opts.get('password');
  if (opts.has('superadmin')) o.superadmin = parseBool(opts.get('superadmin')!, 'superadmin');
  if (opts.has('active')) o.active = parseBool(opts.get('active')!, 'active');
  if (opts.has('domains')) {
    o.domains = opts.get('domains')!.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return o;
}

async function main() {
  const [module, task, ...rest] = process.argv.slice(2);
  if (!module || module === 'help' || module === '--help' || module === '-h') {
    console.log(USAGE);
    process.exit(module ? 0 : 1);
  }
  // Bootstrap commands (no module/task): `cli init`, `cli seed [user] --password X`.
  if (module === 'init' || module === 'seed') {
    const conn = await mysql.createPool(dbUrl());
    const db = drizzle(conn);
    try {
      if (module === 'init') {
        const dir = process.env.DRIZZLE_DIR || join(process.cwd(), 'drizzle');
        const r = await ops.initSchema(db, dir);
        console.log(r === 'created' ? 'Schema created.' : 'Schema already present — nothing to do.');
      } else {
        const { id, opts } = parseArgs([task, ...rest].filter((x): x is string => Boolean(x)));
        const user = id || process.env.SEED_SUPERADMIN_USERNAME || 'admin@example.com';
        const pass = opts.get('password') || process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMe123!';
        const r = await ops.seedSuperadmin(db, user, pass);
        console.log(r === 'created' ? `Superadmin ${user} created.` : 'Admins already exist — nothing to do.');
      }
    } catch (e) {
      if (e instanceof OpError) fail(e.message);
      throw e;
    } finally {
      await conn.end();
    }
    return;
  }

  if (!['domain', 'mailbox', 'admin'].includes(module)) {
    fail(`unknown command "${module}" (try: domain, mailbox, admin, init, seed)`);
  }
  if (!task || task === 'help') { console.log(USAGE); process.exit(0); }
  if (!['view', 'add', 'update', 'delete'].includes(task)) fail(`unknown task "${task}" (try: view, add, update, delete)`);

  const { id, opts } = parseArgs(rest);
  const conn = await mysql.createPool(dbUrl());
  const db = drizzle(conn);

  try {
    if (module === 'domain') {
      if (task === 'view') {
        if (id) { printDomain(await ops.getDomain(db, id)); }
        else {
          const rows = await ops.listDomains(db);
          if (rows.length === 0) console.log('(no domains)');
          for (const d of rows) console.log(`${d.active ? ' ' : '!'} ${d.domain}\t${d.mailboxes ? d.mailboxes : '∞'} mbx\t${d.description}`);
        }
      } else if (task === 'add') {
        if (!id) fail('domain add requires a <domain>.');
        printDomain(await ops.createDomain(db, id, domainInput(opts)));
        console.log(`\nDomain ${id} added.`);
      } else if (task === 'update') {
        if (!id) fail('domain update requires a <domain>.');
        printDomain(await ops.updateDomain(db, id, domainInput(opts)));
        console.log(`\nDomain ${id} updated.`);
      } else if (task === 'delete') {
        if (!id) fail('domain delete requires a <domain>.');
        await ops.deleteDomain(db, id);
        console.log(`Domain ${id} deleted (mailboxes + aliases cascaded).`);
      }
    } else if (module === 'mailbox') {
      if (task === 'view') {
        if (id) { printMailbox(await ops.getMailbox(db, id)); }
        else {
          const rows = await ops.listMailboxes(db, opts.get('domain'));
          if (rows.length === 0) console.log('(no mailboxes)');
          for (const m of rows) console.log(`${m.active ? ' ' : '!'} ${m.username}\t${fmtBytesMb(m.quota)}\t${m.name}`);
        }
      } else if (task === 'add') {
        if (!id) fail('mailbox add requires an <address>.');
        printMailbox(await ops.createMailbox(db, id, mailboxInput(opts)));
        console.log(`\nMailbox ${id} added.`);
      } else if (task === 'update') {
        if (!id) fail('mailbox update requires an <address>.');
        printMailbox(await ops.updateMailbox(db, id, mailboxInput(opts)));
        console.log(`\nMailbox ${id} updated.`);
      } else if (task === 'delete') {
        if (!id) fail('mailbox delete requires an <address>.');
        await ops.deleteMailbox(db, id);
        console.log(`Mailbox ${id} deleted.`);
      }
    } else {
      // admin
      if (task === 'view') {
        if (id) { printAdmin(await ops.getAdmin(db, id)); }
        else {
          const rows = await ops.listAdmins(db);
          if (rows.length === 0) console.log('(no admins)');
          for (const a of rows) console.log(`${a.active ? ' ' : '!'} ${a.username}\t${a.superadmin ? 'superadmin' : 'admin'}`);
        }
      } else if (task === 'add') {
        if (!id) fail('admin add requires an <email>.');
        printAdmin(await ops.createAdmin(db, id, adminInput(opts)));
        console.log(`\nAdmin ${id} added.`);
      } else if (task === 'update') {
        if (!id) fail('admin update requires an <email>.');
        printAdmin(await ops.updateAdmin(db, id, adminInput(opts)));
        console.log(`\nAdmin ${id} updated.`);
      } else if (task === 'delete') {
        if (!id) fail('admin delete requires an <email>.');
        await ops.deleteAdmin(db, id);
        console.log(`Admin ${id} deleted.`);
      }
    }
  } catch (e) {
    if (e instanceof OpError) fail(e.message);
    throw e;
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
