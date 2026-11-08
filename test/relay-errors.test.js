'use strict';
// T11 / RF10 / FR-020 / FR-024 / RS07: erros, avisos e resiliência do relay.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT, cleanEnv, freePort, startServer, runNode, readSSE, sessionStart } = require('./helpers');

const FX = path.join(__dirname, 'fixtures', 'transcripts');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tmpDir(seed = true) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nirva-relay-err-'));
  if (seed) {
    fs.mkdirSync(path.join(d, 'projeto-fx'));
    fs.copyFileSync(path.join(FX, 'seed.jsonl'), path.join(d, 'projeto-fx', 'fx-sessao.jsonl'));
  }
  return d;
}

// liga o relay, espera `until` aparecer na saída, desliga e devolve a saída
function relayUntil(args, until, env = {}, ms = 5000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['scripts/relay.js', ...args], { cwd: ROOT, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const check = () => { if (out.includes(until)) { clearTimeout(t); proc.kill(); } };
    proc.stdout.on('data', (c) => { out += c; check(); });
    proc.stderr.on('data', (c) => { out += c; check(); });
    proc.on('exit', () => { clearTimeout(t); resolve(out); });
    const t = setTimeout(() => { proc.kill(); reject(new Error('timeout:\n' + out)); }, ms);
  });
}

async function waitEvents(base, token, n, ms = 5000) {
  const t0 = Date.now(); let c = 0;
  while (Date.now() - t0 < ms) {
    c = (await (await fetch(base + '/health', { headers: { authorization: `Bearer ${token}` } })).json()).events;
    if (c >= n) break;
    await sleep(100);
  }
  return c;
}

test('T11: token errado → mensagem, fila descartada e saída 1, sem imprimir o token', async () => {
  const srv = await startServer({ env: { NIRVA_TOKEN: 'tok-certo-111' } });
  const dir = tmpDir();
  try {
    const r = await runNode('scripts/relay.js', ['--url', srv.base + '/event', '--token', 'tok-errado-999', '--dir', dir], { timeoutMs: 8000 });
    const out = r.stdout + r.stderr;
    assert.equal(r.code, 1, out);
    assert.match(out, /O palco recusou o token \(401\)/);
    assert.match(out, /fila/i);
    assert.ok(!out.includes('tok-errado-999'), 'o token apareceu na saída');
  } finally { await srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sem --url nem NIRVA_URL → explica o uso e sai com 1', async () => {
  const r = await runNode('scripts/relay.js', []);
  assert.equal(r.code, 1);
  assert.match(r.stdout + r.stderr, /Uso:[\s\S]*--url/);
});

test('NIRVA_URL e NIRVA_TOKEN funcionam no lugar das opções', async () => {
  const srv = await startServer({ env: { NIRVA_TOKEN: 'tok-env-222' } });
  const dir = tmpDir();
  const proc = spawn(process.execPath, ['scripts/relay.js', '--dir', dir, '--host', 'via-env'], {
    cwd: ROOT, env: cleanEnv({ NIRVA_URL: srv.base + '/event', NIRVA_TOKEN: 'tok-env-222' }), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = ''; proc.stdout.on('data', (c) => { out += c; }); proc.stderr.on('data', (c) => { out += c; });
  try {
    assert.equal(await waitEvents(srv.base, 'tok-env-222', 1), 1, out);
    const { events } = await readSSE(srv.base + '/events', { headers: { authorization: 'Bearer tok-env-222' }, names: ['replay'] });
    assert.equal(events.find((e) => e.event === 'replay').data[0].host, 'via-env');
    assert.match(out, /Relay ligado: .* → 127\.0\.0\.1:\d+ como via-env/);
    assert.ok(!out.includes('tok-env-222'));
  } finally { proc.kill(); await srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('RF10: destino HTTP fora do localhost gera aviso; loopback não', async () => {
  const dir = tmpDir(false);
  try {
    const far = await relayUntil(['--url', 'http://exemplo.invalid/event', '--token', 'tok-aviso-333', '--dir', dir], 'acompanhando');
    assert.match(far, /sem criptografia/);
    assert.ok(!far.includes('tok-aviso-333'));
    const near = await relayUntil(['--url', 'http://127.0.0.1:9/event', '--dir', dir], 'acompanhando');
    assert.doesNotMatch(near, /sem criptografia/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('resiliência: com o palco fora do ar, guarda os eventos e entrega quando ele volta', async () => {
  const port = await freePort();
  const dir = tmpDir();
  const main = path.join(dir, 'projeto-fx', 'fx-sessao.jsonl');
  const proc = spawn(process.execPath, ['scripts/relay.js', '--url', `http://127.0.0.1:${port}/event`, '--token', 'tok-res-444', '--dir', dir, '--host', 'res'], {
    cwd: ROOT, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = ''; proc.stdout.on('data', (c) => { out += c; }); proc.stderr.on('data', (c) => { out += c; });
  let srv;
  try {
    await sleep(600);
    const lines = fs.readFileSync(path.join(FX, 'main-a.jsonl'), 'utf8').split('\n').slice(0, 2).join('\n') + '\n';
    fs.appendFileSync(main, lines); // prompt + Read: 2 eventos além do SessionStart
    await sleep(1500);
    srv = await startServer({ port, env: { NIRVA_TOKEN: 'tok-res-444' } });
    assert.equal(await waitEvents(srv.base, 'tok-res-444', 3), 3, 'eventos guardados não chegaram:\n' + out);
    const { events } = await readSSE(srv.base + '/events', { headers: { authorization: 'Bearer tok-res-444' }, names: ['replay'] });
    assert.deepEqual(events.find((e) => e.event === 'replay').data.map((e) => e.event), ['SessionStart', 'UserPromptSubmit', 'PreToolUse']);
    assert.match(out, /inacessível/);
    assert.ok(!out.includes('tok-res-444'));
  } finally {
    proc.kill();
    if (srv) await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RF15: no modo transcript o palco ignora hooks locais e mostra o relay', async () => {
  const dir = tmpDir(false);
  const srv = await startServer({ args: ['--transcripts'], env: { NIRVA_TRANSCRIPTS: dir } });
  try {
    await fetch(srv.base + '/event?src=nirva-stage', { method: 'POST', body: sessionStart('do-hook') });
    const relayed = { v: 1, event: 'SessionStart', session: 'do-relay', project: 'p', host: 'outra' };
    await fetch(srv.base + '/event?src=nirva-relay', { method: 'POST', body: JSON.stringify(relayed) });
    const { events } = await readSSE(srv.base + '/events', { names: ['replay'] });
    const sessions = events.find((e) => e.event === 'replay').data.map((e) => e.session);
    assert.ok(!sessions.includes('do-hook'));
    assert.ok(sessions.includes('do-relay'));
  } finally { await srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
