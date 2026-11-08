'use strict';
// T01 / RS01 / FR-006 / FR-007: o palco não sobe exposto na rede sem token.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT, freePort, cleanEnv, startServer } = require('./helpers');

// Sobe o servidor e espera ele sair sozinho (ou não) por até `ms`.
async function runUntilExit(env, ms = 3000) {
  const port = await freePort();
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: cleanEnv({ NIRVA_PORT: String(port), ...env }) });
    let out = '';
    proc.stdout.on('data', (c) => { out += c; });
    proc.stderr.on('data', (c) => { out += c; });
    const t = setTimeout(() => { proc.kill(); resolve({ code: null, out }); }, ms);
    proc.on('exit', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}

test('NIRVA_HOST=0.0.0.0 sem token encerra com código 1 e explica em português', async () => {
  const r = await runUntilExit({ NIRVA_HOST: '0.0.0.0' });
  assert.equal(r.code, 1, 'deveria ter encerrado:\n' + r.out);
  assert.match(r.out, /NIRVA_TOKEN/);
  assert.match(r.out, /npm run token/);
  assert.match(r.out, /recus/i);
  assert.doesNotMatch(r.out, /Nirva Stage no ar/);
});

test('NIRVA_HOST=0.0.0.0 com NIRVA_TOKEN inicia', async () => {
  const s = await startServer({ env: { NIRVA_HOST: '0.0.0.0', NIRVA_TOKEN: 'tok-exposicao' } });
  await s.stop();
});

test('NIRVA_HOST=0.0.0.0 com NIRVA_IN_DOCKER=1 inicia sem token', async () => {
  const s = await startServer({ env: { NIRVA_HOST: '0.0.0.0', NIRVA_IN_DOCKER: '1' } });
  await s.stop();
});

test('NIRVA_HOST=0.0.0.0 com NIRVA_INSECURE=1 inicia com aviso', async () => {
  const s = await startServer({ env: { NIRVA_HOST: '0.0.0.0', NIRVA_INSECURE: '1' } });
  try { assert.match(s.out(), /exposto na rede sem token/i); } finally { await s.stop(); }
});

test('loopback sem token inicia como na v1.1', async () => {
  for (const host of ['127.0.0.1', 'localhost']) {
    const s = await startServer({ env: { NIRVA_HOST: host } });
    assert.doesNotMatch(s.out(), /exposto na rede sem token/i);
    await s.stop();
  }
});

test('a imagem Docker declara NIRVA_IN_DOCKER=1 (FR-007)', () => {
  const df = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const envBlock = df.slice(df.indexOf('ENV '), df.indexOf('WORKDIR'));
  assert.match(envBlock, /NIRVA_IN_DOCKER=1/);
  assert.match(envBlock, /NIRVA_HOST=0\.0\.0\.0/);
});
