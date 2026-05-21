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
    tsx scripts/cli.ts <module> <task> [<identifier>] [--option value ...]

Modules: domain, mailbox
Tasks:   view  add  update  delete  help

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

async function main() {
  const [module, task, ...rest] = process.argv.slice(2);
  if (!module || module === 'help' || module === '--help' || module === '-h') {
    console.log(USAGE);
    process.exit(module ? 0 : 1);
  }
  if (!['domain', 'mailbox'].includes(module)) fail(`unknown module "${module}" (try: domain, mailbox)`);
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
    } else {
      // mailbox
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
    }
  } catch (e) {
    if (e instanceof OpError) fail(e.message);
    throw e;
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
