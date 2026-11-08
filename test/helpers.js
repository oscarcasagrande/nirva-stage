'use strict';
// Utilitários dos testes: sobem o palco, o hook e os scripts como processos reais,
// do jeito que o usuário usa. Só módulos nativos.

const net = require('net');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// Ambiente limpo: nenhuma variável NIRVA_* do usuário vaza para os testes.
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('NIRVA_')) env[k] = v;
  return { ...env, NIRVA_DOCKER: '0', ...extra };
}

// Sobe server.js. Resolve quando aparece "Nirva Stage no ar" ou rejeita se o processo sair antes.
async function startServer({ env = {}, args = [], port } = {}) {
  port = port || await freePort();
  const proc = spawn(process.execPath, ['server.js', ...args], {
    cwd: ROOT, env: cleanEnv({ NIRVA_PORT: String(port), ...env }), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  proc.stdout.on('data', (c) => { out += c; });
  proc.stderr.on('data', (c) => { out += c; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('o palco não subiu em 5 s:\n' + out)), 5000);
    const check = () => { if (out.includes('Nirva Stage no ar')) { clearTimeout(t); resolve(); } };
    proc.stdout.on('data', check);
    proc.on('exit', (code) => { clearTimeout(t); reject(new Error(`o palco saiu com código ${code}:\n${out}`)); });
  });
  proc.removeAllListeners('exit');
  const stop = () => new Promise((resolve) => {
    if (proc.exitCode !== null) return resolve();
    proc.once('exit', () => resolve());
    proc.kill();
  });
  return { port, base: `http://127.0.0.1:${port}`, proc, out: () => out, stop };
}

// Roda um script Node e espera ele sair.
function runNode(script, args = [], { env = {}, stdin, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const proc = spawn(process.execPath, [script, ...args], { cwd: ROOT, env: cleanEnv(env), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (c) => { stdout += c; });
    proc.stderr.on('data', (c) => { stderr += c; });
    const t = setTimeout(() => { proc.kill(); reject(new Error(`${script} não terminou em ${timeoutMs} ms\n${stdout}${stderr}`)); }, timeoutMs);
    proc.on('exit', (code) => { clearTimeout(t); resolve({ code, stdout, stderr, ms: Date.now() - t0 }); });
    proc.stdin.on('error', () => {});
    proc.stdin.end(stdin == null ? '' : stdin);
  });
}

// Lê o fluxo SSE até juntar `untilCount` eventos com nome em `names` (ou até o timeout).
function readSSE(url, { headers = {}, untilCount = 1, names = null, timeoutMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const events = []; let raw = '', buf = '', status = 0, done = false;
    const finish = (req) => { if (done) return; done = true; clearTimeout(t); req.destroy(); resolve({ status, events, raw }); };
    const req = http.get(url, { headers }, (res) => {
      status = res.statusCode;
      if (status !== 200) { res.resume(); return finish(req); }
      res.setEncoding('utf8');
      res.on('data', (c) => {
        raw += c; buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          let event = 'message', data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          let parsed = data; try { parsed = JSON.parse(data); } catch { /* texto */ }
          events.push({ event, data: parsed });
          if (events.filter((e) => !names || names.includes(e.event)).length >= untilCount) finish(req);
        }
      });
    });
    req.on('error', (e) => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    const t = setTimeout(() => finish(req), timeoutMs);
  });
}

// fetch sem seguir redirecionamentos (para ver o 302 do login).
const fetchNoRedirect = (url, opts = {}) => fetch(url, { redirect: 'manual', ...opts });

const sessionStart = (sid = 'teste') => JSON.stringify({ hook_event_name: 'SessionStart', session_id: sid, cwd: '/tmp/projeto-teste' });

module.exports = { ROOT, freePort, cleanEnv, startServer, runNode, readSSE, fetchNoRedirect, sessionStart };
