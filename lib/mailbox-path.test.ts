import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMaildir, DEFAULT_MAILDIR_TEMPLATE } from './mailbox-path';

test('default is relative domain/localpart/ (matches phppostfixadmin)', () => {
  assert.equal(buildMaildir('user', 'example.com'), 'example.com/user/');
});

test('default template is relative (no leading slash, bare localpart)', () => {
  assert.equal(DEFAULT_MAILDIR_TEMPLATE, '{domain}/{local}/');
  const md = buildMaildir('alice', 'example.com');
  assert.equal(md, 'example.com/alice/');
  assert.equal(md.startsWith('/'), false);
  assert.equal(md.includes('@'), false);
});

test('honours a custom template with {user} (full email)', () => {
  assert.equal(
    buildMaildir('bob', 'example.com', '/virtual/{domain}/{user}/'),
    '/virtual/example.com/bob@example.com/',
  );
});

test('falls back to relative format if template renders empty', () => {
  assert.equal(buildMaildir('carol', 'example.com', ''), 'example.com/carol/');
});
