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
  WebFetch: 'browsing', WebSearch: 'browsing', TodoWrite: 'thinking',
};

// Copilot, Antigravity and future agents use other tool names (view_file, run_command, str_replace_editor...):
// guess from the name. ponytail: keyword heuristic, add exact names to STATE_BY_TOOL when one guesses wrong.
function toolState(tool) {
  if (!tool) return 'working';
  if (STATE_BY_TOOL[tool]) return STATE_BY_TOOL[tool];
  if (tool.startsWith('mcp__')) return 'browsing';
  const t = tool.toLowerCase();
  if (/web|url|browser|fetch/.test(t)) return 'browsing';
  if (/agent|task/.test(t)) return 'delegating';
  if (/edit|write|create|replace|patch/.test(t)) return 'writing';
  if (/terminal|bash|shell|command|powershell|run/.test(t)) return 'running';
  if (/read|view|grep|search|find|glob|list/.test(t)) return 'reading';
  return 'working';
}

// Codex apply_patch puts paths inside the patch text: "*** Update File: src/a.ts"
function patchFiles(text) {
  return [...String(text).matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map(m => m[1].trim());
}

const asObject = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
// Copilot's camelCase events; the rest map by capitalizing (preToolUse -> PreToolUse).
const EVENT_ALIAS = { userPromptSubmitted: 'UserPromptSubmit', agentStop: 'Stop' };

// Accepts Claude/Codex (snake_case), Copilot (camelCase, toolArgs as a JSON string) and Antigravity
// (conversationId, toolCall {name,args}) payloads. Copilot and Antigravity don't always say which event
// fired, so their hooks pass it as an argument.
function normalize(agent, h, argEvent) {
  const raw = argEvent || h.hook_event_name || h.hookEventName;
  if (!raw) return null;
  const ev = EVENT_ALIAS[raw] || raw[0].toUpperCase() + raw.slice(1);
  const call = h.toolCall || {};
  const ti = asObject(h.tool_input) || asObject(h.toolArgs) || asObject(call.args) || {};
  const tool = h.tool_name || h.toolName || call.name || null;
  const ts = toolState(tool);
  let file = ti.file_path || ti.notebook_path || ti.path || ti.filePath || ti.AbsolutePath || ti.TargetFile || null;
  if (!file && /patch/i.test(tool || '')) file = patchFiles(ti.command || ti.patch || ti.input || '')[0] || null;
  let detail = null;
  if (ts === 'running') detail = [].concat(ti.command || ti.CommandLine || '').join(' ').slice(0, 80);
  else if (ts === 'reading') detail = ti.pattern || ti.query || ti.Query || null;
  else if (ts === 'browsing') detail = ti.url || ti.Url || ti.query || null;
  else if (ts === 'delegating') detail = ti.description || ti.subagent_type || null;

  let state;
  switch (ev) {
    case 'PreToolUse': case 'ToolUse': state = ts; break; // ToolUse: Antigravity's PostToolUse, its only tool event we hook
    case 'PostToolUse': case 'PostToolUseFailure': case 'UserPromptSubmit': state = 'thinking'; break;
    case 'SessionStart': state = 'idle'; break;
    case 'Notification': state = 'waiting'; detail = h.message || 'needs you'; break;
    case 'PermissionRequest': state = 'waiting'; detail = 'permission: ' + (tool || ''); break;
    case 'SubagentStart': state = 'thinking'; break;
    case 'SubagentStop': state = 'gone'; break;
    case 'Stop': state = 'done'; break;
    case 'SessionEnd': state = 'gone'; break;
    default: return null;
  }
  return {
    t: Date.now(),
    agent,
    session: h.session_id || h.sessionId || h.conversationId || 'unknown',
    sub: h.agent_id || h.agentId || null,
    subType: h.agent_type || h.agentType || h.agentName || null,
    event: ev,
    state,
    tool,
    file,
    detail,
    cwd: h.cwd || (h.workspacePaths || [])[0] || null,
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
function emit(agent, argEvent) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    try {
      const e = normalize(agent, JSON.parse(raw.replace(/^﻿/, '') || '{}'), argEvent); // PowerShell pipes a BOM
      if (e) {
        fs.mkdirSync(HOME, { recursive: true });
        try { if (fs.statSync(EVENTS).size > MAX_LOG) fs.renameSync(EVENTS, EVENTS + '.old'); } catch {}
        fs.appendFileSync(EVENTS, JSON.stringify(e) + '\n');
        if (e.event === 'SessionStart' && readConfig().autostart !== false && !overlayRunning()) startOverlay();
      }
    } catch (err) { if (process.env.AGENT_PRESENCE_DEBUG) console.error(err); }
    // Copilot and Antigravity read stdout as a JSON decision; {} means "no opinion".
    if (agent === 'copilot' || agent === 'antigravity') try { fs.writeSync(1, '{}\n'); } catch {}
    process.exit(0);
  });
}

