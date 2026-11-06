#!/usr/bin/env node
'use strict';
// Chamado pelo Claude Code a cada evento. Lê o JSON do stdin, resume e manda
// para o servidor local. Sempre termina com código 0 e em no máximo ~1,5 s:
// se o palco estiver desligado, o Claude Code nem percebe.

const http = require('http');
const { normalize } = require('./lib/normalize');

const PORT = Number(process.env.NIRVA_PORT) || 4321;
let finished = false;
const finish = () => { if (!finished) { finished = true; process.exit(0); } };
setTimeout(finish, 1500);

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { if (buf.length < 20e6) buf += c; });
process.stdin.on('error', finish);
process.stdin.on('end', () => {
  let ev = null;
  try { ev = normalize(JSON.parse(buf)); } catch { /* payload inválido: ignora */ }
  if (!ev) return finish();
  const body = JSON.stringify(ev);
  const req = http.request({
    host: '127.0.0.1', port: PORT, path: '/event', method: 'POST', timeout: 400,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
  }, (res) => { res.resume(); res.on('end', finish); });
  req.on('timeout', () => { req.destroy(); finish(); });
  req.on('error', finish);
  req.end(body);
});
