#!/usr/bin/env node
'use strict';
// Servidor local do Nirva Stage: recebe eventos do Claude Code em POST /event
// (hook de comando ou hook HTTP) e transmite para o navegador via Server-Sent
// Events em GET /events. Por padrão escuta só em 127.0.0.1.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { normalize, sanitize } = require('./lib/normalize');

const PORT = Number(process.env.NIRVA_PORT) || 4321;
const HOST = process.env.NIRVA_HOST || '127.0.0.1'; // no Docker: 0.0.0.0 (a porta é publicada só em 127.0.0.1 do host)
const PUBLIC = path.join(__dirname, 'public');
const MAX_HISTORY = 500;
const HISTORY_TTL = 2 * 60 * 60 * 1000;
const BODY_KEEP = 2 * 1024 * 1024; // guarda até 2 MB do corpo; o resto é descartado

const STATIC = { // arquivos servidos (lista fechada)
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/vendor/qrcode.js': ['vendor/qrcode.js', 'text/javascript; charset=utf-8'],
};

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
  const req = http.request({ socketPath: DOCKER_SOCK, path: '/containers/json', method: 'GET', timeout: 5000 }, (res) => {
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
function pollDocker() {
  const useSock = fs.existsSync(DOCKER_SOCK);
  (useSock ? viaSocket : viaCli)((err, list) => {
    const next = err ? { available: false, list: [] } : { available: true, list };
    const key = JSON.stringify([next.available, next.list.map((c) => [c.name, c.state, c.health, c.project])]);
    dockerState = next;
    if (key !== dockerKey) { dockerKey = key; for (const res of clients) send(res, 'docker', dockerState); }
    setTimeout(pollDocker, next.available ? 5000 : 30000);
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
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(o).hostname); } catch { return false; }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

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
    send(res, 'replay', history.filter((e) => e.ts >= cutoff));
    if (DOCKER_ON) send(res, 'docker', dockerState);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/event') {
    if (!isLocalOrigin(req)) { res.writeHead(403); return res.end(); }
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
        ev = raw && raw.v === 1 ? sanitize(raw) : normalize(raw);
      } catch { /* ignora */ }
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
    return res.end(JSON.stringify({ ok: true, clients: clients.size, events: history.length, docker: dockerState.available }));
  }

  res.writeHead(404);
  res.end();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`A porta ${PORT} já está em uso. O palco já está aberto? Use NIRVA_PORT para trocar.`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\n  🎸 Nirva Stage no ar: ${link}  (escutando em ${HOST})`);
  console.log('     Demo sem Claude Code: ' + link + '/?demo');
  console.log('     Containers Docker: ' + (DOCKER_ON ? (fs.existsSync(DOCKER_SOCK) ? 'via socket' : 'via comando docker') + ' (NIRVA_DOCKER=0 desliga)' : 'desligado'));
  console.log('     Ctrl+C para desligar\n');
  if (DOCKER_ON) pollDocker();
  if (process.argv.includes('--open')) {
    const cmd = process.platform === 'win32' ? `start "" "${link}"` : process.platform === 'darwin' ? `open "${link}"` : `xdg-open "${link}"`;
    exec(cmd, () => {});
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
