'use strict';
// Constituição VII / FR-032: mensagens ao usuário da v1.2 em português.
// Os testes de comportamento já verificam quando cada mensagem aparece; aqui garantimos o idioma.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const MESSAGES = {
  'server.js': [
    'Recusei iniciar',                       // guarda RS01
    'npm run token',
    'ATENÇÃO: palco exposto na rede sem token', // NIRVA_INSECURE
    'Este palco exige um token',             // página de login
    'Token inválido',
    'Entrar',
    'Autenticação: ligada',
  ],
  'scripts/relay.js': [
    'Relay ligado:',
    'O palco recusou o token (401)',
    'sem criptografia',
    'Uso: npm run relay',
    'Palco inacessível',
    'tentando de novo a cada',
  ],
  'scripts/doctor.js': [
    'O palco exige token',
  ],
  'install-hooks.js': [
    'envia o payload completo',
    'O token fica gravado no settings.json',
  ],
};

for (const [file, phrases] of Object.entries(MESSAGES)) {
  test(`${file}: mensagens da v1.2 em português`, () => {
    const src = read(file);
    for (const p of phrases) assert.ok(src.includes(p), `${file} não tem a mensagem "${p}"`);
  });
}

test('nenhuma mensagem nova em inglês nos avisos comuns', () => {
  for (const file of Object.keys(MESSAGES)) {
    const src = read(file);
    for (const en of ['Unauthorized', 'Invalid token', 'Usage:', 'Warning:', 'Refusing to start']) {
      assert.ok(!src.includes(en), `${file} contém "${en}"`);
    }
  }
});
