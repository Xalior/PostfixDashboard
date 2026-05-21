import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Pure password hashing/verification that speaks Dovecot's `{SCHEME}hash`
 * format. Kept free of `server-only` and env access so it is unit-testable and
 * reusable; the server-facing wrapper lives in `./password.ts`.
 *
 * Dovecot's password database can store many schemes in the same column by
 * prefixing the hash with `{SCHEME}`. phppostfixadmin does the same. We
 * preserve that format so:
 *
 *   1. This project is a drop-in replacement against an existing postfixadmin
 *      DB — old hashes keep validating.
 *   2. Dovecot itself can read the same column as its password query.
 *
 * Verify supports:
 *   - {BLF-CRYPT}    bcrypt ($2a$/$2b$/$2y$)
 *   - {SHA512-CRYPT} $6$ crypt
 *   - {MD5-CRYPT}    $1$ crypt  (read-only; verify but never write)
 *   - {CRYPT}        auto-detect by prefix ($6$ / $1$ / $2*$)
 *   - {PLAIN}        literal, for debugging
 *
 * Hash generation supports: BLF-CRYPT, PLAIN.
 *
 * NOTE on MD5-CRYPT: phppostfixadmin (md5crypt mode) and Dovecot both verify
 * `$1$` md5crypt, so a faithful drop-in must too — otherwise legacy md5crypt
 * mailboxes that authenticate fine to Dovecot/IMAP would be locked out of this
 * web UI. We verify md5crypt read-only: never rehash, never upgrade-on-login
 * (forced upgrade was never a requirement). New hashes are still BLF-CRYPT.
 */

export type PasswordScheme =
  | 'BLF-CRYPT'
  | 'SHA512-CRYPT'
  | 'MD5-CRYPT'
  | 'CRYPT'
  | 'PLAIN';

export interface ParsedHash {
  scheme: PasswordScheme;
  hash: string;
}

