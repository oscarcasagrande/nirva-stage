'use strict';
// T02–T05, RF01–RF04, RS02–RS04, RS07, RS08: autenticação por token.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { ROOT, startServer, fetchNoRedirect, readSSE, sessionStart } = require('./helpers');

const TOKEN = 'tok-teste-123';
let srv;
before(async () => { srv = await startServer({ env: { NIRVA_TOKEN: TOKEN } }); });
after(async () => { await srv.stop(); });

// Requisição crua, para controlar Origin e Host sem interferência do fetch.
function raw(base, method, p, headers = {}, body) {
  const u = new URL(p, base);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      // stream SSE nunca termina: basta o status
      if (/event-stream/.test(res.headers['content-type'] || '')) { req.destroy(); return resolve({ status: res.statusCode, headers: res.headers, body: '' }); }
      let data = ''; res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const bearer = (t = TOKEN) => ({ authorization: `Bearer ${t}` });
const post = (p, headers = {}) => raw(srv.base, 'POST', p, { 'content-type': 'application/json', ...headers }, sessionStart('auth'));

test('T02: sem token, / mostra a página de login e as demais rotas dão 401', async () => {
  const home = await fetch(srv.base + '/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /token/i);
  assert.match(html, /Entrar/);
  assert.doesNotMatch(html, /vendor\/qrcode\.js/, 'a página de login não pode carregar arquivos de public/');
  assert.equal((await fetch(srv.base + '/index.html')).status, 200);
  assert.equal((await fetch(srv.base + '/events')).status, 401);
  assert.equal((await post('/event')).status, 401);
  assert.equal((await fetch(srv.base + '/vendor/qrcode.js')).status, 401);
});

test('T03: token errado em POST /event dá 401, nunca 403', async () => {
  const r = await post('/event', bearer('errado'));
  assert.equal(r.status, 401);
  assert.equal((await post('/event?token=errado')).status, 401);
});

test('RF02: token aceito no cabeçalho, na query e no cookie', async () => {
  assert.equal((await post('/event', bearer())).status, 200);
  assert.equal((await post('/event?token=' + TOKEN)).status, 200);
  assert.equal((await post('/event', { cookie: `outro=1; nirva_token=${TOKEN}` })).status, 200);
  assert.equal((await fetch(srv.base + '/events?token=' + TOKEN)).status, 200);
});

test('RF02: basta uma fonte válida, mesmo com outra errada', async () => {
  assert.equal((await post('/event?token=' + TOKEN, bearer('errado'))).status, 200);
  assert.equal((await post('/event', { ...bearer(), cookie: 'nirva_token=velho' })).status, 200);
});

test('cookie de um token antigo vale como sem token', async () => {
  assert.equal((await fetch(srv.base + '/events', { headers: { cookie: 'nirva_token=token-antigo' } })).status, 401);
});

test('T04: GET /?token=<certo> grava o cookie e redireciona sem o token', async () => {
  const r = await fetchNoRedirect(srv.base + '/?token=' + TOKEN);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/');
  const c = r.headers.get('set-cookie');
  assert.match(c, new RegExp(`nirva_token=${TOKEN}`));
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Max-Age=2592000', 'Path=/']) assert.ok(c.includes(flag), `faltou ${flag}: ${c}`);
  assert.doesNotMatch(c, /Secure/);
});

test('T04: atrás de HTTPS o cookie ganha Secure', async () => {
  const r = await raw(srv.base, 'GET', '/?token=' + TOKEN, { 'x-forwarded-proto': 'https' });
  assert.equal(r.status, 302);
  assert.match(r.headers['set-cookie'][0], /; Secure/);
});

test('T04: o redirect preserva os outros parâmetros', async () => {
  const r = await fetchNoRedirect(srv.base + '/?demo&token=' + TOKEN);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/?demo');
});

test('RF04: token errado em /?token= volta ao login com aviso e sem cookie', async () => {
  const r = await fetchNoRedirect(srv.base + '/?token=errado');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('set-cookie'), null);
  assert.match(await r.text(), /Token inválido/);
});

test('T05: com o cookie, palco, /events e estáticos respondem 200', async () => {
  const cookie = `nirva_token=${TOKEN}`;
  const home = await fetch(srv.base + '/', { headers: { cookie } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /vendor\/qrcode\.js/, 'com cookie, / é o palco');
  assert.equal((await fetch(srv.base + '/vendor/qrcode.js', { headers: { cookie } })).status, 200);
  const sse = await readSSE(srv.base + '/events', { headers: { cookie }, untilCount: 1, names: ['replay'] });
  assert.equal(sse.status, 200);
});

test('RF01: /health sem token só diz que a autenticação é exigida', async () => {
  const r = await fetch(srv.base + '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, auth: 'required' });
  const d = await (await fetch(srv.base + '/health', { headers: bearer() })).json();
  assert.equal(d.ok, true);
  assert.equal(d.auth, 'required');
  for (const k of ['clients', 'events', 'docker', 'mode']) assert.ok(k in d, `faltou ${k}`);
});

test('RS02: requisições de 127.0.0.1 também precisam de token', async () => {
  // srv.base já é 127.0.0.1: os testes acima provam o 401; aqui, explícito.
  assert.equal(srv.base.startsWith('http://127.0.0.1:'), true);
  assert.equal((await raw(srv.base, 'GET', '/events')).status, 401);
});

test('RS08 / FR-013: Origin estranho em POST /event dá 401, com e sem token', async () => {
  const evil = { origin: 'https://malicioso.example' };
  assert.equal((await post('/event', { ...evil, ...bearer() })).status, 401);
  const semToken = await startServer();
  try {
    const r = await raw(semToken.base, 'POST', '/event', evil, sessionStart('origin'));
    assert.equal(r.status, 401);
  } finally { await semToken.stop(); }
});

test('RS08: Origin igual ao Host do palco (atrás do túnel) é aceito', async () => {
  const r = await post('/event', { ...bearer(), host: 'palco.exemplo.ts.net', origin: 'https://palco.exemplo.ts.net' });
  assert.equal(r.status, 200);
  assert.equal((await post('/event', { ...bearer(), origin: 'http://localhost:4321' })).status, 200);
});

test('sem token, Origin igual ao Host não basta (proteção contra DNS rebinding da v1.1)', async () => {
  const semToken = await startServer();
  try {
    const r = await raw(semToken.base, 'POST', '/event', { host: 'rebind.example', origin: 'http://rebind.example' }, sessionStart('rebind'));
    assert.equal(r.status, 401);
  } finally { await semToken.stop(); }
});

test('RS04: nenhuma resposta de /event é 403', async () => {
  const casos = [{}, bearer('x'), { origin: 'https://x.example' }, bearer()];
  for (const h of casos) assert.notEqual((await post('/event', h)).status, 403);
});

test('RS07: o token nunca aparece na saída do servidor', () => {
  assert.ok(srv.out().includes('Nirva Stage no ar'));
  assert.ok(!srv.out().includes(TOKEN), 'o token apareceu no log:\n' + srv.out());
  assert.match(srv.out(), /Autenticação: ligada/);
});

test('RS03: comparação em tempo constante sobre SHA-256', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(src, /timingSafeEqual/);
  assert.match(src, /sha256/);
});
