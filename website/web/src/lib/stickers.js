// Every sticker lives in src/stickers/<pack>/<name>.<ext>, the same packs that ship with Agent Peeps.
// Drop a file into a folder (or add a new folder) and it shows up on every page.
const files = import.meta.glob('../stickers/**/*.{png,svg,gif,webp}', { eager: true, query: '?url', import: 'default' });

const title = (s) => s.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const packLabel = (p) => title(p);

const parse = ([path, url], fan = false) => {
  const [, pack, file] = path.match(/\/([^/]+)\/([^/]+)$/);
  const base = file.replace(/\.\w+$/, '');
  const animated = /-animated$/.test(base) || file.endsWith('.gif');
  return { id: `${pack}/${base}`, pack, file, url, animated, fan,
    name: title(base.replace(/^(cat|capybara)-/, '').replace(/-animated$/, '')) + (animated ? ' (animated)' : '') };
};
const group = (list) => [...new Set(list.map((s) => s.pack))]
  .sort((a, b) => a.localeCompare(b))
  .map((id) => ({ id, label: packLabel(id), items: list.filter((s) => s.pack === id), fan: list[0].fan }));

export const stickers = Object.entries(files).map((e) => parse(e));
export const packs = group(stickers);

// Fan & community stickers: other people's characters and real people. Free, never sold, site only
// (not in the npm package) and never used in marketing. Delete src/stickers-fan/ to remove them all.
const fanFiles = import.meta.glob('../stickers-fan/**/*.{png,svg,gif,webp}', { eager: true, query: '?url', import: 'default' });
export const fanStickers = Object.entries(fanFiles).map((e) => parse(e, true));
export const fanPacks = group(fanStickers);

export const byId = new Map([...stickers, ...fanStickers].map((s) => [s.id, s]));
export const packById = new Map([...packs, ...fanPacks].map((p) => [p.id, p]));

// The four agents, with the same colors and letters as the overlay and the VS Code badges.
export const AGENTS = {
  claude: { name: 'Claude', app: 'Claude Code', letter: 'C', color: '#f6a983' },
  codex: { name: 'Codex', app: 'Codex', letter: 'X', color: '#8fdcc6' },
  copilot: { name: 'Copilot', app: 'GitHub Copilot', letter: 'P', color: '#8cc8f5' },
  antigravity: { name: 'Antigravity', app: 'Antigravity', letter: 'A', color: '#f7a8c8' },
};

// Default sticker: a colored disc with the agent's initial (copied from overlay/main.js).
// Helpers get a white disc ringed in the parent's color.
export const disc = (letter, fill, ring = '#fff') => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="${fill}" stroke="${ring}" stroke-width="5"/>`
  + `<text x="32" y="42.5" font-family="Segoe UI,system-ui,sans-serif" font-size="29" font-weight="800" text-anchor="middle" fill="#2b2020">${letter}</text></svg>`);
export const agentDisc = (a) => disc(AGENTS[a].letter, AGENTS[a].color);
export const helperDisc = (a, type = 'helper') => disc(type[0].toUpperCase(), '#fff', AGENTS[a].color);

export const pick = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
export const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

// 24px line icons from overlay/index.html (drawn twice: white halo, then ink).
export const ICON = {
  thinking: ['M5 12h.01M12 12h.01M19 12h.01', 'dots'],
  reading: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
  writing: ['M15.5 4.5l4 4L8 20H4v-4zM13 7l4 4'],
  running: ['M4 17l6-5-6-5M12.5 19H20'],
  delegating: ['M6 4v10M6 14a4 4 0 0 0 4 4h4M18 6a2.5 2.5 0 1 0 0 .01M16.5 18a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0M18 8.5c0 4-4 5.5-8 5.5'],
  browsing: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18'],
  working: ['M13 3L5 13.5h6L10 21l8-10.5h-6z'],
  waiting: ['M12 7v6M12 17.5h.01'],
  done: ['M5 12.5l4.5 4.5L19 7'],
};
export const VERB = { thinking: 'thinking', reading: 'reading', writing: 'writing', running: 'running', delegating: 'handing off',
  browsing: 'browsing', working: 'working', waiting: 'needs you', done: 'done', idle: 'waiting for a prompt' };
export const iconSvg = (state) => {
  const i = ICON[state]; if (!i) return '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${i[1] ? ` class="${i[1]}"` : ''}><path class="halo" d="${i[0]}"/><path class="ink" d="${i[0]}"/>`
    + (state === 'waiting' ? '<circle class="halo" cx="12" cy="12" r="9.5"/><circle class="ink" cx="12" cy="12" r="9.5"/><path class="ink" d="M12 7v6M12 17.5h.01"/>' : '') + '</svg>';
};
