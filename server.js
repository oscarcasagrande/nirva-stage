#!/usr/bin/env node
'use strict';
// Servidor local do Nirva Stage: recebe eventos do Claude Code em POST /event
// (hook de comando ou hook HTTP) e transmite para o navegador via Server-Sent
// Events em GET /events. Por padrão escuta só em 127.0.0.1.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const { normalize, sanitize, clip } = require('./lib/normalize');
const transcripts = require('./lib/transcripts');

const PORT = Number(process.env.NIRVA_PORT) || 4321;
const HOST = process.env.NIRVA_HOST || '127.0.0.1'; // no Docker: 0.0.0.0 (a porta é publicada só em 127.0.0.1 do host)
const PUBLIC = path.join(__dirname, 'public');
const MAX_HISTORY = 500;
const HISTORY_TTL = 2 * 60 * 60 * 1000;
const BODY_KEEP = 2 * 1024 * 1024; // guarda até 2 MB do corpo; o resto é descartado

// ---------------------------------------------------------------------
// Autenticação (v1.2). Com NIRVA_TOKEN definido, nada entra nem sai sem o
// token: cabeçalho Authorization: Bearer, ?token= ou cookie nirva_token.
// Sem NIRVA_TOKEN, tudo funciona como na v1.1.
// ---------------------------------------------------------------------
const TOKEN = process.env.NIRVA_TOKEN || '';
const AUTH = TOKEN.length > 0;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const TOKEN_HASH = sha256(TOKEN);
const COOKIE = 'nirva_token';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 dias
const RATE_MAX = 300, RATE_WINDOW = 10 * 1000; // POSTs por IP por janela (só com token)

// comparação em tempo constante: os dois resumos SHA-256 têm sempre 32 bytes
function validToken(t) { return typeof t === 'string' && t.length > 0 && crypto.timingSafeEqual(sha256(t), TOKEN_HASH); }
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i <= 0) continue;
    const k = part.slice(0, i).trim(); if (k in out) continue;
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}
function authed(req, url) {
  if (!AUTH) return true;
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  return [m && m[1].trim(), url.searchParams.get('token'), cookies(req)[COOKIE]].some(validToken);
}
const isHttps = (req) => !!req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
// URL sem o parâmetro token (mantém os outros como vieram, ex.: /?demo)
function withoutToken(url) {
  const rest = url.search.replace(/^\?/, '').split('&').filter((p) => p && decodeURIComponent(p.split('=')[0]) !== 'token');
  return url.pathname + (rest.length ? '?' + rest.join('&') : '');
}

const rate = new Map(); // ip -> { start, count }
function rateOk(req) {
  const ip = req.socket.remoteAddress || '', now = Date.now();
  let r = rate.get(ip);
  if (!r || now - r.start >= RATE_WINDOW) { r = { start: now, count: 0 }; rate.set(ip, r); }
  return ++r.count <= RATE_MAX;
}
if (AUTH) setInterval(() => { const now = Date.now(); for (const [ip, r] of rate) if (now - r.start >= RATE_WINDOW) rate.delete(ip); }, RATE_WINDOW).unref();

