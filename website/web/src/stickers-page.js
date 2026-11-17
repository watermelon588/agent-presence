
import { initUI, gsap, ScrollTrigger, reduced } from './lib/ui.js';
import { createDock } from './lib/dock.js';
import { packs, fanPacks, byId, packById, agentDisc, helperDisc, shuffle } from './lib/stickers.js';

// A slot points at a whole pack (that's what `agentpeeps set` takes); `face` is the sticker you clicked, shown in the preview.
const SLOTS = [['claude', 'Claude', 'claude'], ['codex', 'Codex', 'codex'], ['helpers', 'Helpers', 'subagent']];
const DISC = { claude: agentDisc('claude'), codex: agentDisc('codex'), helpers: helperDisc('claude', 'helper') };
const $ = (id) => document.getElementById(id);
const blank = () => ({ pack: { claude: null, codex: null, helpers: null }, face: {}, active: 'claude' });
const custom = {}; // slot -> data URL of a sticker made below (this tab only)

/* ---------- state (remembered per browser; ?claude=<pack> from the gacha wins) ---------- */
let state = blank();
try { Object.assign(state, JSON.parse(localStorage.getItem('ap-shop')) || {}); } catch { /* fresh start */ }
for (const [k] of SLOTS) {
  if (!packById.has(state.pack[k])) state.pack[k] = null;
  if (!byId.has(state.face[k]) || byId.get(state.face[k]).pack !== state.pack[k]) state.face[k] = state.pack[k] ? packById.get(state.pack[k]).items[0].id : null;
}
const fromUrl = new URLSearchParams(location.search).get('claude');
if (packById.has(fromUrl)) { state.pack.claude = fromUrl; state.face.claude = packById.get(fromUrl).items[0].id; history.replaceState(null, '', location.pathname + location.hash); }
const save = () => { try { localStorage.setItem('ap-shop', JSON.stringify(state)); } catch { /* storage blocked */ } };

/* ---------- the little desktop: real overlay sizes, light or dark wallpaper ---------- */
const desk = $('desk'), preview = $('preview');
const dock = createDock(preview);
const label = (k) => SLOTS.find((x) => x[0] === k)[1];
const faceUrl = (k) => custom[k] || (state.face[k] ? byId.get(state.face[k]).url : null);
const paintDock = (k) => dock.setAvatar(SLOTS.find((x) => x[0] === k)[2], faceUrl(k));
const SUB = { 52: 32, 68: 40, 88: 52 }; // helper size per sticker size, as in the overlay
document.querySelector('[data-desk-controls]').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  if (b.parentElement.dataset.set === 'wall') desk.dataset.wall = b.dataset.v;
  else { preview.style.setProperty('--ap-s', b.dataset.v + 'px'); preview.style.setProperty('--sub', SUB[b.dataset.v] + 'px'); }
});
// never clip: if the dock is wider than the desk (large size on a phone), shrink it to fit
const fit = () => {
  const room = desk.clientWidth - 28, w = preview.offsetWidth;
  preview.style.scale = w > room ? String(room / w) : '';
};
const ro = new ResizeObserver(fit); ro.observe(desk); ro.observe(preview);

/* ---------- slots ---------- */
function renderSlots() {
  $('slots').innerHTML = SLOTS.map(([k, name]) => {
    const s = state.face[k] && byId.get(state.face[k]);
    const p = state.pack[k] && packById.get(state.pack[k]);
    const sub = custom[k] ? 'Your own sticker' : p ? `${p.label} pack` : 'Default disc';
    return `<div class="flex items-center gap-2">
      <button class="slotbtn flex-1" data-slot="${k}" aria-pressed="${state.active === k}">
        <img src="${faceUrl(k) || DISC[k]}" alt="">
        <span class="min-w-0"><b class="block text-[15px] font-semibold">${name}</b><small class="block truncate text-[12.5px] text-muted">${sub}</small></span>
        ${state.active === k ? '<i class="ph-fill ph-cursor-click ml-auto pr-1 text-accent-text"></i>' : ''}
      </button>
      ${s && !custom[k] ? `<a class="icon-btn no-spin shrink-0" href="${s.url}" download="${s.file}" aria-label="Download ${s.name}"><i class="ph-bold ph-download-simple"></i></a>` : ''}
    </div>`;
  }).join('');
}
$('slots').addEventListener('click', (e) => {
  const b = e.target.closest('[data-slot]'); if (!b) return;
  state.active = b.dataset.slot; save(); renderSlots(); markPacks();
});