// ---- install / uninstall hooks ----
const CLAUDE_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd'];
const CODEX_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd'];
// Copilot and Antigravity run hooks synchronously and treat a failed pre-tool hook as "deny", so they only get
// events that can't block anything: tool calls are reported after they finish ("ToolUse"), not before.
const COPILOT_EVENTS = { sessionStart: 'sessionStart', userPromptSubmitted: 'userPromptSubmitted', postToolUse: 'ToolUse', notification: 'notification', subagentStart: 'subagentStart', subagentStop: 'subagentStop', agentStop: 'agentStop', sessionEnd: 'sessionEnd' };
const ANTIGRAVITY_EVENTS = { SessionStart: 'SessionStart', PostToolUse: 'ToolUse', Stop: 'Stop' };
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

// npx / pnpm dlx / bunx run us from a cache folder the package manager can delete at any time.
// Hooks written from there would silently break later, so init installs a permanent copy first.
const isEphemeral = dir => /[\\/](_npx|dlx[^\\/]*|bunx-[^\\/]*)[\\/]/i.test(dir);
const APP = path.join(HOME, 'app');

function permanentCli() {
  if (!isEphemeral(__dirname)) return CLI;
  const { execSync } = require('child_process');
  const { version } = require('./package.json');
  console.log(`Installing agent-presence ${version} into ${APP} so the hooks keep working after npx clears its cache...`);
  try {
    fs.mkdirSync(APP, { recursive: true });
    fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ private: true }) + '\n');
    // Pack the copy that is running right now (same files, no registry lookup for it), then install that.
    const tgz = execSync(`npm pack "${__dirname}" --pack-destination "${APP}" --silent`, { encoding: 'utf8' }).trim().split(/\r?\n/).pop();
    execSync(`npm install "./${tgz}" --omit=dev --no-audit --no-fund --loglevel=error`, { cwd: APP, stdio: 'inherit' });
    fs.rmSync(path.join(APP, tgz), { force: true });
  } catch (err) {
    console.error(`\nCould not install a permanent copy (${String(err.message).split('\n')[0]}).\nInstall it globally instead:  npm i -g agent-presence && agent-presence init`);
    process.exit(1);
  }
  return path.join(APP, 'node_modules', 'agent-presence', 'cli.js');
}

// Copilot (VS Code agent mode and Copilot CLI): we own the whole file ~/.copilot/hooks/agent-presence.json.
function copilotHooks(file, cli, remove) {
  if (remove) return fs.rmSync(file, { force: true });
  const hooks = {};
  for (const [ev, arg] of Object.entries(COPILOT_EVENTS)) hooks[ev] = [{ type: 'command', command: `node "${cli}" emit copilot ${arg}`, timeoutSec: 5 }];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, hooks }, null, 2) + '\n');
}

