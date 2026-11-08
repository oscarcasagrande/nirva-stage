'use strict';
// Constituição I / FR-031: zero dependências npm em runtime; só módulos nativos do Node.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const { ROOT } = require('./helpers');

test('package.json não declara dependências', () => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(p.dependencies, undefined);
  assert.equal(p.devDependencies, undefined);
  assert.equal(p.optionalDependencies, undefined);
});

test('o código de runtime só faz require de módulos nativos ou arquivos locais', () => {
  const files = ['server.js', 'hook.js', 'install-hooks.js',
    ...fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.js')).map((f) => 'lib/' + f),
    ...fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.js')).map((f) => 'scripts/' + f)];
  const native = new Set(builtinModules.flatMap((m) => [m, 'node:' + m]));
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const [, mod] of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      assert.ok(native.has(mod) || mod.startsWith('.'), `${f} usa o módulo externo "${mod}"`);
    }
  }
});

test('public/ só carrega o vendor permitido (qrcode.js)', () => {
  const vendor = fs.readdirSync(path.join(ROOT, 'public', 'vendor'));
  assert.deepEqual(vendor, ['qrcode.js']);
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assert.equal(src, 'vendor/qrcode.js');
});
