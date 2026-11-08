'use strict';
// FR-025: o relay nunca é ligado por padrão (só quando o usuário roda npm run relay).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('nenhum script npm além de "relay" chama o relay', () => {
  const { scripts } = JSON.parse(read('package.json'));
  for (const [k, v] of Object.entries(scripts)) if (k !== 'relay') assert.doesNotMatch(v, /relay/, `script ${k} chama o relay`);
});

test('a imagem Docker não roda o relay por padrão', () => {
  const lines = read('Dockerfile').split('\n').filter((l) => /^\s*(CMD|ENTRYPOINT)\b/.test(l));
  assert.ok(lines.length > 0, 'Dockerfile sem CMD');
  for (const l of lines) assert.doesNotMatch(l, /relay/);
});

test('docker-compose.yml, o instalador e o servidor não ligam o relay', () => {
  // mencionar o relay num conselho ao usuário é ok; carregar ou executar scripts/relay.js não
  const runsRelay = /scripts[\\/]relay|relay\.js/;
  assert.doesNotMatch(read('docker-compose.yml'), runsRelay);
  assert.doesNotMatch(read('install-hooks.js'), runsRelay);
  assert.doesNotMatch(read('server.js'), runsRelay);
});
