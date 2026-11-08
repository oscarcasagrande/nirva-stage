'use strict';
// T06 / FR-014 / FR-015 / SC-001 (U1): hook.js apontando para um palco remoto.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const https = require('https');
const { startServer, runNode, readSSE, freePort, sessionStart } = require('./helpers');
const { clip } = require('../lib/normalize');

const TOKEN = 'tok-hook-remoto';
const HOST = clip(os.hostname(), 32);
// O hook tem uma guarda interna de 1.500 ms. Medimos o processo inteiro, que inclui
// o boot do Node (~50–300 ms em máquina lenta de CI); por isso a margem até 2.000 ms.
const LIMITE_MS = 2000;

let srv;
before(async () => { srv = await startServer({ env: { NIRVA_TOKEN: TOKEN } }); });
after(async () => { await srv.stop(); });

async function replay(base) {
  const { events } = await readSSE(base + '/events', { headers: { authorization: `Bearer ${TOKEN}` }, untilCount: 1, names: ['replay'] });
  return events.find((e) => e.event === 'replay').data;
}

test('T06: --url e --token entregam o evento com o host da máquina', async () => {
  const r = await runNode('hook.js', ['--nirva-stage', '--url', srv.base + '/event', '--token', TOKEN], { stdin: sessionStart('hook-opcao') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  const ev = (await replay(srv.base)).find((e) => e.session === 'hook-opcao');
  assert.ok(ev, 'o evento não chegou');
  assert.equal(ev.host, HOST);
});

test('T06: NIRVA_URL e NIRVA_TOKEN no ambiente também funcionam', async () => {
  const r = await runNode('hook.js', ['--nirva-stage'], { env: { NIRVA_URL: srv.base + '/event', NIRVA_TOKEN: TOKEN }, stdin: sessionStart('hook-env') });
  assert.equal(r.code, 0);
  const ev = (await replay(srv.base)).find((e) => e.session === 'hook-env');
  assert.ok(ev, 'o evento não chegou');
  assert.equal(ev.host, HOST);
});

test('T06: HTTPS funciona, com Bearer e src=nirva-stage', async () => {
  const tls = path.join(__dirname, 'fixtures', 'tls');
  let got = null;
  const s = https.createServer({ key: fs.readFileSync(path.join(tls, 'key.pem')), cert: fs.readFileSync(path.join(tls, 'cert.pem')) }, (req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { got = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) }; res.end('{}'); });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  try {
    const url = `https://localhost:${s.address().port}/event`;
    const r = await runNode('hook.js', ['--nirva-stage', '--url', url, '--token', TOKEN], { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, stdin: sessionStart('hook-https') });
    assert.equal(r.code, 0);
    assert.ok(got, 'o servidor HTTPS não recebeu o evento');
    assert.equal(got.auth, `Bearer ${TOKEN}`);
    assert.match(got.url, /^\/event\?(.*&)?src=nirva-stage/);
    assert.equal(got.body.session, 'hook-https');
    assert.equal(got.body.host, HOST);
  } finally { s.close(); }
});

test('FR-015: palco desligado → código 0, rápido e calado', async () => {
  const port = await freePort();
  const r = await runNode('hook.js', ['--nirva-stage', '--url', `http://127.0.0.1:${port}/event`, '--token', TOKEN], { stdin: sessionStart('off') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.ok(r.ms <= LIMITE_MS, `demorou ${r.ms} ms`);
});

test('FR-015: token errado → código 0', async () => {
  const r = await runNode('hook.js', ['--nirva-stage', '--url', srv.base + '/event', '--token', 'errado'], { stdin: sessionStart('errado') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('FR-015: palco que aceita a conexão e não responde → código 0 em até 1,5 s (+ boot)', async () => {
  const sockets = [];
  const mudo = net.createServer((sock) => { sockets.push(sock); });
  await new Promise((r) => mudo.listen(0, '127.0.0.1', r));
  try {
    const r = await runNode('hook.js', ['--nirva-stage', '--url', `http://127.0.0.1:${mudo.address().port}/event`], { stdin: sessionStart('mudo') });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
    assert.ok(r.ms <= LIMITE_MS, `demorou ${r.ms} ms`);
  } finally { for (const s of sockets) s.destroy(); mudo.close(); }
});

test('SC-001 (U1): com o palco local, o evento chega ao navegador em menos de 1 s', async () => {
  const t0 = Date.now();
  const sse = readSSE(srv.base + '/events', { headers: { authorization: `Bearer ${TOKEN}` }, untilCount: 1, names: ['message'], timeoutMs: 3000 })
    .then((r) => ({ ...r, at: Date.now() }));
  await new Promise((r) => setTimeout(r, 100)); // conexão SSE aberta antes do hook
  const tHook = Date.now();
  const r = await runNode('hook.js', ['--nirva-stage', '--url', srv.base + '/event', '--token', TOKEN], { stdin: sessionStart('latencia') });
  assert.equal(r.code, 0);
  const got = await sse;
  const ev = got.events.find((e) => e.event === 'message');
  assert.ok(ev && ev.data.session === 'latencia', 'o evento não chegou ao SSE');
  assert.ok(got.at - tHook < 1000, `levou ${got.at - tHook} ms (desde ${tHook - t0} ms)`);
});
