'use strict';
// T12 / RF11 / FR-026: com mais de uma máquina, os rótulos mostram "projeto @máquina".

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./helpers');

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

function loadProjName() {
  const a = html.indexOf('// <projName>'), b = html.indexOf('// </projName>');
  assert.ok(a >= 0 && b > a, 'marcadores // <projName> … // </projName> não encontrados em public/index.html');
  const ctx = {};
  vm.runInNewContext(html.slice(a, b) + '\nthis.projName = projName;', ctx);
  return ctx.projName;
}
const map = (...list) => new Map(list.map((s, i) => [s.id || 'id' + i, s]));
const S = (project, host, ended = false, id) => ({ id: id || project + '@' + host, project, host, ended });

test('uma máquina só: rótulo igual ao da v1.1', () => {
  const projName = loadProjName();
  const a = S('proj', 'casa'), b = S('outro', 'casa');
  const all = map(a, b);
  assert.equal(projName(a, all), 'proj');
  assert.equal(projName(b, all), 'outro');
  const semHost = S('proj', '');
  assert.equal(projName(semHost, map(semHost)), 'proj');
});

test('duas máquinas: rótulo "projeto @máquina"', () => {
  const projName = loadProjName();
  const a = S('proj', 'casa'), b = S('proj', 'estacao');
  const all = map(a, b);
  assert.equal(projName(a, all), 'proj @casa');
  assert.equal(projName(b, all), 'proj @estacao');
});

test('sessão sem host convive com uma com host: só a com host ganha @', () => {
  const projName = loadProjName();
  const a = S('proj', ''), b = S('proj', 'estacao');
  const all = map(a, b);
  assert.equal(projName(a, all), 'proj');
  assert.equal(projName(b, all), 'proj @estacao');
});

test('sessões encerradas não contam como máquina', () => {
  const projName = loadProjName();
  const a = S('proj', 'casa'), b = S('velho', 'estacao', true);
  assert.equal(projName(a, map(a, b)), 'proj');
});

test('sem projeto usa o nome reserva', () => {
  const projName = loadProjName();
  const a = S('', 'casa'), b = S('x', 'estacao');
  assert.equal(projName(a, map(a, b)), 'Claude @casa');
  assert.equal(projName(a, map(a, b), 'sessão'), 'sessão @casa');
  assert.equal(projName(a, map(a)), 'Claude');
});

test('a sessão guarda o host do evento', () => {
  const a = html.indexOf('function getSession('), body = html.slice(a, html.indexOf('\n}\n', a));
  assert.match(body, /host:\s*ev\.host/);
  assert.match(body, /if \(!s\.host && ev\.host\) s\.host = ev\.host/);
});

test('G1: chip, registro, vocalista e notificação usam projName', () => {
  const fn = (name) => { const a = html.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return html.slice(a, html.indexOf('\n}\n', a)); };
  assert.match(fn('renderChips'), /name: projName\(s, sessions, 'sessão'\)/, 'chip');
  assert.match(fn('pushLog'), /projName\(s, sessions\)/, 'registro');
  assert.match(fn('drawLabels'), /'🎤 ' \+ projName\(s, sessions\)/, 'vocalista');
  assert.match(fn('alertUser'), /'Nirva Stage: ' \+ projName\(s, sessions\)/, 'notificação');
  for (const name of ['renderChips', 'pushLog', 'drawLabels', 'alertUser']) {
    assert.doesNotMatch(fn(name), /s\.project \|\| '(Claude|sessão)'/, `${name} ainda usa s.project solto`);
  }
});
