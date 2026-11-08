'use strict';
// Converte o payload bruto de um hook do Claude Code num evento pequeno e seguro.
// Nunca envia conteúdo de arquivos, saída de comandos ou o texto dos seus prompts:
// só nomes de arquivo, a primeira palavra de um comando, o host de uma URL etc.

const EVENTS = new Set([
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'Notification', 'PermissionRequest', 'Stop',
  'SubagentStart', 'SubagentStop', 'PreCompact'
]);

function base(p) {
  if (!p || typeof p !== 'string') return '';
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

function clip(s, n) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// strict (v1.2, envio remoto): só o que o Princípio II da constituição permite
// sair da máquina: nome do arquivo sem caminho, primeira palavra do comando,
// host da URL (e o tipo do subagente/nome da ferramenta, que são metadados).
function detailFor(tool, input, strict = false) {
  input = input && typeof input === 'object' ? input : {};
  if (strict) {
    switch (tool) {
      case 'Grep': case 'Glob': case 'WebSearch': return '';
      case 'Bash': case 'PowerShell': return clip(String(input.command || '').trim().split(/\s+/)[0], 24);
      case 'Task': case 'Agent': return clip(input.subagent_type || '', 36);
    }
  }
  switch (tool) {
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit':
      return clip(base(input.file_path), 40);
    case 'NotebookEdit': case 'NotebookRead':
      return clip(base(input.notebook_path), 40);
    case 'Bash': case 'PowerShell':
      // descrição se houver; senão só o nome do programa (nada de argumentos/segredos)
      if (input.description) return clip(input.description, 40);
      return clip(String(input.command || '').trim().split(/\s+/)[0], 24);
    case 'Grep': case 'Glob':
      return clip(input.pattern, 30);
    case 'WebFetch':
      try { return new URL(input.url).hostname; } catch { return ''; }
    case 'WebSearch':
      return clip(input.query, 36);
    case 'Task': case 'Agent':
      return clip(input.subagent_type || input.description || '', 36);
    case 'TodoWrite':
      return 'setlist';
  }
  if (/^mcp__/.test(tool)) return clip(tool.split('__').slice(1).join(' · '), 36);
  return '';
}

// payload bruto do hook -> evento normalizado
function normalize(raw, opts = {}) {
  const strict = !!opts.strict;
  if (!raw || typeof raw !== 'object') return null;
  const event = String(raw.hook_event_name || '');
  if (!EVENTS.has(event)) return null;
  const tool = raw.tool_name ? clip(raw.tool_name, 60) : '';
  let note = '';
  if (event === 'Notification' && !strict) note = clip(raw.message, 80);
  if (event === 'PreCompact') note = 'compactando contexto';
  return {
    v: 1,
    event,
    session: clip(raw.session_id || 'local', 64),
    agent: raw.agent_id ? clip(raw.agent_id, 64) : '',
    agentType: raw.agent_type ? clip(raw.agent_type, 28) : '',
    tool,
    detail: tool ? detailFor(raw.tool_name, raw.tool_input, strict) : '',
    project: clip(base(raw.cwd), 40),
    note,
    ntype: raw.notification_type ? clip(raw.notification_type, 32) : '',
    host: clip(opts.host || '', 32),
    ts: Date.now()
  };
}

// evento já normalizado (vindo do hook.js) -> revalida campo a campo
function sanitize(ev) {
  if (!ev || typeof ev !== 'object' || !EVENTS.has(ev.event)) return null;
  const s = (k, n) => clip(ev[k] || '', n);
  return {
    v: 1, event: ev.event, session: s('session', 64) || 'local', agent: s('agent', 64),
    agentType: s('agentType', 28), tool: s('tool', 60), detail: s('detail', 40),
    project: s('project', 40), note: s('note', 80), ntype: s('ntype', 32), host: s('host', 32), ts: Date.now()
  };
}

module.exports = { normalize, sanitize, clip, EVENTS };
