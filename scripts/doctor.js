#!/usr/bin/env node
'use strict';
// Diagnóstico do Nirva Stage: testa cada parte do caminho
// Claude Code -> hook -> servidor -> palco.
//
//   npm run doctor            checagens rápidas (não usa o Claude)
//   npm run doctor -- --claude    também roda "claude -p" de verdade e confere se os eventos chegam
//
// Sem dependências. Funciona no Windows, macOS e Linux.

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.NIRVA_PORT) || 4321;
const RUN_CLAUDE = process.argv.includes('--claude');
const MARK = 'nirva-stage';
let problems = 0, warnings = 0;

const ok = (m) => console.log('  ✅ ' + m);
const warn = (m) => { warnings++; console.log('  ⚠️  ' + m); };
let soft = false; // no modo transcript, problemas de hook viram só informação
const bad = (m) => { if (soft) return console.log('  ·  ' + m + '  (sem efeito no modo transcript)'); problems++; console.log('  ❌ ' + m); };
const info = (m) => console.log('     ' + m);
const title = (m) => console.log('\n' + m);

function request(method, url, body, timeout = 3000) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch { return resolve({ error: 'URL inválida' }); }
    const req = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method, timeout,
      headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {} }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'tempo esgotado' }); });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.end(body);
  });
}
async function health() {
  const r = await request('GET', `http://127.0.0.1:${PORT}/health`);
  if (r.error || r.status !== 200) return null;
  try { return JSON.parse(r.body); } catch { return null; }
}
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return e.code === 'ENOENT' ? undefined : { __error: e.message }; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ourHooks(settings) {
  const found = [];
  for (const [ev, groups] of Object.entries((settings && settings.hooks) || {})) {
    for (const g of Array.isArray(groups) ? groups : []) for (const h of g.hooks || []) {
      if (String(h.command || '').includes('--' + MARK) || String(h.url || '').includes(MARK)) found.push({ ev, ...h });
    }
  }
  return found;
}

