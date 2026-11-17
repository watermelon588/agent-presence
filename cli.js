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

// ---- terminal stickers: a hand-picked set of clean stickers as small color pixel art, baked by
// scripts/terminal-stickers.py into avatars/terminal.json (20x20 RGBA pixels each, drawn two per character cell) ----
let ART;
const art = () => (ART ??= (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'avatars', 'terminal.json'), 'utf8')); } catch { return { w: 20, h: 20, art: {} }; } })());
const artKey = file => path.relative(path.join(__dirname, 'avatars'), file).split(path.sep).join('/');
// Terminal art for an image file, or null when it isn't in the terminal set (your own images, busy stickers).
const termArt = file => { const a = art().art, k = artKey(file); return a[k] || a[k.replace(/-animated(\.\w+)$/, '$1')] || null; };
const logoArt = agent => art().art[`stickers/model-logos/${agent}-logo.webp`] || null;
// Same pick as the overlay: config sticker set (one per session, from its id), else the agent's logo.
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function stickerFor(e, cfg, all) {
  const av = cfg.avatars || {}, m = String(e.model || '').toLowerCase();
  const mk = m && Object.keys(av).filter(k => k.startsWith('model:') && m.includes(k.slice(6).toLowerCase())).sort((x, y) => y.length - x.length)[0];
  const files = stickerFiles(e.sub ? av[e.subType] || av[e.agent + '-subagent'] || av.subagent : (mk && av[mk]) || av[e.agent], all);
  const f = files.length ? files[hash(e.session + (e.sub || '')) % files.length] : null;
  return (f && termArt(f)) || logoArt(e.agent);
}
const HOP = [2, 1, 0, 1]; // pixels from the top: sits at 2, hops up while working
// One sticker at time t: h/2 + 1 lines, each w cells wide. Each cell is a half block: top pixel as the glyph color,
// bottom pixel as the background. Color codes are only written when they change, which keeps frames small.
// motion: 'still' (idle, done), 'move' (working), 'shake' (needs you)
function stickerLines(st, t, motion = 'move') {
  const { w, h } = art(), rows = h / 2 + 1;
  if (!st) return Array(rows).fill(' '.repeat(w));
  st.px ??= st.f.map(b => Buffer.from(b, 'base64'));
  const buf = st.px[motion === 'still' ? 0 : Math.floor(t / (st.ms || 150)) % st.px.length];
  const oy = motion === 'move' && st.px.length === 1 ? HOP[Math.floor(t / 160) % 4] : 2;
  const dx = motion === 'shake' ? [0, 1, 0, -1][Math.floor(t / 90) % 4] : 0;
  const px = (x, y) => { y -= oy; x -= dx; if (x < 0 || x >= w || y < 0 || y >= h) return null; const i = (y * w + x) * 4; return buf[i + 3] ? `${buf[i]};${buf[i + 1]};${buf[i + 2]}` : null; };
  return Array.from({ length: rows }, (_, r) => {
    let line = '', prev = '';
    for (let x = 0; x < w; x++) {
      const tp = px(x, 2 * r), bt = px(x, 2 * r + 1), key = tp + '|' + bt;
      if (key !== prev) line += !tp && !bt ? '\x1b[0m' : !tp ? `\x1b[0;38;2;${bt}m` : !bt ? `\x1b[0;38;2;${tp}m` : `\x1b[38;2;${tp};48;2;${bt}m`;
      line += !tp && !bt ? ' ' : !tp ? '▄' : '▀';
      prev = key;
    }
    return line + '\x1b[0m';
  });
}
// Cards side by side, wrapped to the terminal width. card = { st, motion, caption: [lines] }
function cardRows(cards, t, cols) {
  const cw = art().w + 4, per = Math.max(1, Math.floor((cols - 2) / cw)), out = [];
  for (let i = 0; i < cards.length; i += per) {
    const row = cards.slice(i, i + per).map(c => [...stickerLines(c.st, t, c.motion).map(l => '  ' + l + '  '), ...c.caption.map(s => (' ' + s).slice(0, cw - 1).padEnd(cw))]);
    for (let y = 0; y < Math.max(...row.map(r => r.length)); y++) out.push(' ' + row.map(r => r[y] || ' '.repeat(cw)).join('').trimEnd());
    out.push('');
  }
  return out;
}
// Cut a line to n visible characters, keeping its color codes whole.
const clip = (l, n) => { let v = 0, o = ''; for (const [s] of l.matchAll(/\x1b\[[0-9;]*m|[^\x1b]/gu)) { if (s[0] !== '\x1b' && ++v > n) break; o += s; } return o + '\x1b[0m'; };
// Keep to n lines without slicing a row of stickers in half: cut at the last blank line that fits and say there's more.
function fit(lines, n) {
  if (lines.length <= n) return lines;
  const cut = lines.lastIndexOf('', n - 2);
  return [...lines.slice(0, cut > 0 ? cut : n - 1), '  \x1b[2m… more below: make the window taller\x1b[0m'];
}
// Redraws in place under the cursor instead of clearing the screen, so it only takes the lines it needs.
// frame(t, cols) -> lines.
function liveView(frame, ms = 80) {
  const out = process.stdout;
  if (!out.isTTY) return console.log(frame(0, out.columns || 100).join('\n'));
  let drawn = 0, last = '', size = '';
  const draw = () => {
    // Ask for the size every time: on Windows the 'resize' event only fires while stdin is being read.
    const [cols, rows] = out.getWindowSize ? out.getWindowSize() : [out.columns || 100, out.rows || 40];
    // A resize rewraps what's on screen, so counting lines back up no longer lands on our first line: start clean.
    if (size && size !== cols + 'x' + rows) { out.write('\x1b[2J\x1b[H'); drawn = 0; last = ''; }
    size = cols + 'x' + rows;
    const lines = fit(frame(Date.now(), cols), rows - 1).map(l => clip(l, cols - 1));
    const s = lines.join('\n');
    if (s === last) return; // nothing moved: don't repaint
    out.write((drawn ? `\x1b[${drawn}F` : '') + '\x1b[0J' + s + '\n');
    drawn = lines.length; last = s;
  };
  out.write('\x1b[?25l');
  process.on('SIGINT', () => { out.write('\x1b[?25h'); process.exit(0); });
  process.on('exit', () => out.write('\x1b[?25h'));
  draw(); setInterval(draw, ms);
}

// ---- terminal view: a sticker per agent and helper, then the files each one touched ----
const VERB = { idle: 'waiting for a prompt', thinking: 'thinking', reading: 'reading', writing: 'writing', running: 'running',
  delegating: 'handing off', browsing: 'browsing', waiting: 'needs you', done: 'done', working: 'working' };
function watch() {
  const agents = new Map(); // key -> last event + files: Map(path -> { t, state })
  let offset = 0, cfg = readConfig(), all = packs();
  setInterval(() => { cfg = readConfig(); all = packs(); }, 5000); // pick up `agentpeeps set` while running
  const icon = { idle: '·', thinking: '…', reading: '»', writing: '✎', running: '▶', delegating: '⇢', browsing: '◎', waiting: '!', done: '✓', working: '*' };
  const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + 's' : Math.round(s / 60) + 'm'; };
  const show = (a, f) => { const r = path.relative(a.cwd || '', f); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : f; };
  const doing = a => (a.detail && ['running', 'browsing', 'delegating', 'waiting'].includes(a.state) ? a.detail : a.file ? show(a, a.file) : a.detail || '');
  const row = (a, pad, out) => {
    const who = a.sub ? `${pad}└ ${a.subType || 'subagent'}` : `${a.agent} ${a.session.slice(0, 6)}`;
    out.push(`  ${icon[a.state] || '?'}  ${who.padEnd(24)} ${a.state.padEnd(10)} ${doing(a)}  (${ago(a.t)})`);
    for (const [f, x] of [...a.files].sort((p, q) => q[1].t - p[1].t).slice(0, 4))
      out.push(`  ${' '.repeat(pad.length + 6)}${(icon[x.state] || '·')} ${show(a, f)}  ${ago(x.t)}`);
  };
  const frame = (t, cols = 100) => {
    const out = ['Agent Peeps  (Ctrl+C to exit)', ''];
    const mains = [...agents.values()].filter(a => !a.sub).sort((p, q) => q.t - p.t);
    if (!agents.size) return [...out, '  no agents active'];
    const list = mains.flatMap(m => [m, ...[...agents.values()].filter(s => s.sub && s.main === m.key)]);
    out.push(...cardRows(list.map(a => ({
      st: stickerFor(a, cfg, all),
      motion: a.state === 'waiting' ? 'shake' : a.state === 'idle' || a.state === 'done' ? 'still' : 'move',
      caption: [a.sub ? `└ ${a.subType || 'helper'}` : `${a.agent}${a.cwd ? ' · ' + path.basename(a.cwd) : ''}`, `${icon[a.state] || '?'} ${VERB[a.state] || a.state} ${a.state === 'idle' || a.state === 'done' ? '' : doing(a) ? path.basename(doing(a)) : ''}`],
    })), t, cols));
    for (const m of mains) {
      row(m, '', out);
      for (const s of agents.values()) if (s.sub && s.main === m.key) row(s, '   ', out);
      out.push('');
    }
    return out;
  };
  const pump = () => {
    let size; try { size = fs.statSync(EVENTS).size; } catch { return; }
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
        const a = { ...e, key, main, cwd: e.cwd || prev.cwd, model: e.model || prev.model, files: prev.files };
        if (e.file) a.files.set(path.resolve(a.cwd || '', e.file), { t: e.t, state: e.state });
        agents.set(key, a);
      }
    }
    for (const [k, a] of agents) if (Date.now() - a.t > 15 * 60e3) agents.delete(k);
  };
  try { offset = Math.max(0, fs.statSync(EVENTS).size - 64 * 1024); } catch {}
  pump(); setInterval(pump, 500);
  liveView(frame);
}

