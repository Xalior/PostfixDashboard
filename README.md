# Postfix Dashboard

A modern, docker-first reimplementation of [phppostfixadmin](https://github.com/postfixadmin/postfixadmin)
— same database model, same Postfix/Dovecot integration, completely rebuilt in **Next.js 15 (App
Router + React Server Components)**, **react-bootstrap 5**, and **Drizzle ORM** on MySQL.

If you've ever wrestled with `config.inc.php`, Apache aliases, and PHP paths just to get a mail
admin panel running, this is for you. The whole thing is configured via environment variables and
ships in a single container.

## Highlights

- **Drop-in database compatibility** — the Drizzle schema mirrors phppostfixadmin's exact table
  and column names. You can point this at an existing postfixadmin DB and it just works.
- **Dovecot-compatible password column** — stored as `{SCHEME}hash`. New hashes default to
  `{BLF-CRYPT}` (bcrypt, which Dovecot verifies natively). Legacy `{SHA512-CRYPT}` **and
  `{MD5-CRYPT}` / `$1$`** hashes (the latter being what phppostfixadmin writes in `md5crypt`
  mode) still validate — verified read-only, never silently rehashed or upgraded on login.
- **Embedded management CLI** — `docker exec <container> cli …` for headless domain/mailbox
  CRUD, mirroring phppostfixadmin's `postfixadmin-cli`. Same writes as the web UI. See
  [Command-line interface](#command-line-interface).
- **phppostfixadmin-compatible maildir** — the stored `mailbox.maildir` is **relative**
  (`domain/localpart/`), exactly what phppostfixadmin writes, so a single Postfix/Dovecot
  config serves mailboxes created by either UI.
- **Zero-PHP, zero-config-file deployment** — set env vars, run one container.
- **Dark / light / system theme** driven entirely by Bootstrap 5 CSS variables, so future
  rebranding is a matter of overriding `--bs-*`.
- **React Server Components everywhere** — client-side JS is limited to interactive widgets
  (theme toggle, form state, modals).
- **Role-aware routing** — superadmin, domain admin, and mailbox-user flows all in one app.
- **Audit log** — every write action records to the same `log` table phppostfixadmin uses.

## Feature parity (current status)

| phppostfixadmin feature          | status in this port |
| -------------------------------- | ------------------- |
| Domain CRUD                      | ✅                  |
| Mailbox CRUD (with maildir)      | ✅                  |
| Alias CRUD (multi-recipient)     | ✅                  |
| Alias-domain (domain → domain)   | ✅                  |
| Admin CRUD + role assignment     | ✅                  |
| Domain-admin scoping             | ✅                  |
| Audit log / viewer               | ✅                  |
| Mailbox-user self service        | ✅                  |
| Change-own-password              | ✅                  |
| Vacation / autoreply             | ✅                  |
| Quota tracking (reads quota2)    | ✅                  |
| Headless CLI (`postfixadmin-cli`)| ✅ domain + mailbox |
| Fetchmail                        | 🚧 schema only      |
| DKIM key management              | 🚧 schema only      |
| TOTP / MFA                       | ❌ planned          |
| Broadcast / sendmail             | ❌ planned          |
| Password recovery via email/SMS  | ❌ planned          |

## Requirements

- Docker + Docker Compose (the easy path), or
- Node.js 22+ and a MySQL 8 instance you control (local dev)

## Quick start with Docker

```bash
cp .env.example .env
# Edit .env — at minimum set SESSION_SECRET (openssl rand -base64 48)

docker compose up -d db
docker compose run --rm tools npm run db:push      # apply schema
docker compose run --rm tools npm run db:seed      # create first superadmin
docker compose up -d app
```

Open http://localhost:3000 and sign in with the seeded superadmin
(defaults: `admin@example.com` / `ChangeMe123!` — override via
`SEED_SUPERADMIN_USERNAME` / `SEED_SUPERADMIN_PASSWORD` in `.env`).

### Prebuilt image

Multi-arch images (amd64 + arm64) are published to GitHub Container Registry by CI:

```bash
docker pull ghcr.io/xalior/postfixdashboard:latest
```

The CLI is baked into this image (see below), so the same container serves the web UI and
headless management — no separate tools image needed at runtime.

## Local development

```bash
npm install
cp .env.example .env.local
# Point DATABASE_URL at a local MySQL 8 instance

npm run db:push        # create/update tables
npm run db:seed        # create first superadmin
npm run dev
```

Dev server runs on http://localhost:3000.

## Pointing it at an existing postfixadmin database

Back up your DB first, then:

```bash
DATABASE_URL=mysql://postfix:postfix@mail.example.com:3306/postfix npm run dev
```

No schema migration required — this project reads the same tables. A handful of columns (`domain.password_expiry`, `mailbox.local_part`, etc.) are expected to be present; if your DB is on a very old phppostfixadmin version, run `npm run db:push` first against a **copy** of the DB to let drizzle-kit reconcile the minor differences.

## Command-line interface

A headless CLI mirrors phppostfixadmin's `postfixadmin-cli` for scripting, cron, and bulk ops. It
is **bundled into the application image**, so you run it against the running container with
`docker exec` (it inherits the container's `DATABASE_URL`, so no extra config):

```bash
docker exec <container> cli domain view
docker exec <container> cli domain add example.com --mailboxes 20 --active 1
docker exec <container> cli mailbox add jo@example.com --password 's3cret...' --name "Jo" --quota 200
docker exec <container> cli mailbox view example.com          # or: mailbox view jo@example.com
docker exec <container> cli mailbox update jo@example.com --quota 500
docker exec <container> cli domain delete example.com         # cascades mailboxes + aliases
```

`cli` is an alias for `pfd-cli`; both are on the image's `PATH`. Locally (dev), use
`npm run cli -- <module> <task> …`.

```
Modules: domain, mailbox      Tasks: view  add  update  delete

  domain  view [<domain>] | add <domain> [--description x] [--aliases n] [--mailboxes n]
                            [--maxquota MB] [--quota MB] [--transport x] [--backupmx 0|1] [--active 0|1]
  mailbox view [<addr>]   | add <addr> --password X [--password2 X] [--name "…"] [--quota MB] [--active 0|1]
          ( view with no identifier lists; `mailbox view --domain example.com` filters by domain )
```

The CLI shares its logic with the web UI (`lib/cli/ops.ts`), so it writes identically: relative
maildir, `{BLF-CRYPT}` passwords, the mailbox self-alias, and the same validation/limit/quota
checks. `admin`, `alias`, and `aliasdomain` modules are planned follow-ups.

## Configuration

Everything is env-driven. See [`.env.example`](./.env.example) for the full list. Key variables:

| Variable                     | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`               | MySQL connection string. Takes precedence over `DB_*`.                   |
| `SESSION_SECRET`             | **Required.** 32+ byte secret used to sign the session JWT.              |
| `SESSION_MAX_AGE`            | Session lifetime in seconds (default 8h).                                |
| `PASSWORD_SCHEME`            | Hash scheme for new passwords. `BLF-CRYPT` (default) or `PLAIN`.         |
| `BCRYPT_ROUNDS`              | Bcrypt work factor (default 12).                                         |
| `MAILDIR_TEMPLATE`           | Maildir template. Default `{domain}/{local}/` (**relative**, matches phppostfixadmin). Tokens: `{domain}`, `{local}`, `{user}` (full address). Keep it relative — the base path belongs in Postfix `virtual_mailbox_base` / Dovecot `mail_location`. |
| `DEFAULT_MAILBOX_QUOTA_MB`   | Default per-mailbox quota in MB.                                         |
| `DEFAULT_DOMAIN_MAILBOXES`   | Default per-domain mailbox limit for new domains.                        |
| `DEFAULT_DOMAIN_ALIASES`     | Default per-domain alias limit for new domains.                          |
| `DEFAULT_DOMAIN_QUOTA_MB`    | Default total domain quota in MB.                                        |
| `FEATURE_VACATION`           | Toggle vacation/autoreply UI.                                            |
| `VACATION_DOMAIN`            | Autoreply-routing domain (same convention as phppostfixadmin).           |
| `BRAND_NAME`                 | Shown in nav, titles, and emails.                                        |
| `DEFAULT_THEME`              | `system`, `light`, or `dark`.                                            |

## Architecture overview

```
app/                  # Next.js App Router
  login/              # public sign-in
  dashboard/          # admin home
  domains/            # domain CRUD (superadmin + domain admin)
  mailboxes/          # mailbox CRUD
  aliases/            # alias CRUD
  alias-domains/      # domain -> domain mapping
  admins/             # superadmin-only admin management
  logs/               # audit-log viewer
  me/                 # mailbox-user self service
components/
  layout/             # AppShell, TopNav
  theme/              # ThemeProvider, ThemeToggle
  ui/                 # StatusPill, QuotaBar, ConfirmButton, PageHeader
lib/
  db/                 # Drizzle schema + connection pool
  auth/
    crypt.ts          # pure {SCHEME}hash verify/hash (bcrypt, sha512-crypt, md5crypt) — unit-tested
    password.ts       # server-only wrapper wiring crypt.ts to env
    session.ts        # signed-JWT session; current-user.ts
  actions/            # server actions for every mutation
  cli/
    ops.ts            # pure domain/mailbox CRUD ops, shared by the CLI
  mailbox-path.ts     # relative maildir builder (phppostfixadmin-compatible) — unit-tested
  queries.ts          # shared read helpers (dashboard, lists)
  audit.ts            # writes to the `log` table
  env.ts              # single source of truth for config
  format.ts           # pure formatters (bytes, dates, goto summary)
scripts/
  seed.ts             # creates the first superadmin
  cli.ts              # headless management CLI (bundled into the image as cli.cjs)
styles/
  globals.scss        # bootstrap import + CSS-var-driven chrome
```

Tests live alongside the pure modules (`*.test.ts`); run them with `npm test`
(Node's built-in test runner via `tsx`). `npm run typecheck` and `npm run build` must stay green.

### Design choices

- **Server Components by default, `'use client'` only when necessary.** Pages render on the
  server, touch the DB directly, and stream HTML. Interactive widgets (forms, dropdowns, theme
  toggle, confirm modals) are the only client islands.
- **Session via a signed JWT cookie (jose)** — small payload (just `sub`/`role`), re-fetches the
  backing admin/mailbox row on every request that needs it so revocation is instant.
- **All colours come from Bootstrap CSS custom properties.** No hex values in our own styles.
  Switch themes by overriding `--bs-*` vars on `[data-bs-theme="dark"]` / `:root`.
- **Audit everything.** Every server action ends with an `audit()` call writing to the `log`
  table, using the same action-name convention phppostfixadmin uses (`create_mailbox`,
  `edit_alias`, ...).
- **No hidden magic.** All config comes from environment variables, validated at startup in
  `lib/env.ts`. No `config.inc.php`, no include path hunts, no Smarty template directories.

## Integration with Postfix & Dovecot

Because the DB schema is identical to phppostfixadmin's, any existing Postfix/Dovecot SQL query
configuration continues to work. Point your `virtual_mailbox_maps`, `virtual_alias_maps`, etc. at
the same database. The password column uses the `{SCHEME}hash` format Dovecot expects.

See the upstream phppostfixadmin docs for the canonical Postfix & Dovecot query files — every
column and table they reference exists here with the same name.

## What's deliberately missing

- **i18n.** English only for now. The schema and log actions are language-neutral, so adding
  translations later is straightforward.
- **TOTP / app passwords.** Planned; not in this cut.
- **XML-RPC API.** Not planned — use HTTP + server actions.
- **Setup wizard.** Replaced by env vars + `db:seed`. If you can run `docker compose up`, you
  don't need a setup wizard.

## License

GPL-2.0, to match upstream phppostfixadmin.
