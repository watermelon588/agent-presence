#!/usr/bin/env node
// agent-presence: hook receiver + installer + terminal view.
// Hooks pipe their JSON into `agent-presence emit <agent>`; we append one line to
// ~/.agent-presence/events.jsonl. The overlay (and `watch`) tail that file.
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = process.env.AGENT_PRESENCE_HOME || path.join(os.homedir(), '.agent-presence');
const EVENTS = path.join(HOME, 'events.jsonl');
const CONFIG = path.join(HOME, 'config.json');
const CLI = __filename;
const MAX_LOG = 5 * 1024 * 1024;

const STATE_BY_TOOL = {
  Edit: 'writing', Write: 'writing', MultiEdit: 'writing', NotebookEdit: 'writing', apply_patch: 'writing',
  Read: 'reading', Grep: 'reading', Glob: 'reading', LS: 'reading',
  Bash: 'running', PowerShell: 'running', exec_command: 'running', shell: 'running',
  Agent: 'delegating', Task: 'delegating', spawn_agent: 'delegating',
  WebFetch: 'browsing', WebSearch: 'browsing',
};

// Codex apply_patch puts paths inside the patch text: "*** Update File: src/a.ts"
function patchFiles(text) {
  return [...String(text).matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map(m => m[1].trim());
}

function normalize(agent, h) {
  const ev = h.hook_event_name;
  if (!ev) return null;
  const ti = h.tool_input || {};
  const tool = h.tool_name || null;
  let file = ti.file_path || ti.notebook_path || ti.path || null;
  if (!file && tool === 'apply_patch') file = patchFiles(ti.command || ti.patch || ti.input || '')[0] || null;
  let detail = null;
  if (STATE_BY_TOOL[tool] === 'running') detail = [].concat(ti.command || '').join(' ').slice(0, 80);
  else if (tool === 'Grep' || tool === 'Glob') detail = ti.pattern || null;
  else if (tool === 'WebFetch') detail = ti.url || null;
  else if (tool === 'WebSearch') detail = ti.query || null;
  else if (STATE_BY_TOOL[tool] === 'delegating') detail = ti.description || ti.subagent_type || null;

  let state;
  switch (ev) {
    case 'PreToolUse': state = STATE_BY_TOOL[tool] || (tool && tool.startsWith('mcp__') ? 'browsing' : 'working'); break;
    case 'PostToolUse': case 'PostToolUseFailure': case 'UserPromptSubmit': case 'SessionStart': state = 'thinking'; break;
    case 'Notification': state = 'waiting'; detail = h.message || 'needs you'; break;
    case 'PermissionRequest': state = 'waiting'; detail = 'permission: ' + (tool || ''); break;
    case 'SubagentStart': state = 'thinking'; break;
    case 'SubagentStop': state = 'gone'; break;
    case 'Stop': state = 'done'; break;
    case 'SessionEnd': state = 'gone'; break;
    default: return null;
  }
  if (ev === 'SessionStart') state = 'idle';
  return {
    t: Date.now(),
    agent,
    session: h.session_id || 'unknown',
    sub: h.agent_id || null,
    subType: h.agent_type || null,
    event: ev,
    state,
    tool,
    file,
    detail,
    cwd: h.cwd || null,
  };
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; }
}

function overlayRunning() {
  try { process.kill(Number(fs.readFileSync(path.join(HOME, 'overlay.pid'), 'utf8')), 0); return true; } catch { return false; }
}

// Don't require('electron'): newer versions download the binary on first require, which would stall a hook.
function electronBin() {
  try {
    const dir = path.dirname(require.resolve('electron/package.json'));
    const bin = path.join(dir, 'dist', fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim());
    return fs.existsSync(bin) ? bin : null;
  } catch { return null; }
}

function startOverlay() {
  const bin = electronBin();
  if (!bin) return false;
  require('child_process').spawn(bin, [path.join(__dirname, 'overlay', 'main.js')], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return true;
}

// Must never break or slow the agent: swallow everything, always exit 0.
function emit(agent) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    try {
      const e = normalize(agent, JSON.parse(raw));
      if (e) {
        fs.mkdirSync(HOME, { recursive: true });
        try { if (fs.statSync(EVENTS).size > MAX_LOG) fs.renameSync(EVENTS, EVENTS + '.old'); } catch {}
        fs.appendFileSync(EVENTS, JSON.stringify(e) + '\n');
        if (e.event === 'SessionStart' && readConfig().autostart !== false && !overlayRunning()) startOverlay();
      }
    } catch (err) { if (process.env.AGENT_PRESENCE_DEBUG) console.error(err); }
    process.exit(0);
  });
}

// ---- install / uninstall hooks ----
const CLAUDE_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd'];
const CODEX_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd'];
const isOurs = h => JSON.stringify(h).includes('agent-presence') && JSON.stringify(h).includes('emit');

function editHooksFile(file, events, makeHook, remove) {
  let json = {};
  if (fs.existsSync(file)) {
    json = JSON.parse(fs.readFileSync(file, 'utf8')); // throw on bad JSON rather than clobber it
    fs.copyFileSync(file, file + '.bak-agent-presence');
  }
  json.hooks = json.hooks || {};
  for (const ev of events) {
    const groups = (json.hooks[ev] || []).map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !isOurs(h)) })).filter(g => g.hooks.length);
    if (!remove) groups.push({ matcher: '*', hooks: [makeHook()] });
    if (groups.length) json.hooks[ev] = groups; else delete json.hooks[ev];
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

