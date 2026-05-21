import 'server-only';

import { env } from '@/lib/env';
import { hashWithScheme } from '@/lib/auth/crypt';

/**
 * Server-facing password API. The actual hashing/verification lives in
 * `./crypt.ts` (pure, unit-testable, no `server-only`/env). This module wires
 * the default scheme from env and re-exports the verification surface so
 * existing imports of `@/lib/auth/password` keep working unchanged.
 *
 * Default scheme for NEW hashes is configurable via PASSWORD_SCHEME (default
 * BLF-CRYPT, which is bcrypt and something Dovecot verifies natively). We only
 * ever *write* BLF-CRYPT (or PLAIN); legacy schemes such as MD5-CRYPT and
 * SHA512-CRYPT are verified read-only for drop-in compatibility — never
 * rehashed or upgraded on login.
 */

export type { PasswordScheme, ParsedHash } from '@/lib/auth/crypt';
export { verifyPassword, parseHash, randomToken } from '@/lib/auth/crypt';

/** Hash a new password using the default scheme from env. */
export async function hashPassword(plain: string): Promise<string> {
  return hashWithScheme(plain, env.password.scheme, env.password.bcryptRounds);
}