/* ---------- the commands to paste ---------- */
function renderCommands() {
  const lines = [];
  for (const [k] of SLOTS) {
    if (custom[k]) lines.push('# save my-sticker.png into ~/.agent-presence/stickers/mine/', `agentpeeps set ${k} mine`);
    else if (state.pack[k]) {
      if (packById.get(state.pack[k]).fan) lines.push(`# fan pack: save its stickers into ~/.agent-presence/stickers/${state.pack[k]}/`);
      lines.push(`agentpeeps set ${k} ${state.pack[k]}`);
    }
  }
  const esc = (l) => l.replace(/</g, '&lt;');
  $('cfg').innerHTML = lines.length
    ? lines.map((l) => (l.startsWith('#') ? `<span class="c">${esc(l)}</span>` : `<span class="p">$</span> ${esc(l)}`)).join('\n')
    : '<span class="c"># pick a sticker to start</span>';
  $('copyCfg').dataset.copy = lines.join('\n');
  $('copyCfg').disabled = !lines.length;
}

/* ---------- library: one section per pack, then the fan group ---------- */
const tile = (s, p) => `<button class="tile" data-id="${s.id}" data-q="${(s.name + ' ' + p.label + (s.animated ? ' gif animated' : '')).toLowerCase()}" title="${s.name}">
        <img src="${s.url}" alt="${s.name}" loading="lazy" decoding="async">${s.animated ? '<span class="gif">GIF</span>' : ''}<span class="tname">${s.name}</span></button>`;
const section = (p) => `
  <section class="mb-12 scroll-mt-44" id="${p.id}" data-pack="${p.id}">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h3 class="text-2xl">${p.label} <span class="ml-1 align-middle font-sans text-sm font-normal text-muted" data-n>${p.items.length}</span></h3>
      <button class="usepack" data-use="${p.id}"></button>
    </div>
    <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
      ${p.items.map((s) => tile(s, p)).join('')}
    </div>
  </section>`;
// "All" is one mixed wall so the first screen shows every flavour: Claude first, then a blend of the small
// packs, then everything else, with the big capybara, seal and cat packs last. Every sticker is in it.
const FIRST = ['claude'];
const NEXT = ['color-blobs', 'costume-cats', 'flame-expressions', 'fruit-cats', 'gradient-icons', 'manga-faces', 'pixel-food', 'plush-blobs',
  'angry-birds', 'anime-reactions', 'brand-cutouts', 'cartoons', 'chainsaw-chibis', 'minions'];
const LAST = ['capybaras', 'seals-and-sea-lions', 'cats'];
// mix packs evenly: draw from each pack in proportion to what it has left
const blend = (qs) => {
  const out = [];
  for (let left = qs.reduce((n, q) => n + q.length, 0); left; left--) {
    let r = Math.random() * left;
    out.push(qs.find((q) => (r -= q.length) < 0).pop());
  }
  return out;
};
const pools = new Map([...packs, ...fanPacks].map((p) => [p.id, shuffle([...p.items])]));
const draw = (ids, cap = Infinity) => blend(ids.map((id) => (pools.get(id) || []).splice(0, cap)));
const rest = [...pools.keys()].filter((id) => !LAST.includes(id)); // includes what FIRST and NEXT left over
// top frontier-model logos, pulled out of their pack and sprinkled through the first rows
const TOP_LOGOS = ['claude', 'openai', 'gemini', 'grok', 'meta', 'deepseek'].map((n) => `model-logos/${n}-logo`);
const logoPool = pools.get('model-logos') || [];
const top = TOP_LOGOS.map((id) => logoPool.splice(logoPool.findIndex((s) => s.id === id) >>> 0, 1)[0]).filter(Boolean);
const next = draw(NEXT, 6);
top.forEach((s, i) => next.splice(i * 5 + 1, 0, s)); // every 5th: never one column in 3/4/6-col grids
// two Claude stickers, a taste of each small pack (6 at most) with the logos, then everything left, big packs last
const mix = [...draw(FIRST, 2), ...next, ...draw(rest), ...draw(LAST)];