function install(remove) {
  const which = process.argv.slice(3).filter(a => !a.startsWith('-'));
  const want = which.length ? which : ['claude', 'codex'];
  const done = [];
  if (want.includes('claude')) {
    const dir = path.join(os.homedir(), '.claude');
    if (fs.existsSync(dir) || which.includes('claude')) {
      // exec form: no shell quoting problems with spaces in paths
      editHooksFile(path.join(dir, 'settings.json'), CLAUDE_EVENTS,
        () => ({ type: 'command', command: 'node', args: [CLI, 'emit', 'claude'], async: true }), remove);
      done.push('Claude Code (~/.claude/settings.json)');
    }
  }
  if (want.includes('codex')) {
    const dir = path.join(os.homedir(), '.codex');
    if (fs.existsSync(dir) || which.includes('codex')) {
      editHooksFile(path.join(dir, 'hooks.json'), CODEX_EVENTS,
        () => ({ type: 'command', command: `node "${CLI}" emit codex`, async: true, timeout: 5 }), remove);
      done.push('Codex (~/.codex/hooks.json)');
    }
  }
  if (!done.length) return console.log('No ~/.claude or ~/.codex found. Name one explicitly: agent-presence init claude');
  console.log((remove ? 'Removed hooks from: ' : 'Installed hooks for: ') + done.join(', '));
  if (!remove && done.some(d => d.startsWith('Codex'))) console.log('Codex: open /hooks in Codex once and trust the agent-presence hooks.');
  if (!remove) console.log('Start the overlay: agent-presence overlay   (it also auto-starts on the next session)');
}

// ---- terminal view ----
function watch() {
  const agents = new Map();
  let offset = 0;
  const icon = { idle: '·', thinking: '…', reading: '🔍', writing: '✏️', running: '▶', delegating: '🧩', browsing: '🌐', waiting: '❗', done: '✓', working: '⚙' };
  const render = () => {
    console.clear();
    console.log('agent-presence  (Ctrl+C to exit)\n');
    if (!agents.size) console.log('  no agents active');
    for (const a of agents.values()) {
      const ago = Math.round((Date.now() - a.t) / 1000);
      const who = a.sub ? `   └ ${a.subType || 'subagent'}` : `${a.agent} ${a.session.slice(0, 6)}`;
      const what = a.file ? path.basename(a.file) : a.detail || '';
      console.log(`  ${icon[a.state] || '?'}  ${who.padEnd(22)} ${a.state.padEnd(10)} ${what}  (${ago}s)`);
    }
  };
  const pump = () => {
    let size; try { size = fs.statSync(EVENTS).size; } catch { return render(); }
    if (size < offset) offset = 0;
    if (size > offset) {
      const fd = fs.openSync(EVENTS, 'r'); const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset); fs.closeSync(fd); offset = size;
      for (const line of buf.toString('utf8').split('\n')) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        const key = e.agent + e.session + (e.sub || '');
        if (e.state === 'gone') { agents.delete(key); if (!e.sub) for (const k of agents.keys()) if (k.startsWith(e.agent + e.session)) agents.delete(k); }
        else agents.set(key, e);
      }
    }
    for (const [k, a] of agents) if (Date.now() - a.t > 15 * 60e3) agents.delete(k);
    render();
  };
  try { offset = Math.max(0, fs.statSync(EVENTS).size - 64 * 1024); } catch {}
  pump(); setInterval(pump, 500);
}

function overlay() {
  if (process.argv.includes('--quit')) {
    try { process.kill(Number(fs.readFileSync(path.join(HOME, 'overlay.pid'), 'utf8'))); console.log('Overlay stopped.'); } catch { console.log('Overlay is not running.'); }
    return;
  }
  if (overlayRunning()) return console.log('Overlay already running.');
  if (!electronBin()) { console.log('First run: fetching Electron (one time)...'); try { require('electron'); } catch {} }
  console.log(startOverlay() ? 'Overlay started. Stop it with: agent-presence overlay --quit' : 'Electron not found. Install with: npm i -g agent-presence');
}

const HELP = `agent-presence — sticker chibis for your AI coding agents

  agent-presence init [claude|codex]       install hooks (both by default)
  agent-presence uninstall [claude|codex]  remove hooks
  agent-presence overlay [--quit]          start/stop the floating stickers
  agent-presence watch                     live view in the terminal
  agent-presence emit <agent>              (used by hooks; reads hook JSON on stdin)

Custom stickers: ~/.agent-presence/config.json
  { "avatars": { "claude": "C:/stickers/fox.png", "codex": "...", "subagent": "...", "Explore": "..." } }`;

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'emit') emit(process.argv[3] || 'agent');
  else if (cmd === 'init') install(false);
  else if (cmd === 'uninstall') install(true);
  else if (cmd === 'watch') watch();
  else if (cmd === 'overlay') overlay();
  else console.log(HELP);
}

module.exports = { normalize, patchFiles, editHooksFile, HOME, EVENTS, CONFIG };
