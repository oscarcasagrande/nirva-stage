'use strict';
// RF12 / FR-027: docker-compose.remote.yml exige NIRVA_TOKEN e publica a porta só em 127.0.0.1.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, cleanEnv } = require('./helpers');

const FILE = path.join(ROOT, 'docker-compose.remote.yml');

test('o arquivo exige NIRVA_TOKEN e publica só em 127.0.0.1', () => {
  const y = fs.readFileSync(FILE, 'utf8');
  assert.match(y, /"127\.0\.0\.1:4321:4321"/);
  assert.match(y, /\$\{NIRVA_TOKEN:\?/);
  assert.match(y, /ghcr\.io\/oscarcasagrande\/nirva-stage/);
  const ports = y.split('\n').filter((l) => /^\s*-\s*"?[\d.]*:?\d+:\d+"?\s*$/.test(l));
  for (const l of ports) assert.match(l, /127\.0\.0\.1:/, 'porta publicada fora do 127.0.0.1: ' + l);
});

const compose = (env) => spawnSync('docker', ['compose', '-f', FILE, 'config'], { cwd: ROOT, env: cleanEnv(env), encoding: 'utf8', timeout: 30000 });
const hasDocker = (() => { try { return spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', timeout: 15000 }).status === 0; } catch { return false; } })();

test('docker compose config falha sem NIRVA_TOKEN e passa com ele', { skip: hasDocker ? false : 'Docker indisponível' }, () => {
  const sem = compose({});
  assert.notEqual(sem.status, 0, 'deveria falhar sem NIRVA_TOKEN');
  assert.match(sem.stderr + sem.stdout, /defina NIRVA_TOKEN/);
  const com = compose({ NIRVA_TOKEN: 'tok-compose' });
  assert.equal(com.status, 0, com.stderr);
  assert.match(com.stdout, /host_ip: 127\.0\.0\.1/);
});
