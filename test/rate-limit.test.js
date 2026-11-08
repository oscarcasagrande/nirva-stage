'use strict';
// T08 / RS05 / FR-011: 300 POSTs por IP a cada 10 s, só com NIRVA_TOKEN.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, sessionStart } = require('./helpers');

async function blast(base, headers, n = 320, concurrency = 20) {
  const codes = []; let i = 0;
  const worker = async () => {
    while (i < n) {
      i++;
      const r = await fetch(base + '/event', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: sessionStart('taxa') });
      await r.arrayBuffer();
      codes.push(r.status);
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { codes, ms: Date.now() - t0 };
}

test('T08: com token, 320 POSTs em menos de 10 s → 300 × 200 e 20 × 429', async () => {
  const s = await startServer({ env: { NIRVA_TOKEN: 'tok-taxa' } });
  try {
    const { codes, ms } = await blast(s.base, { authorization: 'Bearer tok-taxa' });
    assert.ok(ms < 10000, `demorou ${ms} ms`);
    assert.equal(codes.filter((c) => c === 200).length, 300);
    assert.equal(codes.filter((c) => c === 429).length, 20);
  } finally { await s.stop(); }
});

test('sem token, não há limite de taxa (como na v1.1)', async () => {
  const s = await startServer();
  try {
    const { codes } = await blast(s.base, {});
    assert.equal(codes.filter((c) => c === 200).length, 320);
  } finally { await s.stop(); }
});
