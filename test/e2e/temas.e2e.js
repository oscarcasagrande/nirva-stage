#!/usr/bin/env node
'use strict';
// e2e dos temas de cor (T01–T10 de docs/prd-temas-de-cor.md) com Playwright.
// Ferramenta de desenvolvimento: NÃO é dependência do projeto (constituição I).
//
//   npm i --no-save playwright@1.49.1        (ou NODE_PATH=<pasta>/node_modules)
//   node test/e2e/temas.e2e.js               roda tudo e grava docs/temas/<id>.png
//   node test/e2e/temas.e2e.js --only T01,T05
//
// Usa o Chrome instalado no sistema (channel: 'chrome'). Sobe o próprio server.js
// numa porta livre e derruba no fim.

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright não encontrado: rode npm i --no-save playwright@1.49.1 ou defina NODE_PATH');
  process.exit(1);
}
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const JSON_THEMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'temas-de-cor.json'), 'utf8')).themes;
const IDS = JSON_THEMES.map((t) => t.id);
const NAME = Object.fromEntries(JSON_THEMES.map((t) => [t.id, t.name]));
const NEON_V12_HASH = '2ff1a33d'; // quadro determinístico da v1.2 (specs/002-temas-de-cor/research.md R02)
const SHOTS = path.join(ROOT, 'docs', 'temas');

const argOnly = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1].split(',').map((s) => s.trim().toUpperCase()) : null; })();

// ---------------------------------------------------------------- servidor
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref(); s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
async function startServer() {
  const port = await freePort();
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('NIRVA_')) env[k] = v;
  Object.assign(env, { NIRVA_PORT: String(port), NIRVA_DOCKER: '0' });
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (c) => { out += c; }); proc.stderr.on('data', (c) => { out += c; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('o palco não subiu em 5 s:\n' + out)), 5000);
    proc.stdout.on('data', () => { if (out.includes('Nirva Stage no ar')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (code) => { clearTimeout(t); reject(new Error(`o palco saiu com código ${code}:\n${out}`)); });
  });
  proc.removeAllListeners('exit');
  return { port, base: `http://localhost:${port}`, stop: () => { try { proc.kill(); } catch { /* já saiu */ } } };
}

// ---------------------------------------------------------------- navegador
let browser;
const NET_ERR = /net::|EventSource|Failed to load resource|ERR_FILE_NOT_FOUND|ERR_CONNECTION/i;

// Página nova num contexto limpo (localStorage próprio). opts.storage: valor cru de nirva:theme.
async function openPage(url, { freeze = false, storage, ignoreNet = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  if (storage !== undefined) {
    await context.addInitScript((v) => { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('nirva:theme', v); sessionStorage.setItem('__seeded', '1'); } }, storage);
  }
  if (freeze) {
    await context.addInitScript(() => {
      let n = 0;
      window.requestAnimationFrame = (cb) => { if (n++ === 0) setTimeout(() => cb(12345), 50); return n; };
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !(ignoreNet && NET_ERR.test(m.text()))) errors.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  return { page, context, errors, close: () => context.close() };
}

// FNV-1a 32 bits dos pixels do canvas visível (mesmo algoritmo de pixels.js da preparação)
async function canvasHash(page) {
  return page.evaluate(() => {
    const c = document.getElementById('stage');
    const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  });
}
// Quadro determinístico: rAF congelado, um único quadro com t = 12345 ms.
async function frameHash(url, opts = {}) {
  const p = await openPage(url, { ...opts, freeze: true });
  try {
    await p.page.waitForTimeout(600);
    const hash = await canvasHash(p.page);
    const samples = opts.samples ? await p.page.evaluate((pts) => {
      const c = document.getElementById('stage'); const g = c.getContext('2d');
      return pts.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data).join(','));
    }, opts.samples) : null;
    return { hash, samples, errors: p.errors };
  } finally { await p.close(); }
}

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme || '');
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const noErrors = (errors, where) => assert(!errors.length, `erros no console (${where}): ${errors.join(' | ')}`);
async function hasUi(page) {
  const ok = await page.evaluate(() => !!(document.getElementById('bTheme') && document.getElementById('themeMenu')));
  assert(ok, 'botão #bTheme ou menu #themeMenu não existem (feature ainda não implementada?)');
}
const menuOpen = (page) => page.evaluate(() => { const m = document.getElementById('themeMenu'); return !!m && !m.classList.contains('hide'); });

