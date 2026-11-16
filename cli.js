#!/usr/bin/env node
// agentpeeps: hook receiver + installer + terminal view.
// Hooks pipe their JSON into `agentpeeps emit <agent>`; we append one line to
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

const modelOf = m => (m && typeof m === 'object' ? m.id || m.display_name || m.name : m) || null;
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
    // Claude Code sends the model on SessionStart, Antigravity sends modelName; the overlay remembers it per session.
    model: modelOf(h.model || h.modelName || h.model_name),
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

function startOverlay(...args) {
  const bin = electronBin();
  if (!bin) return false;
  require('child_process').spawn(bin, [path.join(__dirname, 'overlay', 'main.js'), ...args], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
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
const isOurs = h => /agent-presence|agentpeeps/.test(JSON.stringify(h)) && JSON.stringify(h).includes('emit');

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
  console.log(`Installing agentpeeps ${version} into ${APP} so the hooks keep working after npx clears its cache...`);
  try {
    fs.mkdirSync(APP, { recursive: true });
    fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ private: true }) + '\n');
    // Pack the copy that is running right now (same files, no registry lookup for it), then install that.
    const tgz = execSync(`npm pack "${__dirname}" --pack-destination "${APP}" --silent`, { encoding: 'utf8' }).trim().split(/\r?\n/).pop();
    execSync(`npm install "./${tgz}" --omit=dev --no-audit --no-fund --loglevel=error`, { cwd: APP, stdio: 'inherit' });
    fs.rmSync(path.join(APP, tgz), { force: true });
  } catch (err) {
    console.error(`\nCould not install a permanent copy (${String(err.message).split('\n')[0]}).\nInstall it globally instead:  npm i -g agentpeeps && agentpeeps init`);
    process.exit(1);
  }
  return path.join(APP, 'node_modules', require('./package.json').name, 'cli.js');
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
  if (!targets.length) return console.log('No supported agent found. Name one explicitly: agentpeeps init claude|codex|copilot|antigravity');

  const cli = remove ? CLI : permanentCli();
  for (const [, , , apply] of targets) apply(cli, remove);
  const names = targets.map(t => t[2]);
  console.log((remove ? 'Removed hooks from: ' : 'Installed hooks for: ') + names.join(', '));
  if (remove) return;
  if (names.some(d => d.startsWith('Codex'))) console.log('Codex: open /hooks in Codex once and trust the Agent Peeps hooks.');
  if (names.some(d => /^(Copilot|Antigravity)/.test(d))) console.log('Copilot / Antigravity: stickers show each tool call as it finishes (their hooks can\'t run in the background). Restart them to load the hooks.');
  const run = isEphemeral(__dirname) ? 'npx agentpeeps' : 'agentpeeps';
  console.log(`The stickers appear on your next agent session. To start them now: ${run} overlay`);
}