/** Parse a Dovecot `{SCHEME}hash` value. Falls back to CRYPT if unmarked. */
export function parseHash(stored: string): ParsedHash {
  const match = /^\{([A-Z0-9-]+)\}(.*)$/s.exec(stored);
  if (!match) {
    return { scheme: 'CRYPT', hash: stored };
  }
  const schemeRaw = match[1].toUpperCase();
  const hash = match[2];

  if (
    schemeRaw === 'BLF-CRYPT' ||
    schemeRaw === 'SHA512-CRYPT' ||
    schemeRaw === 'MD5-CRYPT' ||
    schemeRaw === 'CRYPT' ||
    schemeRaw === 'PLAIN'
  ) {
    return { scheme: schemeRaw, hash };
  }
  // Unknown scheme — we let verify() fail fast rather than guess.
  return { scheme: schemeRaw as PasswordScheme, hash };
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Hash a new password using an explicit scheme (no env access). */
export async function hashWithScheme(
  plain: string,
  scheme: string,
  bcryptRounds: number,
): Promise<string> {
  switch (scheme.toUpperCase() as PasswordScheme) {
    case 'BLF-CRYPT': {
      const h = await bcrypt.hash(plain, bcryptRounds);
      return `{BLF-CRYPT}${h}`;
    }
    case 'PLAIN':
      return `{PLAIN}${plain}`;
    default:
      throw new Error(
        `PASSWORD_SCHEME=${scheme} is not supported for writing. Supported: BLF-CRYPT, PLAIN.`,
      );
  }
}

/** Verify a plaintext against a stored `{SCHEME}hash` value. */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  if (!stored) return false;
  const { scheme, hash } = parseHash(stored);

  try {
    switch (scheme) {
      case 'BLF-CRYPT':
        return await bcrypt.compare(plain, hash);

      case 'PLAIN':
        return constantTimeEquals(plain, hash);

      case 'SHA512-CRYPT':
        return verifySha512Crypt(plain, hash);

      case 'MD5-CRYPT':
        // Read-only verification of `$1$salt$hash` (Dovecot's MD5-CRYPT).
        return verifyMd5Crypt(plain, hash);

      case 'CRYPT': {
        // Auto-detect by hash prefix.
        if (/^\$2[aby]\$/.test(hash)) return await bcrypt.compare(plain, hash);
        if (hash.startsWith('$6$')) return verifySha512Crypt(plain, hash);
        if (hash.startsWith('$1$')) return verifyMd5Crypt(plain, hash);
        // Other crypt variants we don't support — fail closed.
        return false;
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

// crypt's own base64 alphabet (not RFC 4648).
const CRYPT_B64 =
  './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function b64From24Bit(b2: number, b1: number, b0: number, n: number): string {
  let w = (b2 << 16) | (b1 << 8) | b0;
  let out = '';
  for (let i = 0; i < n; i++) {
    out += CRYPT_B64[w & 0x3f];
    w >>= 6;
  }
  return out;
}

/**
 * MD5-CRYPT verifier — Poul-Henning Kamp's `$1$` algorithm (the one glibc
 * crypt(), Dovecot MD5-CRYPT and phppostfixadmin md5crypt all implement).
 *
 * Format: $1$salt$hash  (salt up to 8 chars). Read-only: we recompute and
 * compare; we never produce `$1$` hashes for storage.
 */
export function verifyMd5Crypt(plain: string, stored: string): boolean {
  const match = /^\$1\$([^$]{1,8})\$(.+)$/.exec(stored);
  if (!match) return false;
  const salt = match[1];
  const expected = match[2];

  const pw = Buffer.from(plain, 'utf8');
  const saltBuf = Buffer.from(salt, 'utf8');
  const magic = Buffer.from('$1$', 'utf8');

  // Primary digest: password + magic + salt + (folded alt digest) + bit dance.
  const alt = createHash('md5')
    .update(pw)
    .update(saltBuf)
    .update(pw)
    .digest();

  const ctx = createHash('md5');
  ctx.update(pw);
  ctx.update(magic);
  ctx.update(saltBuf);

  for (let pl = pw.length; pl > 0; pl -= 16) {
    ctx.update(alt.subarray(0, pl > 16 ? 16 : pl));
  }

  // The "really weird" loop: for each bit of strlen(pw), append either a NUL
  // byte (bit set) or the first password byte (bit clear).
  const zero = Buffer.from([0]);
  const firstPwByte = pw.subarray(0, 1);
  for (let i = pw.length; i !== 0; i >>= 1) {
    ctx.update((i & 1) !== 0 ? zero : firstPwByte);
  }

  let result = ctx.digest();

  // 1000 rounds of strengthening.
  for (let i = 0; i < 1000; i++) {
    const c = createHash('md5');
    if ((i & 1) !== 0) c.update(pw);
    else c.update(result);
    if (i % 3 !== 0) c.update(saltBuf);
    if (i % 7 !== 0) c.update(pw);
    if ((i & 1) !== 0) c.update(result);
    else c.update(pw);
    result = c.digest();
  }

  // crypt-base64 output with md5crypt's specific byte ordering.
  let encoded = '';
  encoded += b64From24Bit(result[0], result[6], result[12], 4);
  encoded += b64From24Bit(result[1], result[7], result[13], 4);
  encoded += b64From24Bit(result[2], result[8], result[14], 4);
  encoded += b64From24Bit(result[3], result[9], result[15], 4);
  encoded += b64From24Bit(result[4], result[10], result[5], 4);
  encoded += b64From24Bit(0, 0, result[11], 2);

  return constantTimeEquals(encoded, expected);
}

/**
 * Best-effort SHA512-CRYPT verifier.
 *
 * Format: $6$[rounds=N$]salt$hash
 *
 * Reimplemented per Ulrich Drepper's spec. This is CPU-bound and only runs
 * when verifying legacy hashes from existing postfixadmin DBs — newly-created
 * accounts use BLF-CRYPT.
 */
export function verifySha512Crypt(plain: string, stored: string): boolean {
  const match = /^\$6\$(?:rounds=(\d+)\$)?([^$]+)\$(.+)$/.exec(stored);
  if (!match) return false;
  const rounds = match[1] ? Math.max(1000, Math.min(999999999, Number.parseInt(match[1], 10))) : 5000;
  const salt = match[2].slice(0, 16);
  const expected = match[3];

  const key = Buffer.from(plain, 'utf8');
  const saltBuf = Buffer.from(salt, 'utf8');

  // Step 1-3
  const digestA = createHash('sha512');
  digestA.update(key);
  digestA.update(saltBuf);

  // Step 4-8
  const digestB = createHash('sha512');
  digestB.update(key);
  digestB.update(saltBuf);
  digestB.update(key);
  let altResult = digestB.digest();

  // Step 9-10
  for (let cnt = key.length; cnt > 64; cnt -= 64) {
    digestA.update(altResult);
  }
  digestA.update(altResult.subarray(0, key.length % 64 === 0 && key.length !== 0 ? 64 : key.length % 64));

  // Step 11
  for (let cnt = key.length; cnt > 0; cnt >>= 1) {
    if ((cnt & 1) !== 0) {
      digestA.update(altResult);
    } else {
      digestA.update(key);
    }
  }

  let resultBuf = digestA.digest();

  // Step 13-15: DP
  const digestDP = createHash('sha512');
  for (let i = 0; i < key.length; i++) {
    digestDP.update(key);
  }
  const dpResult = digestDP.digest();

  // Step 16: produce P
  const p = Buffer.alloc(key.length);
  {
    let cnt = key.length;
    let offset = 0;
    while (cnt >= 64) {
      dpResult.copy(p, offset, 0, 64);
      offset += 64;
      cnt -= 64;
    }
    dpResult.copy(p, offset, 0, cnt);
  }

  // Step 17-19: DS
  const digestDS = createHash('sha512');
  for (let i = 0; i < 16 + resultBuf[0]; i++) {
    digestDS.update(saltBuf);
  }
  const dsResult = digestDS.digest();

  // Step 20: produce S
  const s = Buffer.alloc(saltBuf.length);
  {
    let cnt = saltBuf.length;
    let offset = 0;
    while (cnt >= 64) {
      dsResult.copy(s, offset, 0, 64);
      offset += 64;
      cnt -= 64;
    }
    dsResult.copy(s, offset, 0, cnt);
  }

  // Step 21: rounds
  for (let i = 0; i < rounds; i++) {
    const digestC = createHash('sha512');
    if ((i & 1) !== 0) digestC.update(p);
    else digestC.update(resultBuf);
    if (i % 3 !== 0) digestC.update(s);
    if (i % 7 !== 0) digestC.update(p);
    if ((i & 1) !== 0) digestC.update(resultBuf);
    else digestC.update(p);
    resultBuf = digestC.digest();
  }

  // Step 22: base64-encode (crypt-style, not standard base64)
  const encoded = sha512CryptB64(resultBuf);
  return constantTimeEquals(encoded, expected);
}

function sha512CryptB64(buf: Buffer): string {
  // Mapping per glibc crypt-sha512.c
  let out = '';
  out += b64From24Bit(buf[0], buf[21], buf[42], 4);
  out += b64From24Bit(buf[22], buf[43], buf[1], 4);
  out += b64From24Bit(buf[44], buf[2], buf[23], 4);
  out += b64From24Bit(buf[3], buf[24], buf[45], 4);
  out += b64From24Bit(buf[25], buf[46], buf[4], 4);
  out += b64From24Bit(buf[47], buf[5], buf[26], 4);
  out += b64From24Bit(buf[6], buf[27], buf[48], 4);
  out += b64From24Bit(buf[28], buf[49], buf[7], 4);
  out += b64From24Bit(buf[50], buf[8], buf[29], 4);
  out += b64From24Bit(buf[9], buf[30], buf[51], 4);
  out += b64From24Bit(buf[31], buf[52], buf[10], 4);
  out += b64From24Bit(buf[53], buf[11], buf[32], 4);
  out += b64From24Bit(buf[12], buf[33], buf[54], 4);
  out += b64From24Bit(buf[34], buf[55], buf[13], 4);
  out += b64From24Bit(buf[56], buf[14], buf[35], 4);
  out += b64From24Bit(buf[15], buf[36], buf[57], 4);
  out += b64From24Bit(buf[37], buf[58], buf[16], 4);
  out += b64From24Bit(buf[59], buf[17], buf[38], 4);
  out += b64From24Bit(buf[18], buf[39], buf[60], 4);
  out += b64From24Bit(buf[40], buf[61], buf[19], 4);
  out += b64From24Bit(buf[62], buf[20], buf[41], 4);
  out += b64From24Bit(0, 0, buf[63], 2);
  return out;
}

/** Random token suitable for password recovery. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
