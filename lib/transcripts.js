'use strict';
// Modo transcript: acompanha os arquivos de histórico que o Claude Code grava em
// ~/.claude/projects/<projeto>/<sessão>.jsonl (e os dos subagentes) e converte
// cada linha nova num evento igual ao que um hook mandaria. Útil quando a
// organização bloqueia hooks de usuário ("managed hooks only").
//
// Só leitura. O conteúdo das conversas fica aqui: para o palco vai apenas o
// resumo gerado por normalize() (nome da ferramenta, nome do arquivo etc.).

const fs = require('fs');
const path = require('path');

const SCAN_MS = 4000;          // procura arquivos novos
const READ_MS = 700;           // lê o que foi acrescentado
const RECENT_MS = 15 * 60e3;   // ao ligar, sessões mexidas nos últimos 15 min sobem ao palco
const FORGET_MS = 3 * 60 * 60e3;

// scanMs/readMs: opcionais (o relay usa intervalos menores para entregar em < 2 s);
// os padrões são os do modo transcript da v1.1. Devolve { stop() }.
function start({ dir, emit, log = () => {}, debug = false, scanMs = SCAN_MS, readMs = READ_MS }) {
  const files = new Map();     // caminho -> { offset, rest, sid, agentId, isSub }
  const sessions = new Map();  // sid -> { cwd, pendingTasks: [], taskToAgent: Map, toolNames: Map, agentTypes: Map, stopped }
  const seenTypes = new Set();

  const sess = (sid) => {
    let s = sessions.get(sid);
    if (!s) { s = { cwd: '', pendingTasks: [], taskToAgent: new Map(), toolNames: new Map(), agentTypes: new Map(), knownAgents: new Set(), stopped: false }; sessions.set(sid, s); }
    return s;
  };
  const fire = (s, sid, raw) => emit({ session_id: sid, cwd: s.cwd, ...raw });

  function agentStart(s, sid, agentId, type) {
    if (s.knownAgents.has(agentId)) return;
    s.knownAgents.add(agentId); s.agentTypes.set(agentId, type || 'agente');
    fire(s, sid, { hook_event_name: 'SubagentStart', agent_id: agentId, agent_type: type || 'agente' });
  }
  function agentStop(s, sid, agentId) {
    if (!s.knownAgents.has(agentId)) return;
    s.knownAgents.delete(agentId);
    fire(s, sid, { hook_event_name: 'SubagentStop', agent_id: agentId, agent_type: s.agentTypes.get(agentId) });
  }

  // ---------- interpreta uma linha do transcript ----------
  function onLine(f, line) {
    let o; try { o = JSON.parse(line); } catch { return; }
    if (!o || typeof o !== 'object') return;
    if (debug) { const k = `${o.type}/${o.subtype || ''}`; if (!seenTypes.has(k)) { seenTypes.add(k); log(`[transcripts] tipo de linha visto: ${k}`); } }
    const sid = f.sid; const s = sess(sid);
    if (o.cwd && !s.cwd) s.cwd = o.cwd;

    // a qual músico pertence esta linha?
    let agentId = f.isSub ? f.agentId : '';
    if (!agentId && o.isSidechain) agentId = o.agentId ? String(o.agentId) : (s.pendingTasks[0] ? 'side-' + s.pendingTasks[0].id : 'side');
    if (agentId && !s.knownAgents.has(agentId)) {
      const t = f.isSub || o.isSidechain ? (s.pendingTasks.find((p) => !p.agent) || null) : null;
      if (t) { t.agent = agentId; s.taskToAgent.set(t.id, agentId); }
      agentStart(s, sid, agentId, t ? t.type : (o.agentType || 'agente'));
    }
    const who = agentId ? { agent_id: agentId, agent_type: s.agentTypes.get(agentId) } : {};

    const msg = o.message || {};
    const content = Array.isArray(msg.content) ? msg.content : (typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : []);

    if (o.type === 'assistant') {
      let usedTool = false;
      for (const c of content) {
        if (!c || c.type !== 'tool_use') continue;
        usedTool = true;
        s.toolNames.set(c.id, c.name);
        if (!agentId && (c.name === 'Task' || c.name === 'Agent')) s.pendingTasks.push({ id: c.id, type: (c.input && (c.input.subagent_type || c.input.agent_type)) || 'general-purpose', agent: '' });
        fire(s, sid, { hook_event_name: 'PreToolUse', tool_name: c.name, tool_input: c.input || {}, ...who });
      }
      if (usedTool && !agentId) s.stopped = false;
      // fim de turno do agente principal
      if (!agentId && !usedTool && msg.stop_reason === 'end_turn' && !s.stopped) { s.stopped = true; fire(s, sid, { hook_event_name: 'Stop' }); }
      return;
    }

    if (o.type === 'user') {
      const results = content.filter((c) => c && c.type === 'tool_result');
      for (const r of results) {
        const name = s.toolNames.get(r.tool_use_id) || 'tool';
        fire(s, sid, { hook_event_name: r.is_error ? 'PostToolUseFailure' : 'PostToolUse', tool_name: name, tool_input: {}, ...who });
        s.toolNames.delete(r.tool_use_id);
        // terminou um Task/Agent: o subagente sai do palco
        const sub = s.taskToAgent.get(r.tool_use_id);
        const idx = s.pendingTasks.findIndex((p) => p.id === r.tool_use_id);
        if (idx >= 0) s.pendingTasks.splice(idx, 1);
        if (sub) { s.taskToAgent.delete(r.tool_use_id); agentStop(s, sid, sub); }
      }
      if (!results.length && !agentId && !o.isMeta) {
        const text = content.filter((c) => c && c.type === 'text').map((c) => c.text || '').join(' ').trim();
        if (text && !/^<(local-command|command-|system-reminder|user-memory)/.test(text) && !/^\[Request interrupted/.test(text)) {
          s.stopped = false;
          fire(s, sid, { hook_event_name: 'UserPromptSubmit' });
        }
      }
      return;
    }

    if (o.type === 'system' && !agentId) {
      if (o.subtype === 'turn_duration' || o.subtype === 'stop_hook_summary') { if (!s.stopped) { s.stopped = true; fire(s, sid, { hook_event_name: 'Stop' }); } }
      else if (o.subtype === 'compact_boundary') fire(s, sid, { hook_event_name: 'PreCompact' });
    }
  }

  // ---------- descoberta e leitura dos arquivos ----------
  function classify(file) {
    const rel = path.relative(dir, file).split(path.sep);
    if (rel.length === 2) return { sid: path.basename(rel[1], '.jsonl'), isSub: false, agentId: '' };   // <proj>/<sid>.jsonl
    if (rel.length >= 3) {                                                                            // <proj>/<sid>/.../agent-<id>.jsonl
      const base = path.basename(rel[rel.length - 1], '.jsonl');
      return { sid: rel[1], isSub: true, agentId: base.replace(/^agent-/, '') };
    }
    return null;
  }
  function walk(d, out, depth = 0) {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4) walk(p, out, depth + 1); }
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  }
  function tailCwd(file, size) {
    try {
      const len = Math.min(size, 256 * 1024), buf = Buffer.alloc(len), fd = fs.openSync(file, 'r');
      fs.readSync(fd, buf, 0, len, size - len); fs.closeSync(fd);
      const m = buf.toString('utf8').match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
      if (m) return JSON.parse('{' + m[m.length - 1] + '}').cwd;
    } catch { /* ignora */ }
    return '';
  }
  let firstScan = true;
  function scan() {
    const list = []; walk(dir, list);
    const now = Date.now();
    for (const file of list) {
      if (files.has(file)) continue;
      let st; try { st = fs.statSync(file); } catch { continue; }
      if (now - st.mtimeMs > FORGET_MS) continue;
      const c = classify(file); if (!c) continue;
      // arquivo que já existia ao ligar: começa do fim (não reprisa o histórico)
      // arquivo novo (sessão/subagente que acabou de nascer): lê desde o começo
      const fresh = !firstScan;
      files.set(file, { ...c, offset: fresh ? 0 : st.size, rest: Buffer.alloc(0), mtime: st.mtimeMs });
      const s = sess(c.sid);
      if (!s.cwd) s.cwd = tailCwd(file, st.size);
      if (!c.isSub && (fresh || now - st.mtimeMs < RECENT_MS)) fire(s, c.sid, { hook_event_name: 'SessionStart' });
    }
    for (const [file, f] of files) {           // esquece arquivos parados há muito tempo
      try { if (now - fs.statSync(file).mtimeMs > FORGET_MS) files.delete(file); } catch { files.delete(file); }
    }
    if (firstScan) { firstScan = false; log(`[transcripts] acompanhando ${files.size} arquivo(s) em ${dir}`); }
  }
  function readNew() {
    for (const [file, f] of files) {
      let st; try { st = fs.statSync(file); } catch { continue; }
      if (st.size < f.offset) { f.offset = 0; f.rest = Buffer.alloc(0); }  // arquivo recriado
      if (st.size === f.offset) continue;
      try {
        const len = Math.min(st.size - f.offset, 8 * 1024 * 1024), buf = Buffer.alloc(len), fd = fs.openSync(file, 'r');
        fs.readSync(fd, buf, 0, len, f.offset); fs.closeSync(fd);
        f.offset += len;
        let data = Buffer.concat([f.rest, buf]);
        const last = data.lastIndexOf(10);    // \n
        if (last < 0) { f.rest = data; continue; }
        f.rest = data.subarray(last + 1);
        for (const ln of data.subarray(0, last).toString('utf8').split('\n')) if (ln.trim()) onLine(f, ln);
      } catch (e) { log(`[transcripts] erro lendo ${path.basename(file)}: ${e.message}`); }
    }
  }

  if (!fs.existsSync(dir)) log(`[transcripts] pasta ${dir} não existe (ainda). Vou continuar procurando.`);
  scan();
  const timers = [setInterval(scan, scanMs), setInterval(readNew, readMs)];
  for (const t of timers) t.unref();
  return { stop() { for (const t of timers) clearInterval(t); } };
}

module.exports = { start };