// ---- terminal view: every agent, its helpers, and the files each one touched ----
function watch() {
  const agents = new Map(); // key -> last event + files: Map(path -> { t, state })
  let offset = 0;
  const icon = { idle: '·', thinking: '…', reading: '🔍', writing: '✏️', running: '▶', delegating: '🧩', browsing: '🌐', waiting: '❗', done: '✓', working: '⚙' };
  const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + 's' : Math.round(s / 60) + 'm'; };
  const show = (a, f) => { const r = path.relative(a.cwd || '', f); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : f; };
  const row = (a, pad) => {
    const who = a.sub ? `${pad}└ ${a.subType || 'subagent'}` : `${a.agent} ${a.session.slice(0, 6)}`;
    const doing = a.detail && ['running', 'browsing', 'delegating', 'waiting'].includes(a.state) ? a.detail : a.file ? show(a, a.file) : a.detail || '';
    console.log(`  ${icon[a.state] || '?'}  ${who.padEnd(24)} ${a.state.padEnd(10)} ${doing}  (${ago(a.t)})`);
    for (const [f, x] of [...a.files].sort((p, q) => q[1].t - p[1].t).slice(0, 4))
      console.log(`  ${' '.repeat(pad.length + 6)}${(icon[x.state] || '·')} ${show(a, f)}  ${ago(x.t)}`);
  };
  const render = () => {
    console.clear();
    console.log('Agent Peeps  (Ctrl+C to exit)\n');
    const mains = [...agents.values()].filter(a => !a.sub).sort((p, q) => q.t - p.t);
    if (!agents.size) console.log('  no agents active');
    for (const m of mains) {
      row(m, '');
      for (const s of agents.values()) if (s.sub && s.main === m.key) row(s, '   ');
      console.log();
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
        const main = e.agent + ':' + e.session, key = main + (e.sub ? ':' + e.sub : '');
        if (e.state === 'gone') { for (const k of agents.keys()) if (k === key || (!e.sub && k.startsWith(main + ':'))) agents.delete(k); continue; }
        if (!agents.has(main)) agents.set(main, { ...e, sub: null, subType: null, key: main, files: new Map() }); // helper seen before its parent
        const prev = agents.get(key) || { files: new Map() };
        const a = { ...e, key, main, cwd: e.cwd || prev.cwd, files: prev.files };
        if (e.file) a.files.set(path.resolve(a.cwd || '', e.file), { t: e.t, state: e.state });
        agents.set(key, a);
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
  console.log(startOverlay() ? 'Overlay started. Stop it with: agentpeeps overlay --quit' : 'Electron not found. Install with: npm i -g agentpeeps');
}

// ---- sticker packs: any folder of images in ~/.agent-presence/stickers/ (or the bundled avatars/free/ and avatars/stickers/) ----
const IMG = /\.(png|gif|svg|webp|jpe?g)$/i;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const expandPath = s => path.resolve(String(s).replace(/^~(?=$|[\/])/, os.homedir()));

// slug -> { name, dir, files, mine }. A pack is named after its folder; the user's own folders win over bundled ones.
function packs() {
  const out = new Map();
  const walk = (dir, top, mine) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const files = entries.filter(d => d.isFile() && IMG.test(d.name)).map(d => path.join(dir, d.name));
    if (files.length && !top && !out.has(slug(path.basename(dir)))) out.set(slug(path.basename(dir)), { name: path.basename(dir), dir, files, mine });
    for (const d of entries) if (d.isDirectory()) walk(path.join(dir, d.name), false, mine);
  };
  walk(path.join(HOME, 'stickers'), true, true);
  walk(path.join(__dirname, 'avatars', 'free'), true, false); // free packs shipped on npm
  walk(path.join(__dirname, 'avatars', 'stickers'), true, false);
  return out;
}

// "dinosaur" finds the dinosaurs pack and the other way round
const findPack = (all, name) => { const s = slug(name); return [s, s + 's', s.replace(/s$/, '')].find(k => all.has(k)); };

// A config value ("pack:dinosaur", an image path, or a list of both) -> existing image files.
function stickerFiles(value, all = packs()) {
  return [].concat(value || []).flatMap(v => {
    const s = String(v);
    if (s.startsWith('pack:')) { const p = all.get(findPack(all, s.slice(5))); return p ? p.files : []; }
    const f = expandPath(s);
    return fs.existsSync(f) ? [f] : [];
  });
}

// What people type -> config key: claude, helpers -> subagent, claude-helpers -> claude-subagent, model:opus, or a helper type.
const AGENT_NAMES = ['claude', 'codex', 'copilot', 'antigravity'];
function targetKey(t) {
  const s = String(t || '');
  const low = s.toLowerCase();
  if (AGENT_NAMES.includes(low)) return low;
  if (low === 'helpers' || low === 'subagents' || low === 'subagent') return 'subagent';
  const m = low.match(/^(\w+)-(helpers|subagents?)$/);
  if (m && AGENT_NAMES.includes(m[1])) return m[1] + '-subagent';
  if (low.startsWith('model:')) return 'model:' + s.slice(6).trim();
  return s; // a helper type such as Explore
}

