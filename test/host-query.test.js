'use strict';
// T07 / RF08 / FR-018: o palco preenche host a partir de ?host= quando o evento não traz.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, readSSE } = require('./helpers');

const TOKEN = 'tok-host-query';
const raw = (sid) => JSON.stringify({ hook_event_name: 'SessionStart', session_id: sid, cwd: '/tmp/proj-q' });
const v1 = (sid, host) => JSON.stringify({ v: 1, event: 'SessionStart', session: sid, project: 'proj-q', host });

let srv;
before(async () => { srv = await startServer({ env: { NIRVA_TOKEN: TOKEN } }); });
after(async () => { await srv.stop(); });

async function replay(base, headers = {}) {
  const { events } = await readSSE(base + '/events', { headers, untilCount: 1, names: ['replay'] });
  return events.find((e) => e.event === 'replay').data;
}
const auth = { authorization: `Bearer ${TOKEN}` };

test('T07: hook HTTP com ?token=&host= → 200 e evento com o host da query', async () => {
  const r = await fetch(`${srv.base}/event?src=nirva-stage&host=maquina-b&token=${TOKEN}`, { method: 'POST', body: raw('q1') });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '{}');
  assert.equal((await replay(srv.base, auth)).find((e) => e.session === 'q1').host, 'maquina-b');
});

test('host do próprio evento vence o da query', async () => {
  await fetch(`${srv.base}/event?host=outra`, { method: 'POST', headers: auth, body: v1('q2', 'propria') });
  assert.equal((await replay(srv.base, auth)).find((e) => e.session === 'q2').host, 'propria');
});

test('?host= longo é cortado em 32 caracteres', async () => {
  await fetch(`${srv.base}/event?host=${'h'.repeat(40)}`, { method: 'POST', headers: auth, body: raw('q3') });
  const h = (await replay(srv.base, auth)).find((e) => e.session === 'q3').host;
  assert.ok(h.length <= 32 && h.length > 0, h);
});

test('sem NIRVA_TOKEN, ?host= também vale', async () => {
  const s = await startServer();
  try {
    await fetch(`${s.base}/event?src=nirva-stage&host=maquina-c`, { method: 'POST', body: raw('q4') });
    assert.equal((await replay(s.base)).find((e) => e.session === 'q4').host, 'maquina-c');
  } finally { await s.stop(); }
});
