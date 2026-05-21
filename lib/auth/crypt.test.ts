import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  verifyPassword,
  verifyMd5Crypt,
  parseHash,
  hashWithScheme,
} from './crypt';

// Deterministic vectors generated with `openssl passwd -1` / `-6`. The `$1$`
// vectors are byte-identical in format to what phppostfixadmin (md5crypt /
// php_crypt:MD5) writes, so they exercise the real legacy-hash path.
const MD5 = '$1$Xx01abcd$9K62HTSO6Ulgfzh4ThOm/1'; // "correct horse"
const MD5_2 = '$1$deadbeef$PdTh9ZGnjSIUKQ6sv1jCz.'; // "s3cr3t-pass"
const SHA512 =
  '$6$0123456789abcdef$lDHzA5IdO41viXIs6llkDKq4Uh2VG9JXIYJ.taq2zlNFqBnKQ0/fOUW0Zoz49ZnOpe2ACY.PoF6wosL.jL3Af0'; // "correct horse"

test('verifyMd5Crypt: correct password returns true', () => {
  assert.equal(verifyMd5Crypt('correct horse', MD5), true);
  assert.equal(verifyMd5Crypt('s3cr3t-pass', MD5_2), true);
});

test('verifyMd5Crypt: wrong password returns false', () => {
  assert.equal(verifyMd5Crypt('wrong horse', MD5), false);
  assert.equal(verifyMd5Crypt('', MD5), false);
});

test('verifyPassword: prefix-less $1$ md5crypt (CRYPT auto-detect path)', async () => {
  // phppostfixadmin stores md5crypt prefix-less; parseHash → CRYPT → md5 detect.
  assert.equal(parseHash(MD5).scheme, 'CRYPT');
  assert.equal(await verifyPassword('correct horse', MD5), true);
  assert.equal(await verifyPassword('wrong', MD5), false);
});

test('verifyPassword: explicit {MD5-CRYPT} prefix', async () => {
  assert.equal(await verifyPassword('correct horse', `{MD5-CRYPT}${MD5}`), true);
  assert.equal(await verifyPassword('wrong', `{MD5-CRYPT}${MD5}`), false);
});

test('verifyPassword: SHA512-CRYPT still verifies', async () => {
  assert.equal(await verifyPassword('correct horse', `{SHA512-CRYPT}${SHA512}`), true);
  assert.equal(await verifyPassword('correct horse', SHA512), true); // CRYPT auto-detect
  assert.equal(await verifyPassword('wrong', SHA512), false);
});

test('BLF-CRYPT: hash then verify round-trips', async () => {
  const stored = await hashWithScheme('hunter2', 'BLF-CRYPT', 4);
  assert.match(stored, /^\{BLF-CRYPT\}\$2[aby]\$/);
  assert.equal(await verifyPassword('hunter2', stored), true);
  assert.equal(await verifyPassword('hunter3', stored), false);
});

test('verifyPassword: never writes md5crypt — only verifies', () => {
  // hashWithScheme rejects MD5-CRYPT for writing (read-only support).
  assert.rejects(() => hashWithScheme('x', 'MD5-CRYPT', 4));
});

test('empty stored value returns false', async () => {
  assert.equal(await verifyPassword('anything', ''), false);
});