function listPacks() {
  const all = [...packs().values()];
  if (!all.length) return console.log(`No packs yet. A pack is a folder of images: put some in ${path.join(HOME, 'stickers', '<pack name>')}`);
  console.log('Sticker packs (use one with: agentpeeps set <target> <pack>)\n');
  for (const p of all.sort((a, b) => a.name.localeCompare(b.name))) console.log(`  ${slug(p.name).padEnd(26)} ${String(p.files.length).padStart(3)} stickers${p.mine ? '' : '  (bundled)'}`);
}

// agentpeeps set <target> <pack|image|default> [more packs or images...]
function setStickers(target, values) {
  if (!target || !values.length) return console.log(SET_HELP);
  const key = targetKey(target);
  const cfg = readConfig();
  const avatars = { ...(cfg.avatars || {}) };
  const all = packs();
  if (/^(default|none|reset)$/i.test(values[0])) delete avatars[key];
  else {
    const picked = [];
    for (const v of values) {
      if (findPack(all, v)) picked.push('pack:' + findPack(all, v));
      else if (fs.existsSync(expandPath(v))) picked.push(expandPath(v));
      else return console.log(`No pack or image called "${v}". See your packs with: agentpeeps packs`);
    }
    avatars[key] = picked.length === 1 ? picked[0] : picked;
  }
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ ...cfg, avatars }, null, 2) + '\n');
  const n = stickerFiles(avatars[key], all).length;
  console.log(avatars[key] ? `${key} -> ${[].concat(avatars[key]).map(v => String(v).replace(/^pack:/, '') + (String(v).startsWith('pack:') ? ' pack' : '')).join(', ')} (${n} sticker${n === 1 ? '' : 's'})` : `${key} -> default`);
  if (n > 1) console.log('Each session gets its own sticker from the set. The overlay updates live.');
}

const SET_HELP = `agentpeeps set <target> <pack|image|default> [more...]

  targets:  claude  codex  copilot  antigravity
            helpers            every subagent
            claude-helpers     one agent's subagents (codex-helpers, ...)
            Explore            one subagent type
            model:opus         sessions whose model contains "opus" (e.g. model:fable, model:opus-5-5)

  examples: agentpeeps set claude dinosaur
            agentpeeps set codex anime
            agentpeeps set model:fable cats
            agentpeeps set helpers robots
            agentpeeps set Explore ~/stickers/detective.png
            agentpeeps set claude default`;

const HELP = `Agent Peeps — stickers for your AI coding agents

  agentpeeps init [agent...]           install hooks (claude, codex, copilot, antigravity; default: every one found)
  agentpeeps uninstall [agent...]      remove hooks
  agentpeeps overlay [--quit]          start/stop the floating stickers
  agentpeeps control [claude|...]      open the control room (optionally on one agent's stickers)
  agentpeeps packs                     list sticker packs
  agentpeeps set <target> <pack>       e.g. set claude dinosaur, set model:opus cats, set helpers robots
  agentpeeps watch                     live view in the terminal
  agentpeeps emit <agent> [event]      (used by hooks; reads hook JSON on stdin)

Packs are folders of images in ~/.agent-presence/stickers/<pack>. Settings live in ~/.agent-presence/config.json.`;

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'emit') emit(process.argv[3] || 'agent', process.argv[4]);
  else if (cmd === 'init') install(false);
  else if (cmd === 'uninstall') install(true);
  else if (cmd === 'watch') watch();
  else if (cmd === 'overlay') overlay();
  else if (cmd === 'packs') listPacks();
  else if (cmd === 'set') setStickers(process.argv[3], process.argv.slice(4));
  else if (cmd === 'control' || cmd === 'stickers' || cmd === 'settings') console.log(startOverlay('--control' + (process.argv[3] ? '=' + targetKey(process.argv[3]) : '')) ? 'Opening the control room...' : 'Electron not found. Install with: npm i -g agentpeeps');
  else console.log(HELP);
}

module.exports = { normalize, patchFiles, editHooksFile, copilotHooks, antigravityHooks, isEphemeral, packs, stickerFiles, targetKey, slug, HOME, EVENTS, CONFIG };