// hello@agentpeeps.space is a placeholder address: swap it for the real takedown inbox.
$('grid').innerHTML = `<section id="mix" data-mix>
    <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">${mix.map((s) => tile(s, packById.get(s.pack))).join('')}</div>
    <p class="mt-6 text-center text-[13px] text-muted">Includes fan stickers: free, not for sale, not affiliated with their owners. Want something removed? <a class="font-semibold text-accent-text underline-offset-4 hover:underline" href="mailto:hello@agentpeeps.space">hello@agentpeeps.space</a></p>
  </section>` + packs.map(section).join('') + `
  <div id="fan" data-fan class="mt-20 border-t border-line pt-10">
    ${fanPacks.map(section).join('')}
    <p class="text-center text-[13px] text-muted"><b class="font-semibold text-ink">Fan stickers: free, not for sale.</b> Not affiliated with or endorsed by their owners. Want something removed? <a class="font-semibold text-accent-text underline-offset-4 hover:underline" href="mailto:hello@agentpeeps.space">hello@agentpeeps.space</a></p>
  </div>`;

function markPacks() {
  const faces = {};
  for (const [k, name] of SLOTS) if (state.face[k] && !custom[k]) faces[state.face[k]] ??= name;
  document.querySelectorAll('.tile').forEach((t) => {
    const b = faces[t.dataset.id];
    t.setAttribute('aria-current', !!b);
    if (b) t.dataset.badge = b; else delete t.dataset.badge;
  });
  document.querySelectorAll('[data-use]').forEach((b) => {
    const on = !custom[state.active] && state.pack[state.active] === b.dataset.use;
    b.setAttribute('aria-pressed', on);
    b.textContent = on ? `${label(state.active)} uses this` : `Use for ${label(state.active)}`;
  });
}