// ---------------------------------------------------------------- testes
let srv;
const TESTS = {
  async T01() {
    for (const q of ['/', '/?theme=neon']) {
      const r = await frameHash(srv.base + q);
      noErrors(r.errors, q);
      assert(r.hash === NEON_V12_HASH, `${q}: hash ${r.hash} ≠ ${NEON_V12_HASH} (v1.2)`);
    }
  },

  async T02() {
    // troca pelo menu, tempo < 50 ms, legenda de atividades intacta
    const p = await openPage(srv.base + '/');
    try {
      await hasUi(p.page);
      const sw = () => p.page.evaluate(() => [...document.querySelectorAll('#help .sw')].map((e) => e.style.background));
      const before = await sw();
      for (const id of IDS) {
        await p.page.click('#bTheme');
        assert(await menuOpen(p.page), `menu não abriu para escolher ${id}`);
        const r = await p.page.evaluate((id) => {
          const el = document.querySelector(`#themeMenu [role="menuitemradio"][data-theme="${id}"]`);
          if (!el) return { missing: true };
          const t0 = performance.now(); el.click(); const dt = performance.now() - t0;
          return { dt, theme: document.documentElement.dataset.theme, checked: el.getAttribute('aria-checked') };
        }, id);
        assert(!r.missing, `item do menu para ${id} não existe`);
        assert(r.theme === id, `depois de escolher ${id}, data-theme = ${r.theme}`);
        assert(r.checked === 'true', `${id}: aria-checked = ${r.checked}`);
        assert(r.dt < 50, `${id}: troca levou ${r.dt.toFixed(1)} ms (limite 50 ms)`);
        assert(!(await menuOpen(p.page)), `menu não fechou depois de escolher ${id}`);
      }
      assert(JSON.stringify(await sw()) === JSON.stringify(before), 'as cores de atividade da legenda mudaram');
      noErrors(p.errors, 'menu');
    } finally { await p.close(); }
    // cada tema muda o quadro, e os 6 são diferentes entre si
    const hashes = {};
    for (const id of IDS) {
      const r = await frameHash(`${srv.base}/?theme=${id}`);
      noErrors(r.errors, id);
      hashes[id] = r.hash;
    }
    for (const id of IDS) if (id !== 'neon') assert(hashes[id] !== hashes.neon, `${id} desenha igual ao neon`);
    assert(new Set(Object.values(hashes)).size === IDS.length, `hashes repetidos: ${JSON.stringify(hashes)}`);
  },

  async T03() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      await page.goto(srv.base + '/', { waitUntil: 'load' });
      await hasUi(page);
      await page.click('#bTheme');
      await page.click('#themeMenu [data-theme="jazz"]');
      assert(await themeOf(page) === 'jazz', 'jazz não foi aplicado');
      await page.reload({ waitUntil: 'load' });
      assert(await themeOf(page) === 'jazz', `depois de recarregar: ${await themeOf(page)}`);
      noErrors(errors, 'reload');
    } finally { await context.close(); }
  },

  async T04() {
    const p = await openPage(srv.base + '/?theme=hacker', { storage: '"grunge"' });
    try {
      assert(await themeOf(p.page) === 'hacker', `data-theme = ${await themeOf(p.page)}`);
      const saved = await p.page.evaluate(() => localStorage.getItem('nirva:theme'));
      assert(saved === '"grunge"', `localStorage mudou para ${saved}`);
      noErrors(p.errors, '?theme=hacker');
    } finally { await p.close(); }
  },

  async T05() {
    for (const [url, storage] of [['/?theme=xyz', undefined], ['/', '{quebrado']]) {
      const p = await openPage(srv.base + url, { storage });
      try {
        await p.page.waitForTimeout(300);
        assert(await themeOf(p.page) === 'neon', `${url} ${storage || ''}: data-theme = ${await themeOf(p.page)}`);
        noErrors(p.errors, `${url} ${storage || ''}`);
      } finally { await p.close(); }
    }
  },

  async T06() {
    const p = await openPage(srv.base + '/');
    try {
      await hasUi(p.page);
      assert(await themeOf(p.page) === 'neon', 'não começou no neon');
      const order = [...IDS.slice(1), IDS[0]];
      for (const id of order) {
        await p.page.keyboard.press('c');
        assert(await themeOf(p.page) === id, `esperava ${id}, veio ${await themeOf(p.page)}`);
        const toast = await p.page.evaluate(() => { const t = document.getElementById('themeToast'); return t ? { shown: !t.classList.contains('hide'), text: t.textContent } : null; });
        assert(toast, '#themeToast não existe');
        assert(toast.shown && toast.text.includes(NAME[id]), `aviso não mostrou "${NAME[id]}": ${JSON.stringify(toast)}`);
      }
      await p.page.keyboard.press('Control+c');
      assert(await themeOf(p.page) === 'neon', 'Ctrl+C trocou o tema');
      noErrors(p.errors, 'tecla C');
    } finally { await p.close(); }
  },

  async T07() {
    const p = await openPage(srv.base + '/?demo');
    try {
      await hasUi(p.page);
      let chips = [];
      for (let i = 0; i < 20 && !chips.length; i++) { await p.page.waitForTimeout(500); chips = await p.page.$$eval('#chips .chip', (els) => els.map((e) => e.textContent.trim())); }
      assert(chips.length, 'o demo não pôs ninguém no palco');
      const conn = await p.page.textContent('#conn');
      for (const id of [...IDS.slice(1), IDS[0]]) {
        await p.page.click('#bTheme');
        await p.page.click(`#themeMenu [data-theme="${id}"]`);
      }
      await p.page.waitForTimeout(500); // renderChips roda a cada 400 ms
      const after = await p.page.$$eval('#chips .chip', (els) => els.map((e) => e.textContent.trim()));
      const lost = chips.filter((c) => !after.includes(c));
      assert(!lost.length, `sumiram do palco: ${lost.join(', ')}`);
      assert(await p.page.textContent('#conn') === conn, 'o estado da conexão mudou');
      noErrors(p.errors, 'demo');
    } finally { await p.close(); }
  },

  async T08() {
    const p = await openPage(srv.base + '/');
    try {
      await hasUi(p.page);
      await p.page.focus('#bTheme');
      await p.page.keyboard.press('Enter');
      assert(await menuOpen(p.page), 'Enter não abriu o menu');
      const focused = await p.page.evaluate(() => document.activeElement && document.activeElement.dataset.theme);
      assert(focused === 'neon', `foco inicial em ${focused}, esperava o tema ativo (neon)`);
      await p.page.keyboard.press('ArrowDown');
      await p.page.keyboard.press('Enter');
      assert(await themeOf(p.page) === 'synthwave', `ArrowDown + Enter aplicou ${await themeOf(p.page)}`);
      const checked = await p.page.evaluate(() => [...document.querySelectorAll('#themeMenu [role="menuitemradio"]')].filter((e) => e.getAttribute('aria-checked') === 'true').map((e) => e.dataset.theme));
      assert(JSON.stringify(checked) === '["synthwave"]', `aria-checked: ${JSON.stringify(checked)}`);
      assert(!(await menuOpen(p.page)), 'o menu não fechou com Enter');
      await p.page.focus('#bTheme');
      await p.page.keyboard.press('Enter');
      assert(await menuOpen(p.page), 'não reabriu');
      await p.page.keyboard.press('Escape');
      assert(!(await menuOpen(p.page)), 'Escape não fechou');
      const active = await p.page.evaluate(() => document.activeElement && document.activeElement.id);
      assert(active === 'bTheme', `foco foi para ${active}, esperava bTheme`);
      const role = await p.page.evaluate(() => document.getElementById('themeMenu').getAttribute('role'));
      assert(role === 'menu', `role do menu = ${role}`);
      noErrors(p.errors, 'teclado');
    } finally { await p.close(); }
  },

  async T09() {
    // escala 2 (1280×720 / 640×360): pixel lógico (x, y) → (2x, 2y)
    const pts = [];
    for (let y = 241; y <= 313; y += 12) for (let k = 2; k <= 30; k++) { const x = 20 * k; pts.push([2 * x, 2 * y], [2 * (x + 10), 2 * y]); }
    const frac = async (id) => {
      const r = await frameHash(`${srv.base}/?theme=${id}`, { samples: pts });
      noErrors(r.errors, id);
      let diff = 0; for (let i = 0; i < r.samples.length; i += 2) if (r.samples[i] !== r.samples[i + 1]) diff++;
      return diff / (r.samples.length / 2);
    };
    const grid = await frac('synthwave'), boards = await frac('neon');
    assert(grid >= 0.8, `synthwave: só ${(grid * 100).toFixed(0)}% das colunas da grade diferem (esperado ≥ 80%)`);
    assert(boards <= 0.3, `neon: ${(boards * 100).toFixed(0)}% diferem (esperado ≤ 30%, tábuas)`);
  },

  async T10() {
    const url = pathToFileURL(path.join(ROOT, 'public', 'index.html')).href;
    const p = await openPage(url, { ignoreNet: true });
    try {
      await p.page.waitForTimeout(800);
      const demo = await p.page.evaluate(() => !document.getElementById('demoBanner').classList.contains('hide'));
      assert(demo, 'o demo não ligou sozinho no file://');
      await hasUi(p.page);
      await p.page.click('#bTheme');
      await p.page.click('#themeMenu [data-theme="ice"]');
      assert(await themeOf(p.page) === 'ice', `menu no file:// aplicou ${await themeOf(p.page)}`);
      await p.page.keyboard.press('c');
      assert(await themeOf(p.page) === 'hacker', `C no file:// foi para ${await themeOf(p.page)}`);
      noErrors(p.errors, 'file://');
    } finally { await p.close(); }
  },
};

