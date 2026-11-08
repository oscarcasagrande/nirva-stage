'use strict';
// RF14 / FR-028: npm run doctor usa NIRVA_TOKEN e explica quando o palco exige token.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, runNode } = require('./helpers');

const TOKEN = 'tok-doctor-987';
let srv, home;
before(async () => {
  srv = await startServer({ env: { NIRVA_TOKEN: TOKEN } });
  // HOME isolado: o doctor não lê nem executa os hooks reais do usuário
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'nirva-doctor-home-'));
});
after(async () => { await srv.stop(); fs.rmSync(home, { recursive: true, force: true }); });

const doctor = (env = {}) => runNode('scripts/doctor.js', [], {
  env: { NIRVA_PORT: String(srv.port), HOME: home, USERPROFILE: home, ...env }, timeoutMs: 20000,
});

test('sem NIRVA_TOKEN, explica que o palco exige token', async () => {
  const r = await doctor();
  const out = r.stdout + r.stderr;
  assert.match(out, /exige token/);
  assert.match(out, /NIRVA_TOKEN/);
  assert.doesNotMatch(out, /Nada respondendo/, 'o palco está no ar, só pede token');
});

test('com NIRVA_TOKEN certo, o palco aparece no ar e o token não é impresso', async () => {
  const r = await doctor({ NIRVA_TOKEN: TOKEN });
  const out = r.stdout + r.stderr;
  assert.match(out, /Palco no ar/);
  assert.match(out, /NIRVA_TOKEN foi aceito/);
  assert.doesNotMatch(out, /exige token/);
  assert.ok(!out.includes(TOKEN), 'o token apareceu na saída');
});

test('tokens gravados nos hooks aparecem mascarados', async () => {
  const dir = path.join(home, '.claude'); fs.mkdirSync(dir, { recursive: true });
  const settings = { hooks: {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'node "/nao/existe/hook.js" --nirva-stage --url http://x/event --token SEGREDO-CMD' }] }],
    SessionStart: [{ hooks: [{ type: 'http', url: `http://127.0.0.1:${srv.port}/event?src=nirva-stage&host=h&token=${TOKEN}` }] }],
  } };
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings));
  try {
    const r = await doctor({ NIRVA_TOKEN: TOKEN });
    const out = r.stdout + r.stderr;
    assert.match(out, /Hooks no Claude Code/);
    assert.match(out, /token(=|\s)\*\*\*\*/);
    assert.ok(!out.includes('SEGREDO-CMD'), 'token do hook de comando apareceu');
    assert.ok(!out.includes(TOKEN), 'token do hook HTTP apareceu');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('com NIRVA_TOKEN errado, avisa que o palco recusou', async () => {
  const r = await doctor({ NIRVA_TOKEN: 'outro-token' });
  const out = r.stdout + r.stderr;
  assert.match(out, /exige token e recusou/);
  assert.ok(!out.includes('outro-token'));
});
