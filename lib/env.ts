import 'server-only';

import { DEFAULT_MAILDIR_TEMPLATE } from '@/lib/mailbox-path';

/**
 * Centralised env-var access. Throws loudly at startup if something critical
 * is missing — the whole point of this project is to make configuration
 * a single predictable thing instead of the phppostfixadmin config.inc.php
 * path-hunt.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function requiredMinLen(name: string, minLen: number): string {
  const value = required(name);
  if (value.length < minLen) {
    throw new Error(
      `${name} must be at least ${minLen} characters (got ${value.length}). ` +
        `Generate one with: openssl rand -base64 48`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Env var ${name} must be an integer, got "${raw}"`);
  }
  return n;
}

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = optional('DB_HOST', 'localhost');
  const port = optional('DB_PORT', '3306');
  const user = required('DB_USER');
  const pass = required('DB_PASSWORD');
  const name = required('DB_NAME');
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

export const env = {
  databaseUrl: databaseUrl(),

  session: {
    secret: requiredMinLen('SESSION_SECRET', 32),
    cookieName: optional('SESSION_COOKIE_NAME', 'postfix_dashboard_session'),
    maxAgeSec: int('SESSION_MAX_AGE', 60 * 60 * 8),
    // Defaults to true in production, false otherwise. Override when running
    // behind a non-TLS reverse proxy in production (rare but possible).
    cookieSecure: bool('SESSION_COOKIE_SECURE', process.env.NODE_ENV === 'production'),
  },

  password: {
    scheme: optional('PASSWORD_SCHEME', 'BLF-CRYPT'),
    bcryptRounds: int('BCRYPT_ROUNDS', 12),
  },

  mailbox: {
    maildirTemplate: optional('MAILDIR_TEMPLATE', DEFAULT_MAILDIR_TEMPLATE),
    defaultQuotaMb: int('DEFAULT_MAILBOX_QUOTA_MB', 1024),
  },

  domain: {
    defaultMailboxes: int('DEFAULT_DOMAIN_MAILBOXES', 100),
    defaultAliases: int('DEFAULT_DOMAIN_ALIASES', 100),
    defaultQuotaMb: int('DEFAULT_DOMAIN_QUOTA_MB', 10240),
  },

  features: {
    vacation: bool('FEATURE_VACATION', true),
    fetchmail: bool('FEATURE_FETCHMAIL', false),
    dkim: bool('FEATURE_DKIM', false),
  },

  vacationDomain: optional('VACATION_DOMAIN', 'autoreply.example.com'),

  brand: {
    name: optional('BRAND_NAME', 'Postfix Dashboard'),
    defaultTheme: themeMode(optional('DEFAULT_THEME', 'system')),
  },
};

function themeMode(raw: string): 'system' | 'light' | 'dark' {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

export type AppEnv = typeof env;
