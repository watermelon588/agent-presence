// Transparent, click-through, always-on-top window that tails ~/.agent-presence/events.jsonl,
// plus a tray icon, a right-click menu and a "control room" window, so nothing needs a config edit (or an agent) to change.
const { app, BrowserWindow, ipcMain, screen, shell, Menu, Tray, nativeImage, dialog, globalShortcut } = require('electron');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { HOME, EVENTS, CONFIG, packs, stickerFiles } = require('../cli');

const PID = path.join(HOME, 'overlay.pid');
const MY_STICKERS = path.join(HOME, 'stickers');
const AGENTS = [['claude', 'Claude'], ['codex', 'Codex'], ['copilot', 'Copilot'], ['antigravity', 'Antigravity']];
const COLOR = { claude: '#f6a983', codex: '#8fdcc6', copilot: '#8cc8f5', antigravity: '#f7a8c8' };
const LETTER = { claude: 'C', codex: 'X', copilot: 'P', antigravity: 'A' }; // same as the VS Code badges
const IMG = /\.(png|gif|svg|webp|jpe?g)$/i;
const item = f => ({ name: path.basename(f).replace(IMG, '').replace(/[-_]+/g, ' '), file: f, url: pathToFileURL(f).href });
const SETTINGS = { size: ['small', 'medium', 'large'], show: ['working', 'alerts', 'always'], details: ['hover', 'always'], helpers: ['line', 'pod', 'none'], motion: ['lively', 'calm', 'off'], scope: ['everywhere', 'apps'] };
const BUBBLE = { style: ['card', 'text'], theme: ['auto', 'dark', 'light'], size: ['small', 'medium', 'large'] };
const FLAGS = ['autostart', 'icon', 'shortcuts'];
// "Only over my apps": process names (Windows), app names (Mac) or commands (Linux) of the editors and terminals agents run in
const APPS = ['Code', 'Code - Insiders', 'Cursor', 'Windsurf', 'Antigravity', 'Zed', 'Claude', 'Codex', 'WindowsTerminal', 'Terminal', 'iTerm2', 'Warp', 'Ghostty',
  'Alacritty', 'WezTerm', 'wezterm-gui', 'kitty', 'gnome-terminal-server', 'konsole', 'powershell', 'pwsh', 'cmd', 'idea64', 'idea'];
const DEF = { scope: 'everywhere', apps: APPS, size: 'small', show: 'working', details: 'hover', helpers: 'line', motion: 'lively', icon: true, opacity: 100, shortcuts: true, autostart: true,
  bubble: { on: true, style: 'card', border: true, theme: 'auto', text: 'auto', size: 'medium', auto: true, stats: true } };
// config.json + defaults: what the overlay and the control room see
const settingsOf = c => ({ ...DEF, ...Object.fromEntries(Object.keys(DEF).filter(k => c[k] != null).map(k => [k, c[k]])), bubble: { ...DEF.bubble, ...(c.bubble || {}) }, agents: c.agents || {} });

const readConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; } };
const expand = v => path.resolve(String(v).replace(/^~(?=$|[\\/])/, os.homedir()));
const list = v => (Array.isArray(v) ? v : v ? [v] : []);
const label = k => (AGENTS.find(a => a[0] === k) || [, k])[1];