async function screenshots() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const out = [];
  for (const id of IDS) {
    const p = await openPage(`${srv.base}/?demo&theme=${id}`);
    try {
      // 6 s: fora da janela de ~3,8–4,7 s em que o letreiro "falha" (efeito de neon já existente)
      await p.page.waitForTimeout(6000);
      const file = path.join(SHOTS, `${id}.png`);
      await p.page.screenshot({ path: file });
      out.push(path.relative(ROOT, file).replace(/\\/g, '/') + (p.errors.length ? `  (erros: ${p.errors.join(' | ')})` : ''));
    } finally { await p.close(); }
  }
  return out;
}

(async () => {
  let failed = 0, ran = 0;
  try {
    srv = await startServer();
    browser = await chromium.launch({ channel: 'chrome' });
    for (const [name, fn] of Object.entries(TESTS)) {
      if (argOnly && !argOnly.includes(name)) continue;
      ran++;
      try { await fn(); console.log(`${name} ok`); } catch (e) { failed++; console.log(`${name} FALHOU: ${e.message}`); }
    }
    console.log(`e2e: ${ran - failed}/${ran} ok`);
    if (!argOnly) for (const s of await screenshots()) console.log('screenshot: ' + s);
  } catch (e) {
    failed++; console.error('erro no e2e: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (srv) srv.stop();
  }
  process.exit(failed ? 1 : 0);
})();
