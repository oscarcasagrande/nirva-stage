'use strict';
// RF07 / RS07 / FR-016 / FR-017: instalador com --url e --token.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runNode } = require('./helpers');

const TOKEN = 'abcdef123456';
const EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact'];

function tmpSettings(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nirva-inst-'));
  const file = path.join(dir, 'settings.json');
  if (initial) fs.writeFileSync(file, JSON.stringify(initial, null, 2));
  return { dir, file, read: () => JSON.parse(fs.readFileSync(file, 'utf8')), rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const ours = (h) => String(h.command || '').includes('--nirva-stage') || String(h.url || '').includes('nirva-stage');
const oursIn = (settings, ev) => (settings.hooks[ev] || []).flatMap((g) => g.hooks).filter(ours);

test('hook de comando recebe --url e --token; a saída mascara o token', async () => {
  const s = tmpSettings();
  try {
    const r = await runNode('install-hooks.js', ['--settings', s.file, '--url', 'https://palco.exemplo/event', '--token', TOKEN]);
    assert.equal(r.code, 0, r.stderr);
    const cfg = s.read();
    for (const ev of EVENTS) {
      const hs = oursIn(cfg, ev);
      assert.equal(hs.length, 1, ev);
      assert.equal(hs[0].type, 'command');
      assert.match(hs[0].command, /hook\.js" --nirva-stage --url https:\/\/palco\.exemplo\/event --token abcdef123456$/);
    }
    assert.ok(!r.stdout.includes(TOKEN), 'o token apareceu na saída:\n' + r.stdout);
    assert.ok(r.stdout.includes('abcd…'));
  } finally { s.rm(); }
});

test('hook HTTP leva src, host e token na query; avisa sobre o payload completo', async () => {
  const s = tmpSettings();
  try {
    const r = await runNode('install-hooks.js', ['--settings', s.file, '--http', '--url', 'https://palco.exemplo/event', '--token', TOKEN]);
    assert.equal(r.code, 0, r.stderr);
    const h = oursIn(s.read(), 'Stop')[0];
    assert.equal(h.type, 'http');
    const u = new URL(h.url);
    assert.equal(u.origin + u.pathname, 'https://palco.exemplo/event');
    assert.equal(u.searchParams.get('src'), 'nirva-stage');
    assert.equal(u.searchParams.get('host'), os.hostname());
    assert.equal(u.searchParams.get('token'), TOKEN);
    assert.ok(!r.stdout.includes(TOKEN), 'o token apareceu na saída:\n' + r.stdout);
    assert.ok(r.stdout.includes('abcd…'));
    assert.match(r.stdout, /payload completo/);
  } finally { s.rm(); }
});

test('hook HTTP local (loopback) não mostra o aviso de payload', async () => {
  const s = tmpSettings();
  try {
    const r = await runNode('install-hooks.js', ['--settings', s.file, '--http']);
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /payload completo/);
    const u = new URL(oursIn(s.read(), 'Stop')[0].url);
    assert.equal(u.searchParams.get('src'), 'nirva-stage');
    assert.equal(u.searchParams.get('host'), os.hostname());
    assert.equal(u.searchParams.get('token'), null);
  } finally { s.rm(); }
});

test('reinstalar não duplica, preserva hooks de terceiros e --uninstall remove só os nossos', async () => {
  const outro = { type: 'command', command: 'echo outro' };
  const s = tmpSettings({ hooks: { Stop: [{ hooks: [outro] }] }, theme: 'dark' });
  try {
    await runNode('install-hooks.js', ['--settings', s.file, '--url', 'http://a/event', '--token', 'primeiro-token']);
    await runNode('install-hooks.js', ['--settings', s.file, '--http', '--url', 'http://b/event', '--token', TOKEN]);
    let cfg = s.read();
    for (const ev of EVENTS) assert.equal(oursIn(cfg, ev).length, 1, ev);
    assert.match(oursIn(cfg, 'Stop')[0].url, /^http:\/\/b\/event\?/);
    assert.ok(cfg.hooks.Stop.flatMap((g) => g.hooks).some((h) => h.command === 'echo outro'));
    assert.equal(cfg.theme, 'dark');
    await runNode('install-hooks.js', ['--settings', s.file, '--uninstall']);
    cfg = s.read();
    assert.deepEqual(cfg.hooks, { Stop: [{ hooks: [outro] }] });
  } finally { s.rm(); }
});
