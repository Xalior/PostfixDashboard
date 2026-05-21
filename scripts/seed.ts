#!/usr/bin/env tsx
/**
 * Seed script — creates a superadmin account if the `admin` table is empty.
 *
 * Usage:
 *   SEED_SUPERADMIN_USERNAME=admin@example.com \
 *   SEED_SUPERADMIN_PASSWORD=ChangeMe123! \
 *   npm run db:seed
 *
 * Safe to run more than once: it only inserts when there are no admins yet.
 */

import { count, eq } from 'drizzle-orm';

import { db } from '../lib/db';
import { admin, config, domainAdmins } from '../lib/db/schema';
import { hashPassword } from '../lib/auth/password';

async function main() {
  const username = process.env.SEED_SUPERADMIN_USERNAME ?? 'admin@example.com';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe123!';

  // Ensure a config row so phppostfixadmin upgrade tooling (if ever used on
  // the same DB) sees a sensible version marker.
  const [existingConfig] = await db.select().from(config).where(eq(config.name, 'version')).limit(1);
  if (!existingConfig) {
    await db.insert(config).values({ name: 'version', value: '3000' });
  }

  const [{ value: admins }] = await db.select({ value: count() }).from(admin);
  if (Number(admins) > 0) {
    console.log(`Admins table already has ${admins} row(s) — leaving it alone.`);
    return;
  }

  const now = new Date();
  await db.insert(admin).values({
    username,
    password: await hashPassword(password),
    superadmin: 1,
    active: 1,
    created: now,
    modified: now,
  });
  await db.insert(domainAdmins).values({
    username,
    domain: 'ALL',
    active: 1,
    created: now,
  });

  console.log(`✓ Created superadmin: ${username}`);
  console.log(`  Password: ${password}`);
  console.log('  (set SEED_SUPERADMIN_PASSWORD in your env to change)');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
