#!/usr/bin/env node
'use strict';
// Relay do Nirva Stage: para máquinas em que os hooks estão bloqueados
// ("managed hooks only"). Lê os transcripts locais do Claude Code e envia ao
// palco remoto só o resumo de cada evento (modo estrito: ferramenta, nome do
// arquivo sem caminho, primeira palavra do comando, host da URL). Nunca é
// ligado por padrão: só roda quando você chama `npm run relay`.
//
//   npm run relay -- --url https://palco.exemplo.ts.net/event --token <token> [--dir <pasta>] [--host <nome>]
//   (ou NIRVA_URL e NIRVA_TOKEN no ambiente)

const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const transcripts = require('../lib/transcripts');
const { normalize, clip } = require('../lib/normalize');

const MAX_QUEUE = 1000;   // eventos guardados com o palco fora do ar
const RETRY_MS = 2000;    // nova tentativa
const SEND_TIMEOUT = 5000;
const SCAN_MS = 1000;     // procura transcripts novos (o modo transcript local usa 4 s)
const READ_MS = 300;      // lê linhas novas

// fila limitada: cheia, descarta o evento mais antigo
function createQueue(max = MAX_QUEUE) {
  const items = []; let dropped = 0;
  return {
    push(ev) { items.push(ev); while (items.length > max) { items.shift(); dropped++; } },
    peek: () => items[0],
    shift: () => items.shift(),
    clear() { items.length = 0; },
    get length() { return items.length; },
    get dropped() { return dropped; },
  };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    if (m[2] !== undefined) o[m[1]] = m[2];
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o[m[1]] = argv[++i];
    else o[m[1]] = true;
  }
  return o;
}

const isLoopback = (h) => h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// devolve o status HTTP, ou 0 quando o palco não respondeu (rede, timeout)
function postEvent(target, token, ev) {
  return new Promise((resolve) => {
    const body = JSON.stringify(ev);
    const lib = target.protocol === 'https:' ? https : http;
    const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) };
    if (token) headers.authorization = `Bearer ${token}`;
    // autoSelectFamily: no Node 18, "localhost" resolve para ::1 primeiro e não tenta 127.0.0.1
    const req = lib.request(target, { method: 'POST', headers, timeout: SEND_TIMEOUT, autoSelectFamily: true }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
      res.on('error', () => resolve(0));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(0));
    req.end(body);
  });
}

const USAGE = [
  'Uso: npm run relay -- --url <endereço do palco>/event --token <token> [--dir <pasta>] [--host <nome>]',
  '  --url    palco remoto (ou NIRVA_URL), ex.: https://palco.exemplo.ts.net/event',
  '  --token  token do palco (ou NIRVA_TOKEN)',
  '  --dir    transcripts do Claude Code (padrão: ~/.claude/projects)',
  '  --host   nome desta máquina no palco (padrão: o nome do computador)',
].join('\n');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = typeof args.url === 'string' ? args.url : process.env.NIRVA_URL;
  const token = (typeof args.token === 'string' ? args.token : process.env.NIRVA_TOKEN) || '';
  const dir = typeof args.dir === 'string' ? args.dir : path.join(os.homedir(), '.claude', 'projects');
  const host = clip(typeof args.host === 'string' ? args.host : os.hostname(), 32);

  if (!url) { console.error(USAGE); process.exit(1); }
  let target;
  try { target = new URL(url); } catch { target = null; }
  if (!target || !['http:', 'https:'].includes(target.protocol)) {
    console.error(`Endereço inválido: use http:// ou https://.\n${USAGE}`);
    process.exit(1);
  }
  target.searchParams.set('src', 'nirva-relay');
  target.searchParams.delete('token'); // o token vai no cabeçalho, nunca na URL

  if (target.protocol === 'http:' && !isLoopback(target.hostname)) {
    console.warn('Aviso: o palco está em HTTP sem criptografia fora desta máquina; o token e os eventos viajam em texto puro.');
    console.warn('       Prefira HTTPS (Tailscale Serve ou Cloudflare Tunnel).');
  }
  if (!token) console.warn('Aviso: sem token. Se o palco exigir NIRVA_TOKEN, ele vai recusar os eventos.');
  console.log(`Relay ligado: ${dir} → ${target.host} como ${host}`);
  console.log('Só o resumo de cada evento sai desta máquina (nada de prompts, conteúdo de arquivos ou argumentos). Ctrl+C para desligar.');

  const queue = createQueue(MAX_QUEUE);
  let sending = false, offline = false, warnedFull = false;

  async function pump() {
    if (sending) return;
    sending = true;
    while (queue.length) {
      const status = await postEvent(target, token, queue.peek());
      if (status >= 200 && status < 300) {
        queue.shift();
        if (offline) { offline = false; console.log(`Palco de volta: enviando ${queue.length + 1} evento(s) guardado(s).`); }
        continue;
      }
      if (status === 401) {
        console.error(`O palco recusou o token (401). Confira --token ou NIRVA_TOKEN. A fila (${queue.length} evento(s)) foi descartada e o relay parou.`);
        queue.clear();
        watcher.stop();
        process.exit(1);
      }
      if (status === 0 || status === 429 || status >= 500) {
        if (!offline) {
          offline = true;
          const why = status === 0 ? 'sem resposta' : `HTTP ${status}`;
          console.warn(`Palco inacessível (${why}). Guardando até ${MAX_QUEUE} eventos e tentando de novo a cada ${RETRY_MS / 1000} s.`);
        }
        await sleep(RETRY_MS);
        continue;
      }
      // outros códigos (400, 404…) não melhoram com nova tentativa: descarta este evento
      console.warn(`O palco respondeu HTTP ${status}; evento descartado. Confira o endereço (deve terminar em /event).`);
      queue.shift();
    }
    sending = false;
  }

  const watcher = transcripts.start({
    dir,
    emit: (raw) => {
      const ev = normalize(raw, { host, strict: true });
      if (!ev) return;
      queue.push(ev);
      if (queue.dropped && !warnedFull) { warnedFull = true; console.warn(`Fila cheia (${MAX_QUEUE} eventos): descartando os mais antigos.`); }
      pump();
    },
    log: (m) => console.log(m),
    debug: process.env.NIRVA_DEBUG === '1',
    scanMs: SCAN_MS,
    readMs: READ_MS,
  });

  setInterval(() => {}, 1 << 30); // mantém o processo vivo (os timers do watcher são unref)
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { watcher.stop(); process.exit(0); });
}

if (require.main === module) main();

module.exports = { createQueue, parseArgs };
