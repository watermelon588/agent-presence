const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPresence, tail } = require('./presence');

const HOME = process.env.AGENT_PRESENCE_HOME || path.join(os.homedir(), '.agent-presence');
const NAMES = { claude: 'Claude', codex: 'Codex', copilot: 'Copilot', antigravity: 'Antigravity' };
const base = p => path.basename(p || '');
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago'; };
const who = h => (NAMES[h.agent] || h.agent) + (h.sub ? ' · ' + (h.subType || 'subagent') : '');
// Filled-circle letter (🅐..🅩, U+1F150): a text glyph, so the badge takes the agent's theme color.
const solid = name => { const c = String(name || 's').toUpperCase().charCodeAt(0); return c >= 65 && c <= 90 ? String.fromCodePoint(0x1F150 + c - 65) : String(name)[0]; };
const colorId = h => (h.sub ? 'agentPresence.subagent' : NAMES[h.agent] ? 'agentPresence.' + h.agent : 'agentPresence.other');

function activate(ctx) {
  const p = createPresence();
  const log = vscode.window.createOutputChannel('Agent Presence', { log: true });
  ctx.subscriptions.push(log);
  const cfg = () => vscode.workspace.getConfiguration('agentPresence');
  const readUserConfig = () => { try { return JSON.parse(fs.readFileSync(path.join(HOME, 'config.json'), 'utf8')); } catch { return {}; } };

  // ---- Explorer badges + colors ----
  const decoChanged = new vscode.EventEmitter();
  ctx.subscriptions.push(decoChanged, vscode.window.registerFileDecorationProvider({
    onDidChangeFileDecorations: decoChanged.event,
    provideFileDecoration(uri) {
      if (uri.scheme !== 'file') return;
      const h = p.fileInfo(uri.fsPath, Date.now(), cfg().get('recentSeconds', 90) * 1000);
      if (process.env.AGENT_PRESENCE_DEBUG) log.info(`decorate? ${uri.fsPath} -> ${h ? h.agent + ' ' + h.state : 'none'} | known: ${p.list().map(a => a.file).filter(Boolean).join(', ')}`);
      if (!h) return;
      const b = cfg().get('badges') || {};
      const badge = h.sub ? b[h.subType] || b.subagent || solid(h.subType) : b[h.agent] || solid(h.agent);
      return {
        badge: [...String(badge)].slice(0, 2).join(''),
        color: new vscode.ThemeColor(colorId(h)),
        tooltip: `${who(h)} · ${h.state}${h.active ? ' now' : ' · ' + ago(h.t)}`,
        propagate: true,
      };
    },
  }));

  // ---- "Agents" view: stickers as icons, subagents and recent files underneath ----
  // The sticker chosen in the control room (a list gives each session its own, same pick as the overlay);
  // otherwise a dot in the agent's color.
  const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const avatar = (a) => {
    const custom = readUserConfig().avatars || {};
    const set = [].concat((a.sub ? custom[a.subType] || custom[a.agent + '-subagent'] || custom.subagent : custom[a.agent]) || []);
    const pick = set.length && set[hash(a.session + (a.sub || '')) % set.length];
    if (pick) { const f = path.resolve(String(pick).replace(/^~(?=$|[\\/])/, os.homedir())); if (fs.existsSync(f)) return vscode.Uri.file(f); }
    return new vscode.ThemeIcon(a.sub ? 'circle-large-outline' : 'circle-large-filled', new vscode.ThemeColor(colorId(a)));
  };
  const treeChanged = new vscode.EventEmitter();
  const tree = {
    onDidChangeTreeData: treeChanged.event,
    getChildren(el) {
      const all = p.list();
      if (!el) return all.filter(a => !a.sub).sort((x, y) => y.t - x.t).map(a => ({ kind: 'agent', a }));
      if (el.kind !== 'agent') return [];
      const subs = all.filter(a => a.sub && a.main === el.a.key).map(a => ({ kind: 'agent', a }));
      const files = [...el.a.files.values()].sort((x, y) => y.t - x.t).slice(0, 5).map(f => ({ kind: 'file', f }));
      return [...subs, ...files];
    },
    getTreeItem(el) {
      if (el.kind === 'file') {
        const item = new vscode.TreeItem(vscode.Uri.file(el.f.path));
        item.description = ago(el.f.t);
        item.command = { command: 'vscode.open', title: 'Open', arguments: [vscode.Uri.file(el.f.path)] };
        return item;
      }
      const a = el.a;
      const label = a.sub ? a.subType || 'subagent' : (readUserConfig().names || {})[a.agent] || NAMES[a.agent] || a.agent;
      const hasKids = a.files.size || p.list().some(s => s.main === a.key && s.sub);
      const item = new vscode.TreeItem(label, hasKids ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.iconPath = avatar(a);
      const doing = a.detail && ['running', 'browsing', 'delegating', 'waiting'].includes(a.state) ? a.detail : a.file ? base(a.file) : a.detail;
      item.description = a.state + (doing ? ' · ' + doing : '') + (a.sub || !a.cwd ? '' : ' — ' + base(a.cwd));
      item.tooltip = `${who(a)} · ${a.state} · ${ago(a.t)}${a.cwd ? '\n' + a.cwd : ''}`;
      return item;
    },
  };
  ctx.subscriptions.push(treeChanged, vscode.window.registerTreeDataProvider('agentPresence.agents', tree));

  // ---- wire the event log in; refresh at most every 300 ms, and every 5 s so "recent" badges expire ----
  let pending = null;
  const refresh = () => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; p.prune(Date.now()); decoChanged.fire(undefined); treeChanged.fire(undefined); }, 300);
  };
  const file = path.join(HOME, 'events.jsonl');
  log.info(`watching ${file}${fs.existsSync(file) ? '' : ' (not created yet: run `agent-presence init`, then start an agent)'}`);
  const stop = tail(file, events => { events.forEach(p.apply); log.info(`${events.length} event(s), ${p.list().length} agent(s) active`); refresh(); });
  const timer = setInterval(refresh, 5000);
  ctx.subscriptions.push({ dispose: () => { stop(); clearInterval(timer); clearTimeout(pending); } });
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('agentPresence')) refresh(); }));
}

function deactivate() {}

module.exports = { activate, deactivate };
