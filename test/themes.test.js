'use strict';
// Temas de cor (v1.3): T11 (THEMES no código = docs/temas-de-cor.json) e RF02 (literais do
// cenário saíram do código), mais a legenda e o README citando a feature.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./helpers');

const HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const JSON_THEMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'temas-de-cor.json'), 'utf8'));

function themesBlock() {
  const a = HTML.indexOf('// <themes>'), b = HTML.indexOf('// </themes>');
  assert.ok(a >= 0 && b > a, 'faltam os marcadores // <themes> e // </themes> em public/index.html');
  return { a, b, src: HTML.slice(a, b) };
}
function loadThemes() {
  const ctx = {};
  vm.runInNewContext(themesBlock().src + '\n;this.THEMES = THEMES; this.THEME_DEFAULT = typeof THEME_DEFAULT === "undefined" ? undefined : THEME_DEFAULT;', ctx);
  return ctx;
}

test('T11: THEMES tem os mesmos 6 temas do JSON, na mesma ordem e com as mesmas cores', () => {
  const { THEMES } = loadThemes();
  assert.deepEqual(JSON.parse(JSON.stringify(THEMES.map((t) => t.id))), JSON_THEMES.themes.map((t) => t.id));
  for (let i = 0; i < JSON_THEMES.themes.length; i++) {
    // JSON.parse(JSON.stringify()) tira os protótipos do outro contexto do vm
    assert.deepStrictEqual(JSON.parse(JSON.stringify(THEMES[i])), JSON_THEMES.themes[i], `tema ${JSON_THEMES.themes[i].id} diverge do JSON`);
  }
});

test('T11: todo tema tem todas as chaves de "keys" e crowd com 4 cores', () => {
  const { THEMES } = loadThemes();
  const keys = Object.keys(JSON_THEMES.keys);
  for (const t of THEMES) {
    for (const k of keys) assert.ok(k in t, `${t.id} sem ${k}`);
    assert.equal(t.crowd.length, 4, `${t.id}: crowd`);
    for (const k of keys) if (!['washA', 'washB', 'overlay', 'crowd'].includes(k)) assert.match(t[k], /^#[0-9a-f]{6}$/i, `${t.id}.${k}`);
    for (const k of ['washA', 'washB', 'overlay']) assert.match(t[k], /^\d{1,3},\d{1,3},\d{1,3}$/, `${t.id}.${k}`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(THEMES.filter((t) => t.floorGrid).map((t) => t.id))), ["synthwave"]);
});

test('T11: o tema padrão do código é o "default" do JSON', () => {
  assert.equal(loadThemes().THEME_DEFAULT, JSON_THEMES.default);
});

test('RF02: os literais de cor do cenário saíram do código (fora do bloco THEMES)', () => {
  const { a, b } = themesBlock();
  const rest = HTML.slice(0, a) + HTML.slice(b);
  const count = (s) => rest.split(s).length - 1;
  const zero = ['#120d20', '#221a38', '#1d1631', '#2b2247', '#251c3e', '#140f22', '#161026', '#120c1f', '#0c0816',
    '#3a2a24', '#35261f', '#2a1d18', '#2b2233', '#241c2b', '#1b1422', '#1b1318', '#5a4038', '#0a0712',
    '#3a3848', '#2c2a38', '#151019', '#1b1430', '#4a2038', '#1b3c44', '#0e0b18', '#120e1f', '#0b0914', '#151127',
    '#3a2f5a', '6,3,14'];
  for (const lit of zero) assert.equal(count(lit), 0, `literal ${lit} ainda está no código`);
  // exceções legítimas, fora do cenário: CSS dos botões, banquinho, :root e outro desenho que reusa a cor
  const allowed = { '#3a2f44': 1, '255,79,163': 2, '62,242,255': 1, '#2a2233': 3, '#07050d': 1 };
  for (const [lit, n] of Object.entries(allowed)) assert.equal(count(lit), n, `literal ${lit}: esperado ${n} ocorrência(s) fora do cenário`);
});

test('Fora de escopo: ACT e SESSION_COLORS continuam com as cores da v1.2', () => {
  const sc = /const SESSION_COLORS = (\[[^\]]+\]);/.exec(HTML);
  assert.ok(sc, 'SESSION_COLORS sumiu');
  assert.deepEqual(JSON.parse(sc[1].replace(/'/g, '"')), ['#ff4fa3', '#3ef2ff', '#ffe66d', '#7dff9a', '#b48cff', '#ff8a3d', '#6ea8ff', '#ff6b6b']);
  const act = HTML.slice(HTML.indexOf('const ACT = {'), HTML.indexOf('};', HTML.indexOf('const ACT = {')));
  const cores = [...act.matchAll(/c:\s*'(#[0-9a-f]{6})'/gi)].map((m) => m[1]);
  assert.deepEqual(cores, ACT_V12);
});

// cores de ACT na v1.2, na ordem em que aparecem (capturadas antes da feature)
const ACT_V12 = ['#c9c3e6', '#6ec6ff', '#ff5fa2', '#ffb547', '#7dff9a', '#b48cff', '#ffffff', '#ffe66d', '#9ad7ff',
  '#ff4fa3', '#ffb000', '#ff3b3b', '#3ef2ff', '#3ef2ff', '#6b6488'];

test('FR-013: a legenda (H) cita a tecla C e o menu 🎨', () => {
  const help = HTML.slice(HTML.indexOf('<div id="help"'), HTML.indexOf('</div>', HTML.indexOf('<div id="help"')));
  assert.match(help, /<kbd>C<\/kbd>/);
  assert.match(help, /🎨/);
});

test('FR-013: o README cita a tecla C, o menu 🎨, ?theme= e os 6 temas', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /`C`/);
  assert.match(readme, /🎨/);
  assert.match(readme, /\?theme=/);
  for (const t of JSON_THEMES.themes) assert.ok(readme.includes(t.name), `README sem o tema ${t.name}`);
});

test('UI: botão 🎨 antes do 🔇, com title e menu acessível (contrato)', () => {
  const ctrl = HTML.slice(HTML.indexOf('<div id="ctrl"'), HTML.indexOf('</div>', HTML.indexOf('<div id="ctrl"')));
  assert.ok(ctrl.indexOf('id="bTheme"') >= 0 && ctrl.indexOf('id="bTheme"') < ctrl.indexOf('id="bSound"'), '🎨 deve vir antes do 🔇');
  assert.match(ctrl, /title="Tema do palco \(C\)"/);
  assert.match(HTML, /id="themeMenu"[^>]*role="menu"/);
  assert.match(HTML, /'menuitemradio'/);
  assert.match(HTML, /id="themeToast"[^>]*role="status"/);
});