let toastTimer;
function toast(src, text) {
  const el = $('toast');
  el.innerHTML = `<img src="${src}" alt=""><span>${text}</span>`;
  el.hidden = false;
  if (!reduced) gsap.fromTo(el, { y: 24, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function choose(s) {
  const k = state.active;
  delete custom[k];
  state.pack[k] = s.pack; state.face[k] = s.id; save();
  paintDock(k); renderSlots(); renderCommands(); markPacks();
  toast(s.url, `${label(k)} now uses <b>${packById.get(s.pack).label}</b>`);
  if (!reduced) gsap.from(`[data-slot="${k}"] img`, { scale: 0.6, rotation: -20, duration: 0.5, ease: 'back.out(2.4)' });
}
$('grid').addEventListener('click', (e) => {
  const use = e.target.closest('[data-use]');
  if (use) return choose(packById.get(use.dataset.use).items[0]);
  const t = e.target.closest('.tile'); if (!t) return;
  choose(byId.get(t.dataset.id));
  if (!reduced) gsap.fromTo(t.querySelector('img'), { scale: 0.8 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)', clearProps: 'scale' });
});

$('reset').addEventListener('click', () => {
  state = blank();
  for (const k in custom) delete custom[k];
  for (const [k] of SLOTS) paintDock(k);
  clearMade(); save(); renderSlots(); renderCommands(); markPacks();
});

/* ---------- filter chips + search ---------- */
const hashPack = location.hash.slice(1);
let pack = hashPack === 'fan' || packById.has(hashPack) ? hashPack : 'all';
const fanCount = fanPacks.reduce((n, p) => n + p.items.length, 0), total = packs.reduce((n, p) => n + p.items.length, 0) + fanCount;
$('chips').innerHTML = [['all', 'All', mix.length], ...packs.map((p) => [p.id, p.label, p.items.length]), ['fan', 'Fan stickers', fanCount], ...fanPacks.map((p) => [p.id, p.label, p.items.length])]
  .map(([id, name, n]) => `<button class="fchip${id === 'fan' ? ' ml-3' : ''}" data-pack="${id}" aria-pressed="${id === pack}">${name}<small>${n}</small></button>`).join('');
$('q').placeholder = `Search ${total} stickers`;

function applyFilter() {
  const q = $('q').value.trim().toLowerCase();
  let shown = 0, fanShown = 0;
  document.querySelectorAll('#grid section').forEach((sec) => {
    let n = 0;
    sec.querySelectorAll('.tile').forEach((t) => { const ok = !q || t.dataset.q.includes(q); t.hidden = !ok; n += ok; });
    const fan = !!sec.closest('[data-fan]');
    const visible = (sec.hasAttribute('data-mix') ? pack === 'all' : sec.dataset.pack === pack || (pack === 'fan' && fan)) && n > 0;
    sec.hidden = !visible;
    const count = sec.querySelector('[data-n]'); if (count) count.textContent = n;
    if (visible) { shown += n; if (fan) fanShown += n; }
  });
  $('fan').hidden = !fanShown;
  $('fan').classList.toggle('!mt-0', pack === 'fan');
  $('fan').classList.toggle('!border-0', pack === 'fan');
  $('empty').classList.toggle('hidden', shown > 0);
  ScrollTrigger.refresh();
}
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pack]'); if (!b) return;
  pack = b.dataset.pack;
  document.querySelectorAll('#chips [data-pack]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  history.replaceState(null, '', pack === 'all' ? location.pathname + location.search : '#' + pack);
  applyFilter();
  if (!reduced) gsap.from([...document.querySelectorAll('#grid section:not([hidden]) .tile:not([hidden])')].slice(0, 48), { opacity: 0, y: 16, duration: 0.5, stagger: 0.012, ease: 'expo.out', clearProps: 'all' });
});
$('q').addEventListener('input', applyFilter);

/* ---------- make your own: any image becomes a die-cut sticker, all in the browser ---------- */
const canvas = (w, h = w) => Object.assign(document.createElement('canvas'), { width: w, height: h });
async function dieCut(file) {
  if (!/^image\/(png|webp|jpeg)$/.test(file.type)) throw new Error("That isn't a PNG, WebP or JPG.");
  if (file.size > 10 * 1024 * 1024) throw new Error('That image is over 10 MB. Try a smaller one.');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("Couldn't read that image."); });
  // 1. work at 512px at most
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const src = canvas(w, h), sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(bmp, 0, 0, w, h);
  // 2. trim the transparent edges
  const a = sctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, opaque = true;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const al = a[(y * w + x) * 4 + 3];
    if (al < 250) opaque = false;
    if (al > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('That image is completely transparent.');
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  // 3. fit into 256px with room for an 8px white border and a soft shadow
  const S = 256, B = 8, P = B + 12, s = Math.min((S - 2 * P) / tw, (S - 2 * P) / th);
  const dw = tw * s, dh = th * s, dx = (S - dw) / 2, dy = (S - dh) / 2 - 3;
  const art = canvas(S), actx = art.getContext('2d');
  if (opaque) { actx.beginPath(); actx.roundRect(dx, dy, dw, dh, Math.min(dw, dh) * 0.16); actx.clip(); } // photos get rounded corners
  actx.drawImage(src, x0, y0, tw, th, dx, dy, dw, dh);
  const sil = canvas(S), ictx = sil.getContext('2d');
  for (let i = 0; i < 24; i++) ictx.drawImage(art, Math.cos(i * Math.PI / 12) * B, Math.sin(i * Math.PI / 12) * B);
  ictx.globalCompositeOperation = 'source-in'; ictx.fillStyle = '#fff'; ictx.fillRect(0, 0, S, S);
  const out = $('cut'), octx = out.getContext('2d');
  octx.clearRect(0, 0, S, S);
  Object.assign(octx, { shadowColor: 'rgba(30,20,10,.28)', shadowBlur: 10, shadowOffsetY: 4 });
  octx.drawImage(sil, 0, 0);
  Object.assign(octx, { shadowColor: 'transparent', shadowBlur: 0, shadowOffsetY: 0 });
  octx.drawImage(art, 0, 0);
  return out.toDataURL('image/png');
}
function clearMade() {
  $('cut').getContext('2d').clearRect(0, 0, 256, 256);
  $('madeMsg').textContent = 'Your sticker shows up here, and in the dock.';
  $('madeUse').setAttribute('aria-disabled', 'true'); $('madeUse').removeAttribute('href');
  $('madeClear').disabled = true;
  $('made').classList.remove('has');
}
async function make(file) {
  if (!file) return;
  $('makeErr').textContent = '';
  try {
    const url = await dieCut(file);
    const k = state.active;
    custom[k] = url;
    paintDock(k); renderSlots(); renderCommands(); markPacks();
    $('madeMsg').innerHTML = `In the dock now, as <b>${label(k)}</b>.`;
    $('madeUse').href = url; $('madeUse').setAttribute('aria-disabled', 'false');
    $('madeClear').disabled = false;
    $('made').classList.add('has');
    if (!reduced) gsap.fromTo('#cut', { scale: 0.6, rotation: -14 }, { scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(2.2)' });
  } catch (err) { $('makeErr').textContent = err.message; }
}
$('file').addEventListener('change', (e) => { make(e.target.files[0]); e.target.value = ''; });
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); make(e.dataTransfer.files[0]); });
document.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) { e.preventDefault(); make(f); }
});
$('madeClear').addEventListener('click', () => {
  for (const k in custom) { delete custom[k]; paintDock(k); }
  clearMade(); renderSlots(); renderCommands(); markPacks();
});

for (const [k] of SLOTS) paintDock(k);
renderSlots(); renderCommands(); markPacks(); applyFilter();
initUI();
