// Pure presence state (no vscode import, so test.js can run it under plain node).
const fs = require('fs');
const path = require('path');

const STALE = 15 * 60e3;
const ACTIVE = new Set(['reading', 'writing', 'running', 'delegating', 'browsing', 'working', 'thinking', 'waiting']);
// realpath expands Windows 8.3 short names (C:\Users\ROHITM~1\...) and symlinks so agent paths match the editor's.
const real = new Map();
const norm = p => {
  const r = path.resolve(p);
  if (!real.has(r)) { let v = r; try { v = fs.realpathSync.native(r); } catch {} real.set(r, process.platform === 'win32' ? v.toLowerCase() : v); }
  return real.get(r);
};

function createPresence() {
  const agents = new Map(); // key -> { key, main, agent, session, sub, subType, state, detail, cwd, t, file, files: Map(norm -> {path, t, state}) }

  function apply(e) {
    if (!e || !e.agent || !e.session) return;
    const main = e.agent + ':' + e.session;
    const key = e.sub ? main + ':' + e.sub : main;
    if (e.state === 'gone') {
      for (const k of [...agents.keys()]) if (k === key || k.startsWith(key + ':')) agents.delete(k);
      return;
    }
    const a = agents.get(key) || { files: new Map() };
    Object.assign(a, { key, main, agent: e.agent, session: e.session, sub: e.sub || null, subType: e.subType || null,
      state: e.state, detail: e.detail || null, cwd: e.cwd || a.cwd || null, t: e.t });
    if (e.file) {
      const abs = path.resolve(a.cwd || '', e.file); // Codex sends paths relative to its cwd
      a.file = abs;
      a.files.set(norm(abs), { path: abs, t: e.t, state: e.state });
    }
    agents.set(key, a);
  }

  function prune(now) { for (const [k, a] of agents) if (now - a.t > STALE) agents.delete(k); }

  // Who is on this file: the agent whose current file it is (while busy), else the latest touch within recentMs.
  function fileInfo(fsPath, now, recentMs) {
    const k = norm(fsPath);
    let best = null;
    for (const a of agents.values()) {
      const touch = a.files.get(k);
      if (!touch) continue;
      const active = a.file && norm(a.file) === k && ACTIVE.has(a.state);
      if (!active && now - touch.t > recentMs) continue;
      const hit = { agent: a.agent, sub: a.sub, subType: a.subType, state: active ? a.state : touch.state, t: touch.t, active };
      if (!best || hit.active > best.active || (hit.active === best.active && hit.t > best.t)) best = hit;
    }
    return best;
  }

  const list = () => [...agents.values()];
  return { apply, prune, fileInfo, list };
}

// Poll the shared event log; replay the recent tail so sessions already running show up.
function tail(file, onEvents, intervalMs = 400) {
  let offset = 0, partial = '';
  try { offset = Math.max(0, fs.statSync(file).size - 64 * 1024); } catch {}
  const pump = () => {
    let size; try { size = fs.statSync(file).size; } catch { return; }
    if (size < offset) { offset = 0; partial = ''; }
    if (size === offset) return;
    const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset); fs.closeSync(fd); offset = size;
    const lines = (partial + buf.toString('utf8')).split('\n'); partial = lines.pop();
    const events = [];
    for (const l of lines) { try { events.push(JSON.parse(l)); } catch {} }
    if (events.length) onEvents(events);
  };
  pump();
  const timer = setInterval(pump, intervalMs);
  return () => clearInterval(timer);
}

module.exports = { createPresence, tail, norm };
