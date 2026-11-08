'use strict';
// T09 / T10 / RF09 / FR-022 / I1: o relay leva os transcripts ao palco, em ordem,
// com host, sem conteúdo sensível, e rápido.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT, cleanEnv, startServer, readSSE } = require('./helpers');

const FX = path.join(__dirname, 'fixtures', 'transcripts');
const TOKEN = 'tok-relay-teste-777';
const expected = JSON.parse(fs.readFileSync(path.join(FX, 'expected.json'), 'utf8')).events;
const SECRETS = ['SEGREDO-PROMPT-123', 'CONTEUDO-SECRETO-456', '--token=XYZ', 'XYZ', '/home/fx/secret', 'senha-secreta', 'procura o segredo'];

function startRelay(args, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['scripts/relay.js', ...args], { cwd: ROOT, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const api = {
      proc, out: () => out,
      stop: () => new Promise((r) => { proc.removeAllListeners('exit'); if (proc.exitCode !== null) return r(); proc.once('exit', r); proc.kill(); }),
    };
    const t = setTimeout(() => reject(new Error('relay não ligou:\n' + out)), 5000);
    proc.stdout.on('data', (c) => { out += c; if (out.includes('[transcripts] acompanhando')) { clearTimeout(t); resolve(api); } });
    proc.stderr.on('data', (c) => { out += c; });
    proc.on('exit', (code) => { clearTimeout(t); reject(new Error(`relay saiu com ${code}:\n${out}`)); });
  });
}

let srv, relay, tmp, main;
const auth = { authorization: `Bearer ${TOKEN}` };
async function eventsCount() { return (await (await fetch(srv.base + '/health', { headers: auth })).json()).events; }
async function waitEvents(n, ms = 6000) {
  const t0 = Date.now(); let c = 0;
  while (Date.now() - t0 < ms) { c = await eventsCount(); if (c >= n) return c; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error(`esperava ${n} eventos, chegaram ${c}\n${relay && relay.out()}`);
}

before(async () => {
  srv = await startServer({ env: { NIRVA_TOKEN: TOKEN } });
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nirva-relay-'));
  fs.mkdirSync(path.join(tmp, 'projeto-fx'));
  main = path.join(tmp, 'projeto-fx', 'fx-sessao.jsonl');
  fs.copyFileSync(path.join(FX, 'seed.jsonl'), main);
  relay = await startRelay(['--url', srv.base + '/event', '--token', TOKEN, '--dir', tmp, '--host', 'maq-relay']);
});
after(async () => {
  if (relay) await relay.stop();
  if (srv) await srv.stop();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('T09: os 13 eventos chegam em ordem, com host e tipo de subagente', async () => {
  await waitEvents(1); // SessionStart da varredura inicial
  fs.appendFileSync(main, fs.readFileSync(path.join(FX, 'main-a.jsonl')));
  await waitEvents(5);
  const sub = path.join(tmp, 'projeto-fx', 'fx-sessao', 'subagents');
  fs.mkdirSync(sub, { recursive: true });
  fs.copyFileSync(path.join(FX, 'agent-fx1.jsonl'), path.join(sub, 'agent-fx1.jsonl'));
  await waitEvents(8);
  fs.appendFileSync(main, fs.readFileSync(path.join(FX, 'main-b.jsonl')));
  await waitEvents(13);
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(await eventsCount(), 13, 'chegaram eventos a mais');

  const { events, raw } = await readSSE(srv.base + '/events', { headers: auth, names: ['replay'] });
  const got = events.find((e) => e.event === 'replay').data;
  assert.equal(got.length, 13);
  expected.forEach((exp, i) => {
    for (const [k, v] of Object.entries(exp)) assert.equal(got[i][k], v, `evento ${i + 1} (${exp.event}): campo ${k}`);
    assert.equal(got[i].host, 'maq-relay', `evento ${i + 1} sem host`);
    assert.equal(got[i].project, 'projeto-fx', `evento ${i + 1} sem projeto`);
    assert.equal(got[i].session, 'fx-sessao');
  });

  // T10: nada sensível no fluxo SSE
  for (const s of SECRETS) assert.ok(!raw.includes(s), `vazou "${s}" no SSE`);
});

test('I1: linha nova num transcript acompanhado chega ao palco em menos de 2 s', async () => {
  const live = readSSE(srv.base + '/events', { headers: auth, names: ['message'], untilCount: 1, timeoutMs: 4000 });
  await new Promise((r) => setTimeout(r, 300));
  const t0 = Date.now();
  const line = { type: 'assistant', cwd: '/home/fx/projeto-fx', sessionId: 'fx-sessao', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu-lat', name: 'Glob', input: { pattern: '*.md' } }] } };
  fs.appendFileSync(main, JSON.stringify(line) + '\n');
  const { events } = await live;
  const ms = Date.now() - t0;
  const ev = events.find((e) => e.event === 'message');
  assert.ok(ev, 'evento não chegou');
  assert.equal(ev.data.tool, 'Glob');
  assert.ok(ms < 2000, `latência ${ms} ms`);
  console.log(`# latência relay → palco: ${ms} ms`);
});

test('o relay nunca imprime o token', () => {
  assert.ok(relay.out().includes('Relay ligado'));
  assert.ok(!relay.out().includes(TOKEN), relay.out());
});
