import 'server-only';

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * Shared MySQL pool + Drizzle instance.
 *
 * We cache on globalThis so hot-reload in dev doesn't leak connections.
 */

declare global {
  // eslint-disable-next-line no-var
  var __postfixDashboardDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const pool = mysql.createPool({
    uri: env.databaseUrl,
    connectionLimit: 10,
    // Postfix/Dovecot conventionally store booleans as tinyint(1); leave them
    // as numbers and normalise in our mappers to keep schema fidelity.
    dateStrings: false,
  });
  return drizzle(pool, { schema, mode: 'default' });
}

export const db = globalThis.__postfixDashboardDb ?? createDb();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__postfixDashboardDb = db;
}

export { schema };
