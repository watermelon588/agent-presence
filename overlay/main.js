// Transparent, click-through, always-on-top window that tails ~/.agent-presence/events.jsonl,
// plus a tray icon, a right-click menu and a "control room" window, so nothing needs a config edit (or an agent) to change.
const { app, BrowserWindow, ipcMain, screen, shell, Menu, Tray, nativeImage, dialog, globalShortcut } = require('electron');
const fs = require('fs');
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
const SETTINGS = { size: ['small', 'medium', 'large'], show: ['working', 'alerts', 'always'], details: ['hover', 'always'] };

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

let win, tray, room, hideTimer;

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
  const view = { avatars: avatarSets(c), names: c.names || {}, size: c.size || 'small', details: c.details || 'hover', show: c.show || 'working', agents: c.agents || {} };
  if (win && !win.isDestroyed()) win.webContents.send('config', view);
  if (room && !room.isDestroyed()) room.webContents.send('room', roomData());
  if (tray) tray.setContextMenu(menu());
}

const setVisible = on => { clearTimeout(hideTimer); on ? win.showInactive() : win.hide(); if (tray) tray.setContextMenu(menu()); };

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
    { label: 'Open control room…', click: () => openRoom('settings') },
    { label: win && win.isVisible() ? 'Hide stickers' : 'Show stickers', accelerator: 'CommandOrControl+Alt+Shift+A', click: () => setVisible(!win.isVisible()) },
    { label: 'Hide for 30 minutes', click: () => { setVisible(false); hideTimer = setTimeout(() => setVisible(true), 30 * 60e3); } },
    { label: 'Size', submenu: SETTINGS.size.map(s => ({ label: s[0].toUpperCase() + s.slice(1), type: 'radio', checked: (c.size || 'small') === s, click: () => setConfig({ size: s }) })) },
    { type: 'separator' },
    { label: 'Quit Agent Peeps', click: () => app.quit() },
  );
  return Menu.buildFromTemplate(items);
}

function roomData(tab) {
  const c = readConfig(), s = seen();
  const targets = [
    ...AGENTS.map(([k, n]) => ({ key: k, name: n, group: 'Agents', def: disc(LETTER[k], COLOR[k]) })),
    { key: 'subagent', name: 'Every helper', group: 'Helpers', def: disc('S', '#fff', '#c9b8f4') },
    ...AGENTS.map(([k, n]) => ({ key: k + '-subagent', name: n + "'s helpers", group: 'Helpers', def: disc(LETTER[k], '#fff', COLOR[k]) })),
    ...s.types.map(t => ({ key: t, name: t, group: 'Helper types', def: disc(t[0].toUpperCase(), '#fff', '#c9b8f4') })),
    ...s.models.map(m => ({ key: 'model:' + m, name: m, group: 'Models', def: disc('M', '#fff', '#b9b0a6') })),
  ];
  return {
    tab,
    settings: { size: c.size || 'small', show: c.show || 'working', details: c.details || 'hover', agents: c.agents || {}, autostart: c.autostart !== false, visible: !!(win && win.isVisible()) },
    agents: AGENTS, targets,
    chosen: Object.fromEntries(Object.entries(c.avatars || {}).map(([k, v]) => [k, list(v).map(x => (String(x).startsWith('pack:') ? x : expand(x)))])),
    urls: avatarSets(c),
    library: library(),
  };
}
function openRoom(tab) {
  if (room && !room.isDestroyed()) { room.webContents.send('room', roomData(tab)); room.show(); return room.focus(); }
  room = new BrowserWindow({ width: 860, height: 620, title: 'Agent Peeps · control room', autoHideMenuBar: true, backgroundColor: '#fffdf8',
    webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  room.loadFile(path.join(__dirname, 'control.html'));
  room.webContents.on('did-finish-load', () => room.webContents.send('room', roomData(tab)));
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

  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    ...workArea, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    hasShadow: false, resizable: false, movable: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true }); // clicks pass through except over stickers
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.showInactive());

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
      else if (k === 'autostart' && typeof v === 'boolean') ok[k] = v;
      else if (k === 'agents' && v && typeof v === 'object') ok[k] = Object.fromEntries(Object.entries(v).filter(([a, on]) => okKey(a) && typeof on === 'boolean'));
    }
    setConfig(ok);
  });
  ipcMain.on('visible', (_, on) => setVisible(!!on));
  ipcMain.on('reset-positions', () => win.webContents.send('reset-positions'));
  ipcMain.on('open-folder', () => { fs.mkdirSync(MY_STICKERS, { recursive: true }); shell.openPath(MY_STICKERS); });

  globalShortcut.register('CommandOrControl+Alt+Shift+A', () => setVisible(!win.isVisible()));
  fs.watchFile(CONFIG, { interval: 1000 }, push); // edits from the CLI, an agent or VS Code apply live

  win.webContents.on('did-finish-load', () => {
    push();
    tail(e => win.webContents.send('event', e));
    const ctl = process.argv.find(a => a.startsWith('--control'));
    if (ctl) openRoom(ctl.split('=')[1] || 'settings');
    trayIcon().then(img => { tray = new Tray(img); tray.setToolTip('Agent Peeps'); tray.setContextMenu(menu()); tray.on('click', () => openRoom('settings')); if (process.env.AGENT_PRESENCE_DEBUG) console.log('tray ready'); })
      .catch(err => { if (process.env.AGENT_PRESENCE_DEBUG) console.error('tray failed', err); });
    // Debug: AGENT_PRESENCE_SNAPSHOT=out.png saves what the overlay (or the control room, with --control) draws after N ms, then quits.
    const snap = process.env.AGENT_PRESENCE_SNAPSHOT;
    const wait = Number(process.env.AGENT_PRESENCE_SNAPSHOT_MS || 4000);
    if (snap && room) setTimeout(async () => { fs.writeFileSync(snap, (await room.webContents.capturePage()).toPNG()); app.exit(0); }, wait);
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
  app.on('second-instance', (_, argv) => { const ctl = argv.find(a => a.startsWith('--control')); if (ctl) openRoom(ctl.split('=')[1] || 'settings'); });
  app.whenReady().then(start);
}
app.on('window-all-closed', () => {}); // closing the control room must not quit the overlay