function loginPage(invalid) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">
<title>Nirva Stage: entrar</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#16122b;color:#eee;font:16px system-ui,sans-serif}
form{background:#221c40;padding:28px;border-radius:12px;width:min(340px,90vw);box-shadow:0 8px 30px #0008}
h1{margin:0 0 6px;font-size:20px}p{margin:0 0 16px;color:#b9b2d8;font-size:14px}
input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #4a4080;background:#16122b;color:#eee;font-size:15px}
button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#ff5fa2;color:#16122b;font-weight:700;font-size:15px;cursor:pointer}
.err{color:#ff8a8a;margin:0 0 12px}</style></head><body>
<form method="get" action="/"><h1>🎸 Nirva Stage</h1><p>Este palco exige um token. Peça ao dono do palco ou veja o NIRVA_TOKEN do servidor.</p>
${invalid ? '<p class="err">Token inválido. Tente de novo.</p>' : ''}<input type="password" name="token" placeholder="token" autocomplete="current-password" autofocus required>
<button type="submit">Entrar</button></form></body></html>`;
}
const deny = (res, code) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end('{}'); };

const STATIC = { // arquivos servidos (lista fechada)
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/vendor/qrcode.js': ['vendor/qrcode.js', 'text/javascript; charset=utf-8'],
};

// Modo transcript (para quando a organização bloqueia hooks): --transcripts ou NIRVA_TRANSCRIPTS=1 / =<pasta>
const TR_ENV = process.env.NIRVA_TRANSCRIPTS || '';
const TRANSCRIPTS = process.argv.includes('--transcripts') || (TR_ENV && TR_ENV !== '0');
const TRANSCRIPTS_DIR = TR_ENV && !['1', 'true', '0'].includes(TR_ENV) ? TR_ENV : path.join(os.homedir(), '.claude', 'projects');
let droppedHookEvents = 0;

const clients = new Set();
const history = [];

function send(res, event, data) { res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`); }
function broadcast(ev) {
  history.push(ev);
  while (history.length > MAX_HISTORY) history.shift();
  for (const res of clients) send(res, null, ev);
}

// ---------------------------------------------------------------------
// Docker: containers de pé. Usa a API do Docker pelo socket quando ele
// está montado (modo container) ou o comando `docker ps` (modo nativo).
// Somente leitura. Desligue com NIRVA_DOCKER=0.
// ---------------------------------------------------------------------
const DOCKER_ON = process.env.NIRVA_DOCKER !== '0';
const DOCKER_SOCK = process.env.DOCKER_SOCK || '/var/run/docker.sock';
let dockerState = { available: false, list: [] };
let dockerKey = '';

const clipS = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const healthOf = (status) => /\(unhealthy\)/i.test(status) ? 'unhealthy' : /health: starting/i.test(status) ? 'starting' : /\(healthy\)/i.test(status) ? 'healthy' : '';
function toItem({ name, image, state, status, ports, labels }) {
  return {
    name: clipS(name, 64), image: clipS(image, 64), state: String(state || 'running').toLowerCase(), health: healthOf(status),
    status: clipS(status, 48), ports: clipS(ports, 60),
    project: clipS(labels['com.docker.compose.project'], 48), service: clipS(labels['com.docker.compose.service'], 32),
    workdir: clipS(labels['com.docker.compose.project.working_dir'], 200),
  };
}
function viaSocket(cb) {
  const req = http.request({ socketPath: DOCKER_SOCK, path: '/containers/json', method: 'GET', timeout: 10000, headers: { host: 'docker' } }, (res) => {
    if (res.statusCode !== 200) { res.resume(); return cb(new Error(`HTTP ${res.statusCode} do Docker`)); }
    let buf = ''; res.setEncoding('utf8');
    res.on('data', (c) => { buf += c; });
    res.on('end', () => {
      try {
        const arr = JSON.parse(buf);
        if (!Array.isArray(arr)) return cb(new Error('resposta inesperada'));
        cb(null, arr.map((c) => toItem({
          name: (c.Names && c.Names[0] || c.Id || '').replace(/^\//, ''), image: c.Image, state: c.State, status: c.Status,
          ports: (c.Ports || []).filter((p) => p.PublicPort).map((p) => `${p.PublicPort}->${p.PrivatePort}`).filter((v, i, a) => a.indexOf(v) === i).join(', '),
          labels: c.Labels || {},
        })));
      } catch (e) { cb(e); }
    });
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', cb);
  req.end();
}
function viaCli(cb) {
  exec('docker ps --no-trunc --format "{{json .}}"', { timeout: 6000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
    if (err) return cb(err);
    const list = [];
    for (const ln of stdout.split(/\r?\n/)) {
      if (!ln.trim()) continue;
      try {
        const c = JSON.parse(ln); const labels = {};
        for (const part of String(c.Labels || '').split(',')) { const i = part.indexOf('='); if (i > 0) labels[part.slice(0, i)] = part.slice(i + 1); }
        list.push(toItem({ name: c.Names, image: c.Image, state: c.State, status: c.Status, ports: c.Ports, labels }));
      } catch { /* linha inválida */ }
    }
    cb(null, list);
  });
}
let dockerFails = 0, lastDockerErr = '';
function pollDocker() {
  const useSock = fs.existsSync(DOCKER_SOCK);
  (useSock ? viaSocket : viaCli)((err, list) => {
    if (err) {
      dockerFails++;
      const msg = String(err.message || err).split('\n')[0];
      if (msg !== lastDockerErr) { lastDockerErr = msg; console.warn(`[docker] falha ao listar containers (${useSock ? 'socket' : 'comando'}): ${msg}`); }
      // tolera falhas passageiras: mantém a última lista boa por até 3 tentativas
      if (dockerState.available && dockerFails < 3) return setTimeout(pollDocker, 3000);
    } else { dockerFails = 0; lastDockerErr = ''; }
    const next = err ? { available: false, list: [] } : { available: true, list };
    const key = JSON.stringify([next.available, next.list.map((c) => [c.name, c.state, c.health, c.project])]);
    dockerState = next;
    if (key !== dockerKey) { dockerKey = key; for (const res of clients) send(res, 'docker', dockerState); }
    setTimeout(pollDocker, next.available ? 5000 : 15000);
  });
}

// ---------------------------------------------------------------------
// Eventos grandes (hook HTTP manda o payload inteiro): se passar de 2 MB,
// recupera só os campos de que o palco precisa, que vêm no começo do JSON.
// ---------------------------------------------------------------------
function salvage(text) {
  const pick = (k) => { const m = text.match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)); return m ? JSON.parse(`"${m[1]}"`) : undefined; };
  const raw = {};
  for (const k of ['hook_event_name', 'session_id', 'cwd', 'tool_name', 'agent_id', 'agent_type']) { const v = pick(k); if (v !== undefined) raw[k] = v; }
  const fp = pick('file_path'); if (fp) raw.tool_input = { file_path: fp };
  return raw;
}

function isLocalOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true; // hooks do Claude Code e curl não mandam Origin
  try {
    const h = new URL(o).hostname;
    if (['localhost', '127.0.0.1', '[::1]'].includes(h)) return true;
    // com token: o próprio palco atrás do túnel (Origin igual ao Host).
    // Sem token não: abriria espaço para DNS rebinding contra o palco local.
    return AUTH && h === new URL('http://' + String(req.headers.host || '')).hostname;
  } catch { return false; }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // página: login, ou ?token= certo → cookie + redirect para a URL sem o token
  if (AUTH && req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const q = url.searchParams.get('token');
    if (q !== null && validToken(q)) {
      res.writeHead(302, {
        location: withoutToken(url), 'cache-control': 'no-store',
        'set-cookie': `${COOKIE}=${encodeURIComponent(q)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}${isHttps(req) ? '; Secure' : ''}`,
      });
      return res.end();
    }
    if (q !== null || !authed(req, url)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return res.end(loginPage(q !== null));
    }
  }

  if (AUTH && req.method === 'GET' && (STATIC[url.pathname] || url.pathname === '/events') && !authed(req, url)) return deny(res, 401);

  if (req.method === 'GET' && STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname];
    fs.readFile(path.join(PUBLIC, file), (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(buf);
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    const cutoff = Date.now() - HISTORY_TTL;
    res.write('retry: 2000\n\n');
    send(res, 'mode', { transcripts: !!TRANSCRIPTS });
    send(res, 'replay', history.filter((e) => e.ts >= cutoff));
    if (DOCKER_ON) send(res, 'docker', dockerState);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/event') {
    // nunca 403: para hooks HTTP, 403 pode significar "bloquear a ação"
    if (!isLocalOrigin(req)) return deny(res, 401);
    if (AUTH && !rateOk(req)) return deny(res, 429);
    if (!authed(req, url)) return deny(res, 401);
    const chunks = []; let size = 0, truncated = false;
    req.on('data', (c) => {
      if (size < BODY_KEEP) chunks.push(c.length + size > BODY_KEEP ? c.subarray(0, BODY_KEEP - size) : c);
      size += c.length; if (size > BODY_KEEP) truncated = true;
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let ev = null;
      try {
        const raw = truncated ? salvage(text) : JSON.parse(text);
        // com token (palco remoto), payload bruto de hook HTTP vira o resumo estrito
        ev = raw && raw.v === 1 ? sanitize(raw) : normalize(raw, { strict: AUTH });
      } catch { /* ignora */ }
      // no modo transcript os eventos já vêm dos arquivos: ignora hooks para não duplicar
      if (ev && TRANSCRIPTS && url.searchParams.get('src') === 'nirva-stage') { if (!droppedHookEvents++) console.log('[transcripts] eventos de hook ignorados (o modo transcript já cobre esta máquina)'); ev = null; }
      // hook HTTP manda a máquina na query (?host=); o do próprio evento vence
      if (ev && !ev.host) ev.host = clip(url.searchParams.get('host') || '', 32);
      if (ev) broadcast(ev);
      // Sempre 200 e corpo vazio: para hooks HTTP, outros códigos podem
      // significar "bloquear" e o palco nunca deve atrapalhar o Claude Code.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (AUTH && !authed(req, url)) return res.end(JSON.stringify({ ok: true, auth: 'required' }));
    const details = { ok: true, clients: clients.size, events: history.length, docker: dockerState.available, mode: TRANSCRIPTS ? 'transcripts' : 'hooks' };
    if (AUTH) details.auth = 'required';
    return res.end(JSON.stringify(details));
  }

  res.writeHead(404);
  res.end();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`A porta ${PORT} já está em uso. O palco já está aberto? Use NIRVA_PORT para trocar.`);
  else console.error(err);
  process.exit(1);
});

// Guarda de exposição (RS01): fora do loopback, só com token, salvo exceções explícitas.
const LOOPBACK = (h) => h === 'localhost' || h === '::1' || /^127\./.test(h);
if (!LOOPBACK(HOST) && !AUTH) {
  if (process.env.NIRVA_IN_DOCKER === '1') { /* contêiner: a porta é publicada só em 127.0.0.1 do host */ }
  else if (process.env.NIRVA_INSECURE === '1') {
    console.warn(`\n  ⚠️  ATENÇÃO: palco exposto na rede sem token (NIRVA_HOST=${HOST}, NIRVA_INSECURE=1).`);
    console.warn('     Qualquer pessoa na rede pode ver e enviar eventos. Prefira definir NIRVA_TOKEN (npm run token).');
  } else {
    console.error(`\n  Recusei iniciar: NIRVA_HOST=${HOST} expõe o palco na rede, mas NIRVA_TOKEN não está definido.`);
    console.error('  Gere um token com "npm run token", defina NIRVA_TOKEN e inicie de novo.');
    console.error('  (Para expor sem token por sua conta e risco: NIRVA_INSECURE=1.)\n');
    process.exit(1);
  }
}

server.listen(PORT, HOST, () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\n  🎸 Nirva Stage no ar: ${link}  (escutando em ${HOST})`);
  if (AUTH) console.log('     Autenticação: ligada (NIRVA_TOKEN). Abra o palco e digite o token.');
  console.log('     Demo sem Claude Code: ' + link + '/?demo');
  console.log('     Containers Docker: ' + (DOCKER_ON ? (fs.existsSync(DOCKER_SOCK) ? 'via socket' : 'via comando docker') + ' (NIRVA_DOCKER=0 desliga)' : 'desligado'));
  console.log('     Eventos: ' + (TRANSCRIPTS ? `transcripts em ${TRANSCRIPTS_DIR} (hooks ignorados)` : 'hooks do Claude Code'));
  console.log('     Ctrl+C para desligar\n');
  if (DOCKER_ON) pollDocker();
  if (TRANSCRIPTS) transcripts.start({
    dir: TRANSCRIPTS_DIR,
    emit: (raw) => { const ev = normalize(raw); if (ev) broadcast(ev); },
    log: (m) => console.log(m),
    debug: process.env.NIRVA_DEBUG === '1',
  });
  if (process.argv.includes('--open')) {
    const cmd = process.platform === 'win32' ? `start "" "${link}"` : process.platform === 'darwin' ? `open "${link}"` : `xdg-open "${link}"`;
    exec(cmd, () => {});
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
