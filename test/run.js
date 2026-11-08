#!/usr/bin/env node
'use strict';
// Roda todos os test/*.test.js com o executor nativo (node:test).
// Lista explícita: o padrão do `node --test` sem argumentos pegaria scripts/send-test.js.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const only = process.argv.slice(2);
const files = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort()
  .map((f) => path.join(dir, f));
if (!files.length) { console.error('Nenhum teste encontrado.'); process.exit(1); }
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