// Antigravity: ~/.gemini/config/hooks.json holds named hook groups; ours is the "agent-presence" key.
function antigravityHooks(file, cli, remove) {
  let json = {};
  if (fs.existsSync(file)) {
    json = JSON.parse(fs.readFileSync(file, 'utf8')); // throw on bad JSON rather than clobber it
    fs.copyFileSync(file, file + '.bak-agent-presence');
  }
  delete json['agent-presence'];
  if (!remove) {
    const h = arg => ({ type: 'command', command: `node "${cli}" emit antigravity ${arg}`, timeout: 5 });
    const group = {};
    for (const [ev, arg] of Object.entries(ANTIGRAVITY_EVENTS)) group[ev] = ev.endsWith('ToolUse') ? [{ matcher: '*', hooks: [h(arg)] }] : [h(arg)];
    json['agent-presence'] = group;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

function install(remove) {
  const which = process.argv.slice(3).filter(a => !a.startsWith('-'));
  const home = os.homedir();
  const copilotHome = process.env.COPILOT_HOME || path.join(home, '.copilot');
  // [name, folder that means "this agent is installed", label, (cli, remove) => edit its hooks]
  const targets = [
    ['claude', path.join(home, '.claude'), 'Claude Code (~/.claude/settings.json)', (cli, rm) => editHooksFile(path.join(home, '.claude', 'settings.json'), CLAUDE_EVENTS,
      // exec form: no shell quoting problems with spaces in paths
      () => ({ type: 'command', command: 'node', args: [cli, 'emit', 'claude'], async: true }), rm)],
    ['codex', path.join(home, '.codex'), 'Codex (~/.codex/hooks.json)', (cli, rm) => editHooksFile(path.join(home, '.codex', 'hooks.json'), CODEX_EVENTS,
      () => ({ type: 'command', command: `node "${cli}" emit codex`, async: true, timeout: 5 }), rm)],
    ['copilot', copilotHome, 'Copilot (~/.copilot/hooks/agent-presence.json)', (cli, rm) => copilotHooks(path.join(copilotHome, 'hooks', 'agent-presence.json'), cli, rm)],
    ['antigravity', path.join(home, '.gemini', 'antigravity'), 'Antigravity (~/.gemini/config/hooks.json)', (cli, rm) => antigravityHooks(path.join(home, '.gemini', 'config', 'hooks.json'), cli, rm)],
  ].filter(([name, dir]) => (which.length ? which.includes(name) : fs.existsSync(dir)));
  if (!targets.length) return console.log('No supported agent found. Name one explicitly: agent-presence init claude|codex|copilot|antigravity');

  const cli = remove ? CLI : permanentCli();
  for (const [, , , apply] of targets) apply(cli, remove);
  const names = targets.map(t => t[2]);
  console.log((remove ? 'Removed hooks from: ' : 'Installed hooks for: ') + names.join(', '));
  if (remove) return;
  if (names.some(d => d.startsWith('Codex'))) console.log('Codex: open /hooks in Codex once and trust the agent-presence hooks.');
  if (names.some(d => /^(Copilot|Antigravity)/.test(d))) console.log('Copilot / Antigravity: stickers show each tool call as it finishes (their hooks can\'t run in the background). Restart them to load the hooks.');
  const run = isEphemeral(__dirname) ? 'npx agent-presence' : 'agent-presence';
  console.log(`The stickers appear on your next agent session. To start them now: ${run} overlay`);
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

  agent-presence init [agent...]           install hooks (claude, codex, copilot, antigravity; default: every one found)
  agent-presence uninstall [agent...]      remove hooks
  agent-presence overlay [--quit]          start/stop the floating stickers
  agent-presence watch                     live view in the terminal
  agent-presence emit <agent> [event]      (used by hooks; reads hook JSON on stdin)

Custom stickers: ~/.agent-presence/config.json
  { "avatars": { "claude": "C:/stickers/fox.png", "codex": "...", "subagent": "...", "Explore": "..." } }`;

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'emit') emit(process.argv[3] || 'agent', process.argv[4]);
  else if (cmd === 'init') install(false);
  else if (cmd === 'uninstall') install(true);
  else if (cmd === 'watch') watch();
  else if (cmd === 'overlay') overlay();
  else console.log(HELP);
}

module.exports = { normalize, patchFiles, editHooksFile, copilotHooks, antigravityHooks, isEphemeral, HOME, EVENTS, CONFIG };
