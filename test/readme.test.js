'use strict';
// FR-029 / E4 4.4 / C2: o README documenta o palco remoto e o aviso de governança.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

test('README tem o aviso de governança para máquinas corporativas', () => {
  assert.match(md, /nomes de projetos e de arquivos saem da máquina/i);
  assert.match(md, /nunca é ligado por padrão/i);
});

test('README explica túneis, token, relay e compose remoto', () => {
  for (const s of ['Tailscale', 'Cloudflare', 'npm run relay', 'npm run token', 'docker-compose.remote.yml', 'NIRVA_TOKEN', 'NIRVA_INSECURE', ':ro', '--no-healthcheck']) {
    assert.ok(md.includes(s), `faltou "${s}" no README`);
  }
});

test('README avisa que o hook HTTP envia o payload completo ao palco', () => {
  assert.match(md, /hook HTTP[^\n]*payload completo/i);
});

test('README tem changelog da 1.2.0', () => {
  assert.match(md, /1\.2\.0/);
});
