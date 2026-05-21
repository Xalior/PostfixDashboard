import {
  bigint,
  datetime,
  index,
  int,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  tinyint,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * PostfixAdmin-compatible schema.
 *
 * Tables, column names, and types mirror phppostfixadmin so this project can
 * be pointed at an existing database without migration. See
 * `_ref/postfixadmin/public/upgrade.php` for the canonical definitions.
 *
 * Notes:
 *  - Booleans are stored as TINYINT(1) because that's what phppostfixadmin
 *    uses and what Postfix/Dovecot's SQL query maps expect.
 *  - `password` is stored in Dovecot's `{SCHEME}hash` form.
 *  - `alias.goto` is a newline/comma-separated recipient list (not normalised)
 *    because Postfix's virtual_alias_maps reads the column directly.
 */

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------
export const admin = mysqlTable('admin', {
  username: varchar('username', { length: 255 }).primaryKey(),
  password: varchar('password', { length: 255 }).notNull().default(''),
  superadmin: tinyint('superadmin').notNull().default(0),
  active: tinyint('active').notNull().default(1),
  phone: varchar('phone', { length: 255 }).notNull().default(''),
  emailOther: varchar('email_other', { length: 255 }).notNull().default(''),
  token: varchar('token', { length: 255 }).notNull().default(''),
  // TIMESTAMP can't default to epoch-zero; phppostfixadmin stores NULL when
  // no recovery token is outstanding.
  tokenValidity: timestamp('token_validity'),
  created: datetime('created').notNull(),
  modified: datetime('modified').notNull(),
});

// ---------------------------------------------------------------------------
// domain
// ---------------------------------------------------------------------------
export const domain = mysqlTable(
  'domain',
  {
    domain: varchar('domain', { length: 255 }).primaryKey(),
    description: varchar('description', { length: 255 }).notNull().default(''),
    aliases: int('aliases').notNull().default(0),
    mailboxes: int('mailboxes').notNull().default(0),
    maxquota: bigint('maxquota', { mode: 'number' }).notNull().default(0),
    quota: bigint('quota', { mode: 'number' }).notNull().default(0),
    transport: varchar('transport', { length: 255 }).notNull().default(''),
    backupmx: tinyint('backupmx').notNull().default(0),
    passwordExpiry: int('password_expiry').notNull().default(0),
    created: datetime('created').notNull(),
    modified: datetime('modified').notNull(),
    active: tinyint('active').notNull().default(1),
  },
  (t) => ({
    domainActive: index('domain_domain_active').on(t.domain, t.active),
  }),
);

// ---------------------------------------------------------------------------
// domain_admins — maps admins to domains. domain='ALL' flags a superadmin.
// ---------------------------------------------------------------------------
export const domainAdmins = mysqlTable(
  'domain_admins',
  {
    username: varchar('username', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 255 }).notNull(),
    created: datetime('created').notNull(),
    active: tinyint('active').notNull().default(1),
  },
  (t) => ({
    usernameIdx: index('username').on(t.username),
    pk: primaryKey({ columns: [t.username, t.domain] }),
  }),
);

// ---------------------------------------------------------------------------
// mailbox
// ---------------------------------------------------------------------------
export const mailbox = mysqlTable(
  'mailbox',
  {
    username: varchar('username', { length: 255 }).primaryKey(),
    password: varchar('password', { length: 255 }).notNull().default(''),
    name: varchar('name', { length: 255 }).notNull().default(''),
    maildir: varchar('maildir', { length: 255 }).notNull().default(''),
    quota: bigint('quota', { mode: 'number' }).notNull().default(0),
    localPart: varchar('local_part', { length: 255 }).notNull().default(''),
    domain: varchar('domain', { length: 255 }).notNull(),
    created: datetime('created').notNull(),
    modified: datetime('modified').notNull(),
    active: tinyint('active').notNull().default(1),
    phone: varchar('phone', { length: 255 }).notNull().default(''),
    emailOther: varchar('email_other', { length: 255 }).notNull().default(''),
    token: varchar('token', { length: 255 }).notNull().default(''),
    // Both nullable — MySQL TIMESTAMP can't represent epoch-zero, and
    // phppostfixadmin keeps these NULL when no recovery/expiry is set.
    tokenValidity: timestamp('token_validity'),
    passwordExpiry: timestamp('password_expiry'),
  },
  (t) => ({
    usernameActive: index('mailbox_username_active').on(t.username, t.active),
    domainIdx: index('mailbox_domain_idx').on(t.domain),
  }),
);

