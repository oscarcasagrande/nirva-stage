#!/usr/bin/env node
'use strict';
// Adiciona (ou remove) os hooks do Nirva Stage no settings.json do Claude Code.
// Faz backup antes e não mexe em outros hooks.
//
//   node install-hooks.js                 hook de comando (precisa de Node na máquina)
//   node install-hooks.js --http          hook HTTP (para quem roda o palco no Docker)
//   node install-hooks.js --uninstall     remove
//   opções: --url http://localhost:4321/event   --settings <caminho do settings.json>

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
const url = opt('--url') || `http://localhost:${port}/event?src=${MARK}`;
const hookPath = path.join(__dirname, 'hook.js').replace(/\\/g, '/');

const entry = useHttp
  ? { type: 'http', url: url.includes(MARK) ? url : url + (url.includes('?') ? '&' : '?') + 'src=' + MARK, timeout: 3 }
  : { type: 'command', command: `node "${hookPath}" --${MARK}`, timeout: 5 };

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
  console.log(useHttp ? `URL: ${entry.url}` : `Comando: ${entry.command}`);
  console.log('Abra uma sessão NOVA do Claude Code para os hooks valerem. 🤘');
}