// Default sticker: a colored disc with the agent's initial (same look as the VS Code badges). The overlay draws the same for helpers.
const disc = (letter, fill, ring = '#fff') => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="${fill}" stroke="${ring}" stroke-width="5"/>`
  + `<text x="32" y="42.5" font-family="Segoe UI,system-ui,sans-serif" font-size="29" font-weight="800" text-anchor="middle" fill="#2b2020">${letter}</text></svg>`);

// config.avatars: key -> an image, "pack:<name>", or a list of both (each session / helper then gets its own).
// Keys: an agent (claude), "model:<text>" (sessions whose model contains it), "<agent>-subagent" (that agent's helpers),
// "subagent" (every helper), or a helper type (Explore).
function avatarSets(cfg) {
  const sets = {}, all = packs();
  for (const [k, v] of Object.entries(cfg.avatars || {})) {
    const urls = stickerFiles(v, all).map(p => pathToFileURL(p).href);
    if (urls.length) sets[k] = urls;
  }
  return sets;
}

// Sticker library: loose images in ~/.agent-presence/stickers, then every pack (yours first).
function library() {
  let loose = [];
  try { loose = fs.readdirSync(MY_STICKERS).filter(n => IMG.test(n)).map(n => item(path.join(MY_STICKERS, n))); } catch {}
  const groups = loose.length ? [{ group: 'My stickers', items: loose }] : [];
  for (const [id, p] of [...packs()].sort((a, b) => (b[1].mine - a[1].mine) || a[0].localeCompare(b[0])))
    groups.push({ group: p.name.replace(/[-_]+/g, ' '), pack: id, mine: p.mine, items: p.files.map(item) });
  return groups;
}

// Helper types and models seen recently, so they can get their own stickers.
function seen() {
  const types = new Set(), models = new Set();
  try {
    const size = fs.statSync(EVENTS).size, len = Math.min(size, 512 * 1024), buf = Buffer.alloc(len), fd = fs.openSync(EVENTS, 'r');
    fs.readSync(fd, buf, 0, len, size - len); fs.closeSync(fd);
    const text = buf.toString('utf8');
    for (const m of text.matchAll(/"subType":"([^"]{1,60})"/g)) types.add(m[1]);
    for (const m of text.matchAll(/"model":"([^"]{1,80})"/g)) models.add(m[1]);
  } catch {}
  for (const k of Object.keys(readConfig().avatars || {})) {
    if (k.startsWith('model:')) models.add(k.slice(6));
    else if (!AGENTS.some(a => k === a[0] || k === a[0] + '-subagent') && k !== 'subagent') types.add(k);
  }
  return { types: [...types].sort(), models: [...models].sort() };
}

function tail(send) {
  let offset = 0;
  try { offset = Math.max(0, fs.statSync(EVENTS).size - 64 * 1024); } catch {} // replay recent so open sessions reappear
  let partial = '';
  const pump = () => {
    let size; try { size = fs.statSync(EVENTS).size; } catch { return; }
    if (size < offset) { offset = 0; partial = ''; } // log was rotated
    if (size === offset) return;
    const fd = fs.openSync(EVENTS, 'r'); const buf = Buffer.alloc(size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset); fs.closeSync(fd); offset = size;
    const lines = (partial + buf.toString('utf8')).split('\n'); partial = lines.pop();
    for (const l of lines) { try { send(JSON.parse(l)); } catch {} }
  };
  pump(); setInterval(pump, 250);
}

let wanted = true, watcher = null;
const front = { name: '', ok: true, failed: false, seen: [] };
let win, tray, room, hideTimer, quitting = false, peek = false, keyState = {}, keysOn;
const recent = []; // last events, replayed into the control room's live view

function setConfig(patch) {
  const c = { ...readConfig(), ...patch };
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2) + '\n');
  push();
}
function setAvatars(key, files) {
  const avatars = { ...(readConfig().avatars || {}) };
  if (files.length) avatars[key] = files.length === 1 ? files[0] : files; else delete avatars[key];
  setConfig({ avatars });
}

function push() {
  const c = readConfig();
  const view = { ...settingsOf(c), avatars: avatarSets(c), names: c.names || {} };
  if (view.shortcuts !== keysOn) registerKeys(view.shortcuts);
  if (view.scope === 'apps') { startFront(); if (front.name) front.ok = isMine(front.name, view.apps); } else stopFront();
  applyVisible();
  if (win && !win.isDestroyed()) win.webContents.send('config', view);
  if (room && !room.isDestroyed()) room.webContents.send('room', roomData());
  if (tray) tray.setContextMenu(menu());
}

// On screen = you want them (tray, Ctrl+Alt+Shift+A) and, with "Only over my apps", one of your apps is in front.
function applyVisible() {
  if (!win || win.isDestroyed()) return;
  const show = wanted && (settingsOf(readConfig()).scope !== 'apps' || front.ok);
  if (show !== win.isVisible()) show ? win.showInactive() : win.hide();
  if (tray) tray.setContextMenu(menu());
}
const setVisible = on => { clearTimeout(hideTimer); wanted = on; applyVisible(); };

// Which app is in front. Windows: one hidden PowerShell loop that prints "pid name" when it changes. Mac: lsappinfo. Linux: xdotool (X11 only).
const isMine = (name, apps) => apps.some(a => a.toLowerCase() === name.toLowerCase());
const frontInfo = () => ({ name: front.name, ok: front.ok, failed: front.failed, seen: front.seen });
const PS = `Add-Type 'using System;using System.Runtime.InteropServices;public class FG{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}'
$last = ''
while ($true) { if (-not (Get-Process -Id PARENT -ErrorAction SilentlyContinue)) { exit } # the overlay quit or crashed
  $p = 0; [void][FG]::GetWindowThreadProcessId([FG]::GetForegroundWindow(), [ref]$p); $n = ''; try { $n = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch {}
  $l = "$p $n"; if ($l -ne $last) { [Console]::Out.WriteLine($l); [Console]::Out.Flush(); $last = $l }; Start-Sleep -Milliseconds 400 }`;
function onFront(pid, name) {
  if (!name || Number(pid) === process.pid) return; // our own control room: keep whatever was showing
  front.name = name;
  front.seen = [name, ...front.seen.filter(n => n !== name)].slice(0, 12);
  front.ok = isMine(name, settingsOf(readConfig()).apps);
  applyVisible();
  if (room && !room.isDestroyed()) room.webContents.send('front', frontInfo());
}
function startFront() {
  if (watcher || front.failed) return;
  const fail = () => { stopFront(); front.failed = true; applyVisible(); };
  if (process.platform === 'win32') {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(PS.replace('PARENT', process.pid), 'utf16le').toString('base64')], { windowsHide: true });
    let buf = '';
    p.stdout.on('data', d => { const lines = (buf + d).split(/\r?\n/); buf = lines.pop(); for (const l of lines) { const m = l.match(/^(\d+) (.+)$/); if (m) onFront(m[1], m[2]); } });
    p.stderr.resume();
    p.on('error', fail);
    p.on('exit', () => { if (watcher === p) watcher = null; });
    watcher = p;
  } else {
    const mac = process.platform === 'darwin';
    const cmd = mac ? 'a=$(lsappinfo front); lsappinfo info -only pid $a; lsappinfo info -only name $a'
      : 'p=$(xdotool getactivewindow getwindowpid) && echo "$p $(cat /proc/$p/comm)"';
    const t = setInterval(() => execFile('/bin/sh', ['-c', cmd], { timeout: 2000 }, (err, out) => {
      if (err) return fail();
      const m = mac ? [, (out.match(/"pid"\s*=\s*(\d+)/) || [])[1], (out.match(/"(?:LSDisplayName|name)"\s*=\s*"([^"]*)"/) || [])[1]] : out.trim().match(/^(\d+) (.+)$/);
      if (m && m[2]) onFront(m[1], m[2]);
    }), 700);
    watcher = { kill: () => clearInterval(t) };
  }
}
function stopFront() { if (watcher) watcher.kill(); watcher = null; front.ok = true; }

// Global keyboard shortcuts: Ctrl+Alt+Shift (Cmd+Alt+Shift on a Mac) + a letter. A always works; the rest can be turned off.
const MOD = 'CommandOrControl+Alt+Shift+';
const cmd = m => win && !win.isDestroyed() && win.webContents.send('cmd', m);
const cycle = k => { const l = SETTINGS[k], v = l[(l.indexOf(settingsOf(readConfig())[k]) + 1) % l.length]; setConfig({ [k]: v }); return v; };
const bubble = patch => setConfig({ bubble: { ...(readConfig().bubble || {}), ...patch } });
const KEYS = [
  ['A', 'Show or hide the stickers', () => { setVisible(!wanted); return wanted && 'Stickers on'; }],
  ['F', 'Everywhere, or only over my apps', () => (cycle('scope') === 'apps' ? 'Only over my apps' : 'Everywhere')],
  ['C', 'Open the control room', () => { openRoom('overview'); }],
  ['B', 'Speech bubbles on or off', () => { const on = !settingsOf(readConfig()).bubble.on; bubble({ on }); return 'Bubbles ' + (on ? 'on' : 'off'); }],
  ['P', 'Peek: open every bubble', () => { peek = !peek; cmd({ peek }); return 'Peek ' + (peek ? 'on' : 'off'); }],
  ['T', 'Bubble theme: auto, dark, light', () => { const l = BUBBLE.theme, v = l[(l.indexOf(settingsOf(readConfig()).bubble.theme) + 1) % l.length]; bubble({ theme: v }); return 'Bubble theme: ' + v; }],
  ['D', 'Details on hover or always', () => 'Details: ' + cycle('details')],
  ['S', 'Next size', () => 'Size: ' + cycle('size')],
  ['W', 'When to show: working, alerts, always', () => 'Show: ' + cycle('show')],
  ['L', 'Helper layout: line, pod, none', () => 'Helpers: ' + cycle('helpers')],
  ['M', 'Motion: lively, calm, off', () => 'Motion: ' + cycle('motion')],
  ['H', 'Hide for 30 minutes', () => { setVisible(false); hideTimer = setTimeout(() => setVisible(true), 30 * 60e3); }],
  ['R', 'Reset positions', () => { win.webContents.send('reset-positions'); return 'Positions reset'; }],
];
function registerKeys(on) {
  keysOn = on;
  globalShortcut.unregisterAll();
  keyState = {};
  for (const [k, , fn] of KEYS) if (on || k === 'A') keyState[k] = globalShortcut.register(MOD + k, () => { const t = fn(); if (t) cmd({ toast: t }); });
}

// Short menu for the tray and for right-clicking a sticker; everything else lives in the control room.
function menu(target) {
  const c = readConfig();
  const items = [];
  if (target) {
    const key = target.subType != null ? (target.subType || target.agent + '-subagent') : target.agent;
    const who = target.subType != null ? (target.subType || label(target.agent) + "'s helpers") : label(target.agent);
    items.push({ label: `Change ${who} sticker…`, click: () => openRoom(key) });
    if (target.subType == null) items.push({ label: `Hide ${who}`, click: () => setConfig({ agents: { ...(c.agents || {}), [target.agent]: false } }) });
    items.push({ type: 'separator' });
  }
  items.push(
    { label: 'Open control room…', accelerator: MOD + 'C', click: () => openRoom('overview') },
    { label: wanted ? 'Hide stickers' : 'Show stickers', accelerator: 'CommandOrControl+Alt+Shift+A', click: () => setVisible(!wanted) },
    { label: 'Only over my apps', type: 'checkbox', checked: c.scope === 'apps', click: () => setConfig({ scope: c.scope === 'apps' ? 'everywhere' : 'apps' }) },
    { label: 'Peek at every bubble', accelerator: MOD + 'P', click: () => { peek = !peek; cmd({ peek }); } },
    { label: 'Hide for 30 minutes', click: () => { setVisible(false); hideTimer = setTimeout(() => setVisible(true), 30 * 60e3); } },
    { label: 'Size', submenu: SETTINGS.size.map(s => ({ label: s[0].toUpperCase() + s.slice(1), type: 'radio', checked: (c.size || 'small') === s, click: () => setConfig({ size: s }) })) },
    { type: 'separator' },
    // Quitting pauses autostart until the next agent session (see autostart() in cli.js).
    { label: 'Quit Agent Peeps', click: () => { try { fs.writeFileSync(path.join(HOME, 'paused'), ''); } catch {} app.quit(); } },
  );
  return Menu.buildFromTemplate(items);
}

function roomData(tab) {
  const c = readConfig(), s = seen();
  const targets = [
    ...AGENTS.map(([k, n]) => ({ key: k, name: n, group: 'Agents', agent: k })),
    { key: 'subagent', name: 'Every helper', group: 'Helpers' },
    ...AGENTS.map(([k, n]) => ({ key: k + '-subagent', name: n + "'s helpers", group: 'Helpers', agent: k })),
    ...s.types.map(t => ({ key: t, name: t, group: 'Helper types' })),
    ...s.models.map(m => ({ key: 'model:' + m, name: m, group: 'Models' })),
  ];
  return {
    tab,
    settings: { ...settingsOf(c), visible: wanted }, front: frontInfo(),
    mac: process.platform === 'darwin', colors: COLOR,
    keys: KEYS.map(([k, text]) => ({ k, text, state: keyState[k] })), // true: works, false: another app has it, undefined: turned off
    agents: AGENTS, targets,
    chosen: Object.fromEntries(Object.entries(c.avatars || {}).map(([k, v]) => [k, list(v).map(x => (String(x).startsWith('pack:') ? x : expand(x)))])),
    urls: avatarSets(c),
    library: library(),
  };
}
function makeRoom() {
  room = new BrowserWindow({ width: 980, height: 680, minWidth: 760, minHeight: 520, show: false, title: 'Agent Peeps · control room', autoHideMenuBar: true,
    backgroundColor: '#0a0b0d', titleBarStyle: 'hidden', titleBarOverlay: process.platform === 'darwin' ? true : { color: '#0a0b0d', symbolColor: '#c9ced6', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  room.loadFile(path.join(__dirname, 'control.html'));
  room.webContents.on('did-finish-load', () => { room.webContents.send('room', roomData()); for (const e of recent) room.webContents.send('event', e); });
  room.on('close', ev => { if (!quitting) { ev.preventDefault(); room.hide(); } });
}
function openRoom(tab) {
  if (!room || room.isDestroyed()) makeRoom();
  room.webContents.send('room', roomData(tab));
  room.show(); room.focus();
}

function trayIcon() {
  // Windows trays need a bitmap: draw the disc onto a canvas in the overlay page.
  return win.webContents.executeJavaScript(`new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas');
    c.width = c.height = 64; c.getContext('2d').drawImage(i, 0, 0, 64, 64); r(c.toDataURL('image/png')); }; i.src = ${JSON.stringify(disc('A', COLOR.claude))}; })`)
    .then(url => nativeImage.createFromDataURL(url).resize({ width: 32, height: 32 }));
}

function start() {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(PID, String(process.pid));
  app.on('will-quit', () => { try { fs.unlinkSync(PID); } catch {} });
  app.on('before-quit', () => { quitting = true; stopFront(); });

  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    ...workArea, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    hasShadow: false, resizable: false, movable: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // Windows can drop us out of always-on-top (sleep/wake, Explorer restarting, an app going fullscreen) and never puts us
  // back, so the stickers end up under browser tabs. Reclaim the top every 2s; the window can't take focus, so typing is never interrupted.
  if (process.platform === 'win32') setInterval(() => { if (win.isVisible()) { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); } }, 2000);
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true }); // clicks pass through except over stickers
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', applyVisible);

  ipcMain.on('mouse', (_, on) => win.setIgnoreMouseEvents(!on, { forward: true }));
  // Reveal, never open: a path from the event log should not be able to launch anything.
  ipcMain.on('reveal', (_, file, cwd) => {
    if (typeof file !== 'string') return;
    const p = path.resolve(typeof cwd === 'string' ? cwd : '', file);
    if (fs.existsSync(p)) shell.showItemInFolder(p);
  });
  ipcMain.on('menu', (_, target) => menu(target && typeof target.agent === 'string' ? target : null).popup({ window: win }));

  // control room: accept known settings, sane keys, and only files from the library (or picked in the file dialog)
  const okKey = k => typeof k === 'string' && /^[\w .:@/-]{1,90}$/.test(k);
  ipcMain.on('set-avatars', (_, key, files) => {
    if (!okKey(key) || !Array.isArray(files)) return;
    const lib = library();
    const known = new Set([...lib.flatMap(g => g.items.map(i => i.file)), ...lib.filter(g => g.pack).map(g => 'pack:' + g.pack), ...list((readConfig().avatars || {})[key]).map(x => (String(x).startsWith('pack:') ? x : expand(x)))]);
    setAvatars(key, files.filter(f => typeof f === 'string' && known.has(f)).slice(0, 50));
  });
  ipcMain.on('browse', async (_, key) => {
    if (!okKey(key)) return;
    const r = await dialog.showOpenDialog(room, { title: 'Add sticker images', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'gif', 'svg', 'webp', 'jpg', 'jpeg'] }] });
    if (!r.canceled) setAvatars(key, [...new Set([...list((readConfig().avatars || {})[key]).map(x => (String(x).startsWith('pack:') ? x : expand(x))), ...r.filePaths])]);
  });
  ipcMain.on('set-config', (_, patch) => {
    const ok = {};
    for (const [k, v] of Object.entries(patch || {})) {
      if (SETTINGS[k] && SETTINGS[k].includes(v)) ok[k] = v;
      else if (FLAGS.includes(k) && typeof v === 'boolean') ok[k] = v;
      else if (k === 'apps' && Array.isArray(v)) ok[k] = v.filter(a => typeof a === 'string' && /^[\w .+()-]{1,60}$/.test(a)).slice(0, 60);
      else if (k === 'opacity' && Number.isInteger(v) && v >= 30 && v <= 100) ok[k] = v;
      else if (k === 'bubble' && v && typeof v === 'object') {
        const b = { ...(readConfig().bubble || {}) };
        for (const [bk, bv] of Object.entries(v)) {
          if ((BUBBLE[bk] && BUBBLE[bk].includes(bv)) || (['on', 'border', 'auto', 'stats'].includes(bk) && typeof bv === 'boolean')
            || (bk === 'text' && (bv === 'auto' || /^#[0-9a-f]{6}$/i.test(bv)))) b[bk] = bv;
        }
        ok[k] = b;
      }
      else if (k === 'agents' && v && typeof v === 'object') ok[k] = Object.fromEntries(Object.entries(v).filter(([a, on]) => okKey(a) && typeof on === 'boolean'));
    }
    setConfig(ok);
  });
  ipcMain.on('visible', (_, on) => setVisible(!!on));
  ipcMain.on('reset-positions', () => win.webContents.send('reset-positions'));
  ipcMain.on('open-folder', () => { fs.mkdirSync(MY_STICKERS, { recursive: true }); shell.openPath(MY_STICKERS); });

  fs.watchFile(CONFIG, { interval: 1000 }, push); // edits from the CLI, an agent or VS Code apply live

  win.webContents.on('did-finish-load', () => {
    push();
    tail(e => {
      win.webContents.send('event', e);
      recent.push(e); if (recent.length > 300) recent.shift();
      if (room && !room.isDestroyed() && !room.webContents.isLoading()) room.webContents.send('event', e);
    });
    const ctl = process.argv.find(a => a.startsWith('--control'));
    if (ctl) openRoom(ctl.split('=')[1] || 'overview'); else makeRoom();
    trayIcon().then(img => { tray = new Tray(img); tray.setToolTip('Agent Peeps'); tray.setContextMenu(menu()); tray.on('click', () => openRoom('overview')); if (process.env.AGENT_PRESENCE_DEBUG) console.log('tray ready'); })
      .catch(err => { if (process.env.AGENT_PRESENCE_DEBUG) console.error('tray failed', err); });
    // Debug: AGENT_PRESENCE_SNAPSHOT=out.png saves what the overlay (or the control room, with --control) draws after N ms, then quits.
    const snap = process.env.AGENT_PRESENCE_SNAPSHOT;
    const wait = Number(process.env.AGENT_PRESENCE_SNAPSHOT_MS || 4000);
    if (snap && ctl) setTimeout(async () => { fs.writeFileSync(snap, (await room.webContents.capturePage()).toPNG()); app.exit(0); }, wait);
    else if (snap) setTimeout(async () => {
      if (process.env.AGENT_PRESENCE_SNAPSHOT_HOVER) await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(process.env.AGENT_PRESENCE_SNAPSHOT_HOVER)})?.classList.add('force-hover'); new Promise(r => setTimeout(r, 300))`);
      const r = JSON.parse(await win.webContents.executeJavaScript(`JSON.stringify([...document.querySelectorAll('.group')].reduce((u, g) => {
        const b = g.getBoundingClientRect(); return b.width ? { l: Math.min(u.l, b.left), t: Math.min(u.t, b.top), r: Math.max(u.r, b.right), b: Math.max(u.b, b.bottom) } : u; },
        { l: innerWidth, t: innerHeight, r: 0, b: 0 }))`));
      const rect = { x: Math.max(0, Math.floor(r.l - 220)), y: Math.max(0, Math.floor(r.t - 160)), width: Math.ceil(Math.max(1, r.r - r.l) + 240), height: Math.ceil(Math.max(1, r.b - r.t) + 170) };
      fs.writeFileSync(snap, (await win.webContents.capturePage(rect)).toPNG()); app.exit(0);
    }, wait);
  });
}

// `agentpeeps control` starts us with --control; if we're already running, the running copy opens the control room.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_, argv) => { const ctl = argv.find(a => a.startsWith('--control')); if (ctl) openRoom(ctl.split('=')[1] || 'overview'); });
  app.whenReady().then(start);
}
app.on('window-all-closed', () => {}); // closing the control room must not quit the overlay
