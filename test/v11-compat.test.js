'use strict';
// T13: sem NIRVA_TOKEN, o palco se comporta como na v1.1 (constituição, Princípio V).
// Caracterização escrita contra o código da v1.1 antes de qualquer mudança da v1.2.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, runNode, readSSE, freePort, sessionStart } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.stop(); });

test('/health responde os detalhes da v1.1', async () => {
  const r = await fetch(srv.base + '/health');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  for (const k of ['clients', 'events', 'docker', 'mode']) assert.ok(k in j, `faltou ${k}`);
  assert.equal(j.mode, 'hooks');
  assert.ok(!('auth' in j), 'sem token, /health não fala de autenticação');
});

test('/ e /index.html servem o palco', async () => {
  for (const p of ['/', '/index.html', '/?demo']) {
    const r = await fetch(srv.base + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /vendor\/qrcode\.js/);
  }
});

test('/vendor/qrcode.js é servido', async () => {
  const r = await fetch(srv.base + '/vendor/qrcode.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
});

test('rota desconhecida dá 404', async () => {
  assert.equal((await fetch(srv.base + '/nada')).status, 404);
});

test('/events é SSE com retry, mode e replay', async () => {
  const { status, events, raw } = await readSSE(srv.base + '/events', { untilCount: 2, names: ['mode', 'replay'] });
  assert.equal(status, 200);
  assert.match(raw, /^retry: 2000/);
  assert.deepEqual(events.find((e) => e.event === 'mode').data, { transcripts: false });
  assert.ok(Array.isArray(events.find((e) => e.event === 'replay').data));
});

test('POST /event responde sempre 200 {}', async () => {
  for (const body of [sessionStart('compat'), '{isso não é json', '', JSON.stringify({ hook_event_name: 'Inexistente' })]) {
    const r = await fetch(srv.base + '/event', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '{}');
  }
});

test('evento enviado aparece no replay de uma nova conexão', async () => {
  await fetch(srv.base + '/event?src=nirva-stage', { method: 'POST', body: sessionStart('replay-v11') });
  const { events } = await readSSE(srv.base + '/events', { untilCount: 1, names: ['replay'] });
  const replay = events.find((e) => e.event === 'replay').data;
  const ev = replay.find((e) => e.session === 'replay-v11');
  assert.ok(ev, 'evento não apareceu no replay');
  assert.equal(ev.event, 'SessionStart');
  assert.equal(ev.project, 'projeto-teste');
});

test('modo transcript ignora eventos de hooks locais (src=nirva-stage)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nirva-tr-'));
  const s = await startServer({ args: ['--transcripts'], env: { NIRVA_TRANSCRIPTS: dir } });
  try {
    const h = await (await fetch(s.base + '/health')).json();
    assert.equal(h.mode, 'transcripts');
    await fetch(s.base + '/event?src=nirva-stage', { method: 'POST', body: sessionStart('ignorado') });
    const { events } = await readSSE(s.base + '/events', { untilCount: 2, names: ['mode', 'replay'] });
    assert.deepEqual(events.find((e) => e.event === 'mode').data, { transcripts: true });
    assert.ok(!events.find((e) => e.event === 'replay').data.some((e) => e.session === 'ignorado'));
  } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('hook.js com o palco desligado sai com código 0, rápido e calado', async () => {
  const port = await freePort();
  const r = await runNode('hook.js', ['--nirva-stage'], { env: { NIRVA_PORT: String(port) }, stdin: sessionStart('desligado') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.ok(r.ms < 2000, `demorou ${r.ms} ms`);
});

test('hook.js entrega o evento ao palco local', async () => {
  const r = await runNode('hook.js', ['--nirva-stage'], { env: { NIRVA_PORT: String(srv.port) }, stdin: sessionStart('via-hook') });
  assert.equal(r.code, 0);
  const { events } = await readSSE(srv.base + '/events', { untilCount: 1, names: ['replay'] });
  assert.ok(events.find((e) => e.event === 'replay').data.some((e) => e.session === 'via-hook'));
});
