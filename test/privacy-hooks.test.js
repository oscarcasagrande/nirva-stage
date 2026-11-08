'use strict';
// T10 nos caminhos de hook (G2) e decisão C1-b: no envio remoto só sai o que o
// Princípio II permite (ferramenta, nome do arquivo, primeira palavra do comando, host da URL).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const http = require('http');
const { startServer, runNode, readSSE } = require('./helpers');

const TOKEN = 'tok-privacidade';
const SEGREDOS = ['SEGREDO-PROMPT-123', 'CONTEUDO-SECRETO-456', '--token=XYZ', 'XYZ', 'senha-secreta', 'texto-sensivel', '/home/fx/secret'];
const base = { session_id: 'priv', cwd: '/home/fx/projeto-fx' };
const PAYLOADS = [
  { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'SEGREDO-PROMPT-123' },
  { ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/home/fx/secret/notas.md' } },
  { ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: '/home/fx/secret/notas.md' }, tool_response: { content: 'CONTEUDO-SECRETO-456' } },
  { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'deploy --token=XYZ', description: 'usa XYZ' } },
  { ...base, hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'senha-secreta' } },
  { ...base, hook_event_name: 'Notification', message: 'texto-sensivel', notification_type: 'idle' },
];

test('hook HTTP (payload bruto) num palco com token: nada sensível no fluxo SSE', async () => {
  const s = await startServer({ env: { NIRVA_TOKEN: TOKEN } });
  try {
    for (const p of PAYLOADS) {
      const r = await fetch(`${s.base}/event?src=nirva-stage&host=remota&token=${TOKEN}`, { method: 'POST', body: JSON.stringify(p) });
      assert.equal(r.status, 200);
    }
    const { raw, events } = await readSSE(s.base + '/events', { headers: { authorization: `Bearer ${TOKEN}` }, untilCount: 1, names: ['replay'] });
    const replay = events.find((e) => e.event === 'replay').data;
    assert.equal(replay.length, PAYLOADS.length);
    for (const seg of SEGREDOS) assert.ok(!raw.includes(seg), `vazou "${seg}" no SSE`);
    assert.ok(replay.some((e) => e.detail === 'notas.md'));
    assert.ok(replay.some((e) => e.detail === 'deploy'));
  } finally { await s.stop(); }
});

test('sem token (palco local, v1.1), o resumo continua como antes', async () => {
  const s = await startServer();
  try {
    await fetch(`${s.base}/event`, { method: 'POST', body: JSON.stringify(PAYLOADS[3]) });
    const { events } = await readSSE(s.base + '/events', { untilCount: 1, names: ['replay'] });
    assert.equal(events.find((e) => e.event === 'replay').data[0].detail, 'usa XYZ');
  } finally { await s.stop(); }
});

// Um IPv4 de rede da própria máquina: é um destino "não loopback" de verdade, sem sair dela.
const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);

async function capture(listenHost, urlHost, payload) {
  let body = null;
  const s = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { body = JSON.parse(b); res.end('{}'); }); });
  await new Promise((r) => s.listen(0, listenHost, r));
  try {
    const r = await runNode('hook.js', ['--nirva-stage', '--url', `http://${urlHost}:${s.address().port}/event`], { stdin: JSON.stringify(payload) });
    assert.equal(r.code, 0);
    return body;
  } finally { s.close(); }
}

test('hook.js para destino não loopback usa o resumo estrito', { skip: lanIp ? false : 'sem IPv4 de rede nesta máquina' }, async () => {
  const bash = await capture(lanIp.address, lanIp.address, PAYLOADS[3]);
  assert.ok(bash, 'o servidor de teste não recebeu o evento');
  assert.equal(bash.detail, 'deploy');
  const grep = await capture(lanIp.address, lanIp.address, PAYLOADS[4]);
  assert.equal(grep.detail, '');
  const note = await capture(lanIp.address, lanIp.address, PAYLOADS[5]);
  assert.equal(note.note, '');
  for (const ev of [bash, grep, note]) for (const seg of SEGREDOS) assert.ok(!JSON.stringify(ev).includes(seg), `vazou "${seg}"`);
});

test('hook.js para loopback mantém o resumo da v1.1', async () => {
  const bash = await capture('127.0.0.1', '127.0.0.1', PAYLOADS[3]);
  assert.equal(bash.detail, 'usa XYZ');
});