(async () => {
  console.log(`🎸 Nirva Stage: diagnóstico  (${os.platform()} ${os.release()}, Node ${process.version}, usuário ${os.userInfo().username})`);

  // 1. Palco
  title('1. Palco (servidor)');
  const h0 = await health();
  if (!h0) {
    bad(`Nada respondendo em http://localhost:${PORT}. Suba o palco: "npm start" ou "docker compose up -d".`);
  } else {
    ok(`Palco no ar em http://localhost:${PORT}: ${h0.events} eventos recebidos, ${h0.clients} navegador(es) aberto(s), Docker ${h0.docker ? 'ok' : 'não lido'}.`);
    if (h0.mode === 'transcripts') {
      info('Modo TRANSCRIPT ligado: os eventos vêm de ~/.claude/projects e os hooks são ignorados (as etapas 2 e 3 servem só de referência).');
      const tdir = process.env.NIRVA_TRANSCRIPTS && !['1', 'true'].includes(process.env.NIRVA_TRANSCRIPTS) ? process.env.NIRVA_TRANSCRIPTS : path.join(os.homedir(), '.claude', 'projects');
      if (fs.existsSync(tdir)) ok(`Pasta de transcripts encontrada: ${tdir}`); else warn(`Não achei ${tdir} nesta máquina (se o palco roda no Docker, confira o volume montado).`);
    }
    if (!h0.clients) warn('Nenhum navegador com o palco aberto. Abra http://localhost:' + PORT + ' para ver a banda.');
  }

  // 2. Hooks no settings.json do usuário
  soft = !!(h0 && h0.mode === 'transcripts');
  title('2. Hooks no Claude Code');
  const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const us = readJson(userSettingsPath);
  let hooks = [];
  if (us === undefined) bad(`Não existe ${userSettingsPath}. Rode "npm run install-hooks".`);
  else if (us.__error) bad(`${userSettingsPath} não é um JSON válido: ${us.__error}`);
  else {
    hooks = ourHooks(us);
    const events = [...new Set(hooks.map((x) => x.ev))];
    if (!hooks.length) bad(`Os hooks do Nirva Stage não estão em ${userSettingsPath}. Rode "npm run install-hooks".`);
    else {
      ok(`${events.length} eventos com hook do Nirva Stage em ${userSettingsPath}.`);
      const types = [...new Set(hooks.map((x) => x.type))];
      info('Tipo: ' + types.join(', ') + (hooks[0].url ? `  →  ${hooks[0].url}` : `  →  ${hooks[0].command}`));
      for (const need of ['PreToolUse', 'Stop', 'SubagentStart']) if (!events.includes(need)) warn(`Falta o evento ${need}. Rode "npm run install-hooks" de novo.`);
      if (types.length > 1) warn('Há hooks de comando E HTTP ao mesmo tempo. Rode o install-hooks de novo para ficar com um só.');
      const cmd = hooks.find((x) => x.type === 'command');
      if (cmd) {
        const m = String(cmd.command).match(/"([^"]+hook\.js)"/);
        if (m && !fs.existsSync(m[1])) bad(`O hook aponta para ${m[1]}, que não existe mais. Rode "npm run install-hooks" na pasta atual do projeto.`);
        else if (m) ok(`hook.js encontrado em ${m[1]}.`);
      }
      const url = hooks.find((x) => x.type === 'http');
      if (url && !String(url.url).includes(`:${PORT}/`)) warn(`O hook HTTP aponta para ${url.url}, mas o palco está na porta ${PORT}.`);
    }
    if (us.disableAllHooks) bad('"disableAllHooks": true no seu settings.json desliga TODOS os hooks.');
  }

  // 3. Configurações que podem bloquear
  title('3. Configurações que podem bloquear os hooks');
  const managedPaths = {
    win32: [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ClaudeCode', 'managed-settings.json')],
    darwin: ['/Library/Application Support/ClaudeCode/managed-settings.json'],
    linux: ['/etc/claude-code/managed-settings.json'],
  }[os.platform()] || [];
  const projectFiles = [path.join(process.cwd(), '.claude', 'settings.json'), path.join(process.cwd(), '.claude', 'settings.local.json')];
  let foundManaged = false;
  for (const p of [...managedPaths, ...projectFiles]) {
    const s = readJson(p);
    if (s === undefined) continue;
    const label = managedPaths.includes(p) ? 'política gerenciada (máquina)' : 'projeto';
    if (managedPaths.includes(p)) foundManaged = true;
    if (s.__error) { warn(`${p} (${label}) não pôde ser lido: ${s.__error}`); continue; }
    if (s.allowManagedHooksOnly) bad(`${p} (${label}) tem "allowManagedHooksOnly": true. Só hooks da organização rodam, e os seus são ignorados.`);
    else if (s.disableAllHooks) bad(`${p} (${label}) tem "disableAllHooks": true.`);
    else ok(`${p} (${label}) não bloqueia hooks.`);
  }
  if (!foundManaged) ok('Nenhuma política gerenciada em arquivo nesta máquina.');
  info('Políticas da ORGANIZAÇÃO vindas da nuvem não ficam em arquivo. Dentro do claude, rode /status e /hooks:');
  info('se /hooks não listar os eventos acima, a organização está bloqueando hooks de usuário.');

  // 4. Teste do caminho hook -> palco (sem Claude)
  soft = false;
  title('4. Teste: hook → palco (evento simulado)');
  if (!h0) info('Pulado: o palco não está no ar.');
  else if (h0.mode === 'transcripts') {
    const r = await request('POST', `http://127.0.0.1:${PORT}/event`, JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'doctor-' + Date.now(), cwd: path.join(os.tmpdir(), 'nirva-doctor') }));
    await sleep(300); const h1 = await health();
    if (!r.error && h1 && h1.events > h0.events) ok('Evento de teste chegou ao palco: um vocalista "nirva-doctor" deve ter subido.');
    else bad('O evento de teste não chegou ao palco.');
  }
  else if (!hooks.length) info('Pulado: hooks não instalados.');
  else {
    const payload = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'doctor-' + Date.now(), cwd: path.join(os.tmpdir(), 'nirva-doctor') });
    const h = hooks.find((x) => x.ev === 'SessionStart') || hooks[0];
    if (h.type === 'http') {
      const r = await request('POST', h.url, payload);
      if (r.error || r.status !== 200) bad(`POST para ${h.url} falhou: ${r.error || 'HTTP ' + r.status}. Firewall, proxy ou porta errada?`);
    } else {
      await new Promise((resolve) => {
        const p = spawn(h.command, { shell: true, stdio: ['pipe', 'ignore', 'pipe'] });
        let err = ''; p.stderr.on('data', (c) => { err += c; });
        p.on('exit', (code) => { if (code !== 0 || err.trim()) warn(`O comando do hook saiu com código ${code}. ${err.trim().slice(0, 200)}`); resolve(); });
        p.on('error', (e) => { bad(`Não consegui rodar o hook: ${e.message} (o "node" está no PATH?)`); resolve(); });
        p.stdin.end(payload);
      });
    }
    await sleep(400);
    const h1 = await health();
    if (h1 && h1.events > h0.events) ok('Evento chegou ao palco: um vocalista "nirva-doctor" deve ter subido.');
    else bad('O evento simulado NÃO chegou ao palco.');
  }

  // 5. Teste real com o Claude Code
  title('5. Teste real com o Claude Code' + (RUN_CLAUDE ? '' : ' (pulado; use: npm run doctor -- --claude)'));
  if (RUN_CLAUDE) {
    const before = await health();
    info('Rodando: claude -p "Responda apenas: ok" --debug   (usa um pouquinho da sua cota)');
    const out = await new Promise((resolve) => {
      let buf = '';
      const p = spawn('claude', ['-p', '"Responda apenas: ok"', '--debug'], { shell: true });
      const t = setTimeout(() => { p.kill(); buf += '\n[tempo esgotado]'; }, 120000);
      p.stdout.on('data', (c) => { buf += c; }); p.stderr.on('data', (c) => { buf += c; });
      p.on('exit', () => { clearTimeout(t); resolve(buf); });
      p.on('error', (e) => { clearTimeout(t); resolve('[erro] ' + e.message); });
    });
    const hookLines = out.split(/\r?\n/).filter((l) => /hook/i.test(l));
    if (/\[erro\]/.test(out)) bad('Não consegui rodar "claude": ' + out);
    else {
      info(`O Claude respondeu. ${hookLines.length} linha(s) de debug mencionando hooks:`);
      for (const l of hookLines.slice(0, 12)) info('  │ ' + l.trim().slice(0, 160));
      const after = await health();
      if (before && after) {
        const n = after.events - before.events;
        if (n > 0) ok(`${n} evento(s) do Claude Code chegaram ao palco. Tudo funcionando! 🤘`);
        else bad('Nenhum evento do Claude Code chegou. Veja as linhas de debug acima: se não aparece nenhum hook rodando, eles estão sendo ignorados (política da organização, /hooks vazio).');
      }
    }
  }

  title(problems ? `Resultado: ${problems} problema(s), ${warnings} aviso(s).` : warnings ? `Resultado: ok, com ${warnings} aviso(s).` : 'Resultado: tudo certo. 🤘');
  process.exit(problems ? 1 : 0);
})();
