// Transparent, click-through, always-on-top window that tails ~/.agent-presence/events.jsonl.
const { app, BrowserWindow, ipcMain, screen, shell, Menu, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { HOME, EVENTS, CONFIG } = require('../cli');

const PID = path.join(HOME, 'overlay.pid');
const readConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; } };

function avatarUrls(cfg) {
  const def = n => pathToFileURL(path.join(__dirname, '..', 'avatars', n + '.svg')).href;
  const urls = { claude: def('claude'), codex: def('codex'), agent: def('subagent'), subagent: def('subagent') };
  for (const [k, v] of Object.entries(cfg.avatars || {})) {
    const p = path.resolve(String(v).replace(/^~(?=$|[\\/])/, require('os').homedir()));
    if (fs.existsSync(p)) urls[k] = pathToFileURL(p).href;
  }
  return urls;
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

function start() {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(PID, String(process.pid));
  app.on('will-quit', () => { try { fs.unlinkSync(PID); } catch {} });

  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    ...workArea, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
    hasShadow: false, resizable: false, movable: false, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true }); // clicks pass through except over stickers
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.showInactive());

  ipcMain.on('mouse', (_, over) => win.setIgnoreMouseEvents(!over, { forward: true }));
  // Reveal, never open: a path from the event log should not be able to launch anything.
  ipcMain.on('reveal', (_, file, cwd) => {
    if (typeof file !== 'string') return;
    const p = path.resolve(typeof cwd === 'string' ? cwd : '', file);
    if (fs.existsSync(p)) shell.showItemInFolder(p);
  });
  ipcMain.on('menu', () => Menu.buildFromTemplate([
    { label: 'Hide for 10 minutes', click: () => { win.hide(); setTimeout(() => win.showInactive(), 10 * 60e3); } },
    { label: 'Quit agent-presence', click: () => app.quit() },
  ]).popup({ window: win }));
  globalShortcut.register('CommandOrControl+Alt+Shift+A', () => (win.isVisible() ? win.hide() : win.showInactive()));

  win.webContents.on('did-finish-load', () => {
    const cfg = readConfig();
    win.webContents.send('config', { avatars: avatarUrls(cfg), names: cfg.names || {} });
    tail(e => win.webContents.send('event', e));
    // Debug: AGENT_PRESENCE_SNAPSHOT=out.png saves what the overlay draws after N ms, then quits.
    const snap = process.env.AGENT_PRESENCE_SNAPSHOT;
    if (snap) setTimeout(async () => {
      const r = JSON.parse(await win.webContents.executeJavaScript('JSON.stringify(dock.getBoundingClientRect())'));
      const rect = { x: Math.max(0, Math.floor(r.x - 160)), y: Math.max(0, Math.floor(r.y - 120)), width: Math.ceil(r.width + 200), height: Math.ceil(r.height + 140) };
      fs.writeFileSync(snap, (await win.webContents.capturePage(rect)).toPNG()); app.exit(0);
    }, Number(process.env.AGENT_PRESENCE_SNAPSHOT_MS || 4000));
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