// ---------------------------------------------------------------------------
// alias
// ---------------------------------------------------------------------------
export const alias = mysqlTable(
  'alias',
  {
    address: varchar('address', { length: 255 }).primaryKey(),
    // `goto` is a reserved word in MySQL — Drizzle emits it quoted.
    goto: text('goto').notNull(),
    domain: varchar('domain', { length: 255 }).notNull(),
    created: datetime('created').notNull(),
    modified: datetime('modified').notNull(),
    active: tinyint('active').notNull().default(1),
  },
  (t) => ({
    addressActive: index('alias_address_active').on(t.address, t.active),
    domainIdx: index('alias_domain_idx').on(t.domain),
  }),
);

// ---------------------------------------------------------------------------
// alias_domain — entire domain -> domain aliasing
// ---------------------------------------------------------------------------
export const aliasDomain = mysqlTable(
  'alias_domain',
  {
    aliasDomain: varchar('alias_domain', { length: 255 }).primaryKey(),
    targetDomain: varchar('target_domain', { length: 255 }).notNull(),
    created: datetime('created').notNull(),
    modified: datetime('modified').notNull(),
    active: tinyint('active').notNull().default(1),
  },
  (t) => ({
    targetDomainIdx: index('alias_domain_target_idx').on(t.targetDomain),
    active: index('alias_domain_active').on(t.aliasDomain, t.active),
  }),
);

// ---------------------------------------------------------------------------
// vacation / vacation_notification
// ---------------------------------------------------------------------------
export const vacation = mysqlTable(
  'vacation',
  {
    email: varchar('email', { length: 255 }).primaryKey(),
    subject: varchar('subject', { length: 255 }).notNull().default(''),
    body: text('body').notNull(),
    domain: varchar('domain', { length: 255 }).notNull(),
    cache: text('cache').notNull(),
    created: datetime('created').notNull(),
    modified: datetime('modified').notNull(),
    activeFrom: datetime('activefrom').notNull(),
    activeUntil: datetime('activeuntil').notNull(),
    active: tinyint('active').notNull().default(1),
  },
  (t) => ({
    emailActive: index('vacation_email_active').on(t.email, t.active),
  }),
);

export const vacationNotification = mysqlTable(
  'vacation_notification',
  {
    onVacation: varchar('on_vacation', { length: 255 }).notNull(),
    notified: varchar('notified', { length: 255 }).notNull(),
    notifiedAt: timestamp('notified_at').notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.onVacation, t.notified] }),
  }),
);

// ---------------------------------------------------------------------------
// log — audit trail
// ---------------------------------------------------------------------------
export const log = mysqlTable(
  'log',
  {
    timestamp: datetime('timestamp').notNull(),
    username: varchar('username', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 255 }).notNull(),
    action: varchar('action', { length: 255 }).notNull(),
    data: text('data').notNull(),
  },
  (t) => ({
    timestampIdx: index('timestamp').on(t.timestamp),
    domainTimestampIdx: index('domain_timestamp').on(t.domain, t.timestamp),
  }),
);

