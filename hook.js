#!/usr/bin/env node
'use strict';
// Chamado pelo Claude Code a cada evento. Lê o JSON do stdin, resume e manda
// para o palco (local ou remoto). Sempre termina com código 0 e em no máximo
// ~1,5 s: se o palco estiver desligado, o Claude Code nem percebe.
//
//   node hook.js --nirva-stage [--url https://palco/event] [--token <token>]
//   ou NIRVA_URL / NIRVA_TOKEN no ambiente. Padrão: http://127.0.0.1:4321/event
//
// Para um palco fora desta máquina, o resumo é estrito: só a ferramenta, o nome
// do arquivo, a primeira palavra do comando e o host da URL saem daqui.

const http = require('http');
const https = require('https');
const os = require('os');
const { normalize } = require('./lib/normalize');

let finished = false;
const finish = () => { if (!finished) { finished = true; process.exit(0); } };
setTimeout(finish, 1500);

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const PORT = Number(process.env.NIRVA_PORT) || 4321;
const TOKEN = opt('--token') || process.env.NIRVA_TOKEN || '';
let target = null;
try {
  target = new URL(opt('--url') || process.env.NIRVA_URL || `http://127.0.0.1:${PORT}/event`);
  if (!['http:', 'https:'].includes(target.protocol)) target = null;
  else if (!target.searchParams.has('src')) target.searchParams.set('src', 'nirva-stage');
} catch { target = null; }
const isLoopback = (h) => h === 'localhost' || h === '[::1]' || h === '::1' || /^127\./.test(h);

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { if (buf.length < 20e6) buf += c; });
process.stdin.on('error', finish);
process.stdin.on('end', () => {
  if (!target) return finish();
  let ev = null;
  try { ev = normalize(JSON.parse(buf), { host: os.hostname(), strict: !isLoopback(target.hostname) }); } catch { /* payload inválido: ignora */ }
  if (!ev) return finish();
  const body = JSON.stringify(ev);
  const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  try {
    // autoSelectFamily: no Node 18, "localhost" resolve para ::1 primeiro e não tenta 127.0.0.1
    const req = (target.protocol === 'https:' ? https : http).request(target, { method: 'POST', timeout: 1000, headers, autoSelectFamily: true }, (res) => { res.resume(); res.on('end', finish); });
    req.on('timeout', () => { req.destroy(); finish(); });
    req.on('error', finish);
    req.end(body);
  } catch { finish(); }
});
