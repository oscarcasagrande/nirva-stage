'use strict';
// T005 / FR-022 (decisão C1-b): campo host e modo estrito para envio remoto.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, sanitize } = require('../lib/normalize');

const pre = (tool, input, extra = {}) => ({ hook_event_name: 'PreToolUse', session_id: 's1', cwd: '/home/u/proj', tool_name: tool, tool_input: input, ...extra });

test('normalize: host vem da opção e é cortado em 32', () => {
  assert.equal(normalize(pre('Read', { file_path: '/a/b.txt' }), { host: 'maq' }).host, 'maq');
  assert.equal(normalize(pre('Read', { file_path: '/a/b.txt' })).host, '');
  assert.ok(normalize(pre('Read', {}), { host: 'x'.repeat(40) }).host.length <= 32);
});

test('sanitize: preserva host com até 32 caracteres', () => {
  const ev = normalize(pre('Read', { file_path: '/a/b.txt' }));
  assert.equal(sanitize({ ...ev, host: 'casa' }).host, 'casa');
  assert.ok(sanitize({ ...ev, host: 'y'.repeat(40) }).host.length <= 32);
  assert.equal(sanitize(ev).host, '');
});

test('limites antigos continuam iguais', () => {
  const ev = sanitize({ v: 1, event: 'PreToolUse', session: 's'.repeat(100), detail: 'd'.repeat(100), project: 'p'.repeat(100), note: 'n'.repeat(200) });
  assert.ok(ev.session.length <= 64); assert.ok(ev.detail.length <= 40);
  assert.ok(ev.project.length <= 40); assert.ok(ev.note.length <= 80);
});

test('modo normal (v1.1) não muda', () => {
  assert.equal(normalize(pre('Grep', { pattern: 'TODO' })).detail, 'TODO');
  assert.equal(normalize(pre('Bash', { command: 'git push', description: 'Envia o código' })).detail, 'Envia o código');
  assert.equal(normalize({ hook_event_name: 'Notification', session_id: 's', message: 'Claude precisa de você' }).note, 'Claude precisa de você');
});

test('modo estrito: só ferramenta, nome do arquivo, primeira palavra do comando e host da URL', () => {
  const s = (tool, input) => normalize(pre(tool, input), { strict: true }).detail;
  assert.equal(s('Read', { file_path: '/home/u/secret/notas.md' }), 'notas.md');
  assert.equal(s('Bash', { command: 'deploy --token=XYZ', description: 'Publica com o token XYZ' }), 'deploy');
  assert.equal(s('WebFetch', { url: 'https://exemplo.com/caminho?q=segredo' }), 'exemplo.com');
  assert.equal(s('Grep', { pattern: 'senha-secreta' }), '');
  assert.equal(s('Glob', { pattern: '**/segredo*' }), '');
  assert.equal(s('WebSearch', { query: 'como vazar dados' }), '');
  assert.equal(s('Task', { subagent_type: 'Explore', description: 'procura o segredo' }), 'Explore');
  assert.equal(s('Task', { description: 'procura o segredo' }), '');
  const n = normalize({ hook_event_name: 'Notification', session_id: 's', message: 'texto sensível', notification_type: 'idle' }, { strict: true });
  assert.equal(n.note, ''); assert.equal(n.ntype, 'idle');
});