// ---------------------------------------------------------------------------
// fetchmail
// ---------------------------------------------------------------------------
export const fetchmail = mysqlTable('fetchmail', {
  id: int('id').autoincrement().primaryKey(),
  mailbox: varchar('mailbox', { length: 255 }).notNull(),
  srcServer: varchar('src_server', { length: 255 }).notNull().default(''),
  srcAuth: varchar('src_auth', { length: 255 }).notNull().default('password'),
  srcUser: varchar('src_user', { length: 255 }).notNull().default(''),
  srcPassword: varchar('src_password', { length: 255 }).notNull().default(''),
  srcFolder: varchar('src_folder', { length: 255 }).notNull().default(''),
  pollTime: int('poll_time').notNull().default(10),
  fetchAll: tinyint('fetchall').notNull().default(0),
  keep: tinyint('keep').notNull().default(0),
  protocol: varchar('protocol', { length: 255 }).notNull().default('IMAP'),
  useSsl: tinyint('usessl').notNull().default(0),
  sslCertCk: tinyint('sslcertck').notNull().default(0),
  sslCertPath: varchar('sslcertpath', { length: 255 }).notNull().default(''),
  sslFingerprint: varchar('sslfingerprint', { length: 255 }).notNull().default(''),
  extraOptions: text('extra_options').notNull(),
  mda: varchar('mda', { length: 255 }).notNull().default(''),
  returnedText: text('returned_text').notNull(),
  date: timestamp('date').notNull().defaultNow(),
  active: tinyint('active').notNull().default(1),
  domain: varchar('domain', { length: 255 }).notNull().default(''),
  created: datetime('created').notNull(),
  modified: datetime('modified').notNull(),
});

// ---------------------------------------------------------------------------
// Quota tables — live mailbox usage written by Dovecot
// ---------------------------------------------------------------------------
export const quota = mysqlTable(
  'quota',
  {
    username: varchar('username', { length: 255 }).notNull(),
    path: varchar('path', { length: 100 }).notNull(),
    current: bigint('current', { mode: 'number' }).notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.username, t.path] }),
  }),
);

export const quota2 = mysqlTable('quota2', {
  username: varchar('username', { length: 100 }).primaryKey(),
  bytes: bigint('bytes', { mode: 'number' }).notNull().default(0),
  messages: int('messages').notNull().default(0),
});

// ---------------------------------------------------------------------------
// config — version + schema metadata (phppostfixadmin upgrade system)
// ---------------------------------------------------------------------------
export const config = mysqlTable('config', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 20 }).notNull(),
  value: varchar('value', { length: 20 }).notNull(),
});

// ---------------------------------------------------------------------------
// DKIM
// ---------------------------------------------------------------------------
export const dkim = mysqlTable('dkim', {
  id: int('id').autoincrement().primaryKey(),
  domainName: varchar('domain_name', { length: 255 }).notNull(),
  selector: varchar('selector', { length: 255 }).notNull(),
  privateKey: text('private_key').notNull(),
  publicKey: text('public_key').notNull(),
  description: varchar('description', { length: 255 }).notNull().default(''),
});

export const dkimSigning = mysqlTable('dkim_signing', {
  id: int('id').autoincrement().primaryKey(),
  domainName: varchar('domain_name', { length: 255 }).notNull(),
  dkimId: int('dkim_id').notNull(),
  active: tinyint('active').notNull().default(1),
});

// ---------------------------------------------------------------------------
// Type helpers for the rest of the app.
// ---------------------------------------------------------------------------
export type Admin = typeof admin.$inferSelect;
export type NewAdmin = typeof admin.$inferInsert;
export type Domain = typeof domain.$inferSelect;
export type NewDomain = typeof domain.$inferInsert;
export type Mailbox = typeof mailbox.$inferSelect;
export type NewMailbox = typeof mailbox.$inferInsert;
export type Alias = typeof alias.$inferSelect;
export type NewAlias = typeof alias.$inferInsert;
export type AliasDomain = typeof aliasDomain.$inferSelect;
export type NewAliasDomain = typeof aliasDomain.$inferInsert;
export type Vacation = typeof vacation.$inferSelect;
export type LogEntry = typeof log.$inferSelect;
export type NewLogEntry = typeof log.$inferInsert;
export type DomainAdmin = typeof domainAdmins.$inferSelect;
export type NewDomainAdmin = typeof domainAdmins.$inferInsert;
