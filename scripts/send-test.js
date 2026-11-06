#!/usr/bin/env node
'use strict';
// Simula uma sessão do Claude Code passando pelo hook.js de verdade.
// Use com o servidor ligado: npm run test-event

const { spawn } = require('child_process');
const path = require('path');

const hook = path.join(__dirname, '..', 'hook.js');
const session = 'teste-' + Math.random().toString(36).slice(2, 7);
const cwd = process.cwd();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(payload) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [hook], { stdio: ['pipe', 'ignore', 'inherit'] });
    p.on('exit', resolve);
    p.stdin.end(JSON.stringify({ session_id: session, cwd, ...payload }));
  });
}

(async () => {
  console.log('Mandando eventos de teste para o palco…');
  await send({ hook_event_name: 'SessionStart', source: 'startup' }); await sleep(1500);
  await send({ hook_event_name: 'UserPromptSubmit', prompt: '(oculto)' }); await sleep(800);
  await send({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: path.join(cwd, 'README.md') } }); await sleep(1500);
  await send({ hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: 'README.md' } }); await sleep(500);
  await send({ hook_event_name: 'SubagentStart', agent_id: 'sub-1', agent_type: 'Explore' }); await sleep(1200);
  await send({ hook_event_name: 'PreToolUse', agent_id: 'sub-1', agent_type: 'Explore', tool_name: 'Grep', tool_input: { pattern: 'TODO' } }); await sleep(2000);
  await send({ hook_event_name: 'PostToolUse', agent_id: 'sub-1', agent_type: 'Explore', tool_name: 'Grep', tool_input: { pattern: 'TODO' } }); await sleep(500);
  await send({ hook_event_name: 'SubagentStop', agent_id: 'sub-1', agent_type: 'Explore' }); await sleep(800);
  await send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test --silent', description: 'Rodar os testes' } }); await sleep(2000);
  await send({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } }); await sleep(500);
  await send({ hook_event_name: 'Stop' });
  console.log('Pronto! Olhe o palco. 🤘');
})();
