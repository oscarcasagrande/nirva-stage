'use strict';
// RF05: npm run token gera 192 bits aleatórios em base64url (32 caracteres).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runNode } = require('./helpers');

test('scripts/token.js imprime 32 caracteres base64url', async () => {
  const r = await runNode('scripts/token.js');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^[A-Za-z0-9_-]{32}\r?\n?$/);
});

test('duas execuções geram tokens diferentes', async () => {
  const [a, b] = await Promise.all([runNode('scripts/token.js'), runNode('scripts/token.js')]);
  assert.notEqual(a.stdout.trim(), b.stdout.trim());
});