// agentpeeps show [pack|sticker|agent|all...] [--once]: preview terminal stickers. No name: the model logos.
function showStickers(args) {
  const a = art().art, name = k => path.basename(k).replace(/\.\w+$/, '');
  const termPacks = new Map();
  for (const k of Object.keys(a)) { const p = k.split('/').slice(-2)[0]; termPacks.set(p, [...(termPacks.get(p) || []), k]); }
  const names = args.filter(x => !x.startsWith('-'));
  const keys = (names.length ? names : ['model-logos']).flatMap(x => {
    if (/^all$/i.test(x)) return Object.keys(a);
    const p = findPack(termPacks, x);
    if (p) return termPacks.get(p);
    const k = Object.keys(a).find(k => name(k) === slug(x) || name(k) === slug(x) + '-logo');
    return k ? [k] : [];
  });
  if (!keys.length) return console.log(`No terminal sticker called "${names.join(' ')}". Try: ${['all', ...termPacks.keys()].join(', ')}, or an agent (claude, codex...)`);
  const cards = keys.map(k => ({ st: a[k], motion: 'move', caption: [name(k).replace(/-logo$/, '')] }));
  const frame = (t, cols = process.stdout.columns || 100) => cardRows(cards, t, cols);
  if (args.includes('--once')) return console.log(frame(0).join('\n'));
  liveView(frame);
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
  agentpeeps watch                     live view in the terminal, with a sticker per agent
  agentpeeps show [pack|agent|all]     preview terminal stickers (show, show claude, show pixel-food, show all)
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
  else if (cmd === 'show') showStickers(process.argv.slice(3));
  else if (cmd === 'set') setStickers(process.argv[3], process.argv.slice(4));
  else if (cmd === 'control' || cmd === 'stickers' || cmd === 'settings') console.log(startOverlay('--control' + (process.argv[3] ? '=' + targetKey(process.argv[3]) : '')) ? 'Opening the control room...' : 'Electron not found. Install with: npm i -g agentpeeps');
  else console.log(HELP);
}

module.exports = { normalize, patchFiles, termArt, stickerLines, fit, stickerFor, editHooksFile, copilotHooks, antigravityHooks, isEphemeral, packs, stickerFiles, targetKey, slug, HOME, EVENTS, CONFIG };
