#!/usr/bin/env node
'use strict';
// Adiciona (ou remove) os hooks do Nirva Stage no settings.json do Claude Code.
// Faz backup antes e não mexe em outros hooks. Reinstalar substitui os nossos.
//
//   node install-hooks.js                 hook de comando (precisa de Node na máquina)
//   node install-hooks.js --http          hook HTTP (para quem roda o palco no Docker ou não tem Node)
//   node install-hooks.js --uninstall     remove
//   opções: --url <url do /event>   --token <token do palco>   --settings <caminho do settings.json>
//
//   palco remoto:  node install-hooks.js --url https://palco.exemplo/event --token <token>

const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const uninstall = args.includes('--uninstall');
const useHttp = args.includes('--http');
const MARK = 'nirva-stage';
const settingsPath = opt('--settings') || path.join(os.homedir(), '.claude', 'settings.json');
const port = Number(process.env.NIRVA_PORT) || 4321;
const userUrl = opt('--url');
const token = opt('--token') || '';
const hookPath = path.join(__dirname, 'hook.js').replace(/\\/g, '/');
const mask = (s) => s.split(token).join(token.slice(0, 4) + '…');

function httpUrl() {
  const u = new URL(userUrl || `http://localhost:${port}/event`);
  if (!u.searchParams.has('src')) u.searchParams.set('src', MARK);
  u.searchParams.set('host', os.hostname());
  if (token) u.searchParams.set('token', token);
  return u.toString();
}
const isLoopback = (h) => h === 'localhost' || h === '[::1]' || /^127\./.test(h);

let entry;
try {
  entry = useHttp
    ? { type: 'http', url: httpUrl(), timeout: 3 }
    : { type: 'command', command: `node "${hookPath}" --${MARK}${userUrl ? ' --url ' + userUrl : ''}${token ? ' --token ' + token : ''}`, timeout: 5 };
} catch (e) {
  console.error(`URL inválida: ${userUrl}. Use algo como https://palco.exemplo/event`);
  process.exit(1);
}

const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];
const OTHER_EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact'];
const isOurs = (h) => String(h.command || '').includes('--' + MARK) || String(h.url || '').includes(MARK);

let settings = {};
if (fs.existsSync(settingsPath)) {
  const text = fs.readFileSync(settingsPath, 'utf8');
  try { settings = text.trim() ? JSON.parse(text) : {}; } catch (e) {
    console.error(`Não consegui ler ${settingsPath} (JSON inválido). Nada foi alterado.\n${e.message}`);
    process.exit(1);
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const backup = `${settingsPath}.nirva-backup-${stamp}`;
  fs.copyFileSync(settingsPath, backup);
  console.log(`Backup: ${backup}`);
} else {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
}

settings.hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
for (const ev of Object.keys(settings.hooks)) {
  const groups = Array.isArray(settings.hooks[ev]) ? settings.hooks[ev] : [];
  const kept = groups.map((gr) => ({ ...gr, hooks: (gr.hooks || []).filter((h) => !isOurs(h)) })).filter((gr) => gr.hooks.length > 0);
  if (kept.length) settings.hooks[ev] = kept; else delete settings.hooks[ev];
}
if (!uninstall) {
  for (const ev of TOOL_EVENTS) (settings.hooks[ev] ||= []).push({ matcher: '*', hooks: [entry] });
  for (const ev of OTHER_EVENTS) (settings.hooks[ev] ||= []).push({ hooks: [entry] });
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

if (uninstall) console.log('Hooks do Nirva Stage removidos. 👋');
else {
  console.log(`Hooks (${useHttp ? 'HTTP' : 'comando'}) instalados em ${settingsPath}`);
  console.log(useHttp ? `URL: ${mask(entry.url)}` : `Comando: ${mask(entry.command)}`);
  if (token) console.log('O token fica gravado no settings.json. Se vazar, gere outro com "npm run token".');
  if (useHttp && !isLoopback(new URL(entry.url).hostname)) {
    console.log('Atenção: o hook HTTP do Claude Code envia o payload completo de cada evento ao palco');
    console.log('(o palco resume e descarta o resto). Se o conteúdo não pode sair desta máquina,');
    console.log('prefira o hook de comando (sem --http) ou o relay (npm run relay).');
  }
  console.log('Abra uma sessão NOVA do Claude Code para os hooks valerem. 🤘');
}
