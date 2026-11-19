
import { initUI, gsap, ScrollTrigger, reduced } from './lib/ui.js';
import { createDock } from './lib/dock.js';
import { stickers, fanStickers, packs, packById, byId, pick, shuffle, AGENTS, iconSvg } from './lib/stickers.js';

const $ = (s) => document.querySelector(s);

/* ---------- line icons wherever a sticker shows its state ---------- */
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = iconSvg(el.dataset.icon); });
const S = (id) => byId.get(id)?.url;
// one sticker per agent, used wherever the page shows 'your agents'
const FACE = { claude: S('claude/claude-coding'), codex: S('pixel-food/pixel-cat-glasses'), copilot: S('plush-blobs/plush-blue-alarmed'), antigravity: S('gradient-icons/gradient-flame') };
$('[data-discs]').innerHTML = Object.values(FACE).map((u) => `<img src="${u}" alt="">`).join('');

/* ---------- see it in action: three clips, autoplay muted while on screen ---------- */
const clip = $('#clip'), tabs = [...document.querySelectorAll('.vtab')], sound = $('#sound');
let current = 0, onScreen = false;
const bar = () => tabs[current].querySelector('.bar i');
function choose(i, play = true) {
  current = i;
  tabs.forEach((t, j) => t.setAttribute('aria-selected', j === i));
  clip.poster = tabs[i].dataset.poster;
  clip.src = tabs[i].dataset.src;
  bar().style.transform = 'scaleX(0)';
  if (play && onScreen && !reduced) clip.play().catch(() => {});
}
tabs.forEach((t, i) => t.addEventListener('click', () => choose(i)));
clip.addEventListener('timeupdate', () => { if (clip.duration) bar().style.transform = `scaleX(${clip.currentTime / clip.duration})`; });
clip.addEventListener('ended', () => choose((current + 1) % tabs.length));
sound.addEventListener('click', () => {
  clip.muted = !clip.muted;
  sound.setAttribute('aria-pressed', !clip.muted);
  sound.innerHTML = clip.muted ? '<i class="ph-bold ph-speaker-slash"></i><span>Sound off</span>' : '<i class="ph-bold ph-speaker-high"></i><span>Sound on</span>';
  if (!clip.muted && clip.paused) clip.play().catch(() => {});
});
if (reduced) clip.controls = true; // no autoplay: the visitor presses play
else new IntersectionObserver(([e]) => {
  onScreen = e.isIntersecting;
  if (onScreen) clip.play().catch(() => {}); else clip.pause();
}, { threshold: 0.45 }).observe(clip);

/* ---------- Without / With toggle around the live dock ---------- */
const demoDock = createDock($('[data-dock]'));
Object.entries(FACE).forEach(([k, u]) => demoDock.setAvatar(k, u));
demoDock.setAvatar('subagent', pick(['pixel-food/pixel-astronaut', 'color-blobs/blob-blue-triangle', 'flame-expressions/flame-friendly']).map((s) => s.url));
const demo = $('#demo');
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  demo.classList.toggle('on', b.dataset.mode === 'on');
}));

/* ---------- bento: every state ---------- */
const STATES = [
  [S('claude/claude-thinking'), 'thinking', 'thinking'], [S('color-blobs/blob-blue-triangle'), 'reading', 'reading api.py'],
  [S('pixel-food/pixel-watermelon'), 'writing', 'writing setup.md'], [S('plush-blobs/plush-pink-smile'), 'running', 'running npm test'],
  [S('monster-icons/monster-purple-octopus'), 'delegating', 'handing off'], [S('pixel-food/pixel-astronaut'), 'browsing', 'browsing docs'],
  [S('gradient-icons/gradient-chef'), 'working', 'working'], [S('plush-blobs/plush-yellow-frustrated'), 'waiting', 'needs you'],
  [S('color-blobs/blob-green-capsule'), 'done', 'done'],
];
$('[data-states]').innerHTML = STATES.map(([src, st, label]) => `<div class="state s-${st}">
  <div class="pic"><img class="ap-sticker" src="${src}" alt=""><span class="ico">${iconSvg(st)}</span></div><span class="say">${label}</span></div>`).join('');

/* ---------- bento: works where you work ---------- */
$('[data-agent-cards]').innerHTML = Object.entries(AGENTS).map(([k, a]) => `
  <div class="flex flex-col items-center gap-2 rounded-2xl border border-line bg-soft px-2 py-4 text-center">
    <span class="relative block"><img class="size-12 object-contain" src="${FACE[k]}" alt=""><b class="ap-badge" style="--agent:${a.color}">${a.letter}</b></span><b class="text-[13.5px] font-semibold leading-tight">${a.app}</b></div>`).join('');

/* ---------- bento: a working control room ---------- */
const room = { size: 50, show: 'working', details: 'hover', agents: { claude: true, codex: true, copilot: true, antigravity: true } };
const ROOM_STATE = { claude: ['writing', 'writing auth.ts'], codex: ['running', 'running pytest'], copilot: ['waiting', 'needs you'], antigravity: ['reading', 'reading plan.md'] };
const preview = $('[data-room-preview]');
$('[data-agents]').innerHTML = Object.entries(AGENTS).map(([k, a]) =>
  `<button class="fchip !h-8 !px-3 !text-[12.5px]" data-agent="${k}" aria-pressed="true">${a.name}</button>`).join('');
function renderRoom() {
  const list = Object.keys(AGENTS).filter((k) => room.agents[k] && (room.show === 'working' || ROOM_STATE[k][0] === 'waiting'));
  preview.innerHTML = list.map((k) => `<div class="state s-${ROOM_STATE[k][0]}">
    <div class="pic" style="width:${room.size}px;height:${room.size}px"><img class="ap-sticker" src="${FACE[k]}" alt="${AGENTS[k].name}"><span class="ico">${iconSvg(ROOM_STATE[k][0])}</span></div>
    ${room.details === 'always' ? `<span class="say !text-[11px]">${ROOM_STATE[k][1]}</span>` : ''}</div>`).join('')
    || '<span class="self-center text-[13px] text-muted">Nothing needs you right now.</span>';
}
$('[data-room]').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.agent) { room.agents[b.dataset.agent] = !room.agents[b.dataset.agent]; b.setAttribute('aria-pressed', room.agents[b.dataset.agent]); }
  else {
    const set = b.parentElement.dataset.set;
    b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    room[set] = set === 'size' ? Number(b.dataset.v) : b.dataset.v;
  }
  renderRoom();
  if (!reduced) gsap.from(preview.querySelectorAll('.pic'), { scale: 0.9, opacity: 0, duration: 0.35, ease: 'back.out(2)', stagger: 0.04 });
});
renderRoom();

/* ---------- packs marquee ---------- */
const cards = packs.filter((p) => p.items.length >= 5).map((p) => `
  <a class="pack" href="stickers.html#${p.id}">
    <div class="pack-grid">${p.items.filter((s) => !s.animated).slice(0, 6).map((s) => `<img src="${s.url}" alt="" loading="lazy">`).join('')}</div>
    <b class="mt-3.5 block font-display text-[17px] font-bold">${p.label}</b>
    <small class="text-[13px] text-muted">${p.items.length} stickers${p.items.some((s) => s.animated) ? `, ${p.items.filter((s) => s.animated).length} animated` : ''}</small>
    <code>set claude ${p.id}</code>
  </a>`).join('');
$('#track').innerHTML = cards + cards.replaceAll('class="pack"', 'class="pack" aria-hidden="true" tabindex="-1"');
$('[data-count]').textContent = stickers.length;

/* ---------- gacha: spin for a pack ----------
   The dome holds one sticker per pack, every vibe at once (always a goth, a zombie and a capybara).
   Own packs are Common, fan packs Rare, and the starred silver-blue goth sticker is the Legendary:
   1 in 20, and a sure thing by spin 20. The dome refills after every pull. */
const everyone = [...stickers, ...fanStickers];
const STAR_FACE = byId.get('goth/silver-blue-hair'), STAR = byId.get('goth/silver-blue-hair-animated') || STAR_FACE;
const ODDS = 20;
const pool = everyone.filter((s) => !s.id.startsWith('goth/silver-blue-hair'));
const stills = pool.filter((s) => !s.animated);
const oneOf = (test) => { const l = stills.filter(test); return l[Math.floor(Math.random() * l.length)]; };
const dome = $('#dome');
function fillDome() {
  const fixed = [oneOf((s) => s.pack === 'capybaras'), oneOf((s) => s.pack === 'plants-vs-zombies' && /zomb/.test(s.id))];
  const taken = new Set(['goth', 'capybaras', 'plants-vs-zombies']), rest = [];
  for (const s of shuffle(stills)) if (rest.length < 6 && !taken.has(s.pack)) { taken.add(s.pack); rest.push(s); }
  const balls = shuffle([...fixed, ...rest]);
  balls.splice(1 + Math.floor(Math.random() * 7), 0, STAR_FACE); // never in the first slot, so it moves around
  dome.innerHTML = balls.map((s, i) => `<span class="ball${s === STAR_FACE ? ' star' : ''}" style="--l:${8 + (i % 3) * 28}%;--t:${10 + Math.floor(i / 3) * 27}%;--r:${(i * 37) % 50 - 25}deg"><img src="${s.url}" alt=""></span>`).join('');
}
fillDome();

const prize = $('#prize'), prizeName = $('#prizeName'), prizeCfg = $('#prizeCfg'), knob = $('#knob'), customize = $('#customize'), odds = $('#odds');
const rarity = (s) => (s === STAR ? ['legendary', '★ Legendary'] : packById.get(s.pack).fan ? ['rare', 'Rare'] : ['common', 'Common']);
let last = null, spins = 0, dry = 0;
function burst() {
  const box = prize.parentElement;
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('i');
    p.className = 'spark'; p.textContent = i % 3 ? '★' : '✦';
    box.appendChild(p);
    const ang = Math.random() * Math.PI * 2, d = 90 + Math.random() * 140;
    gsap.fromTo(p, { x: 0, y: 0, scale: 0.4, opacity: 1, rotation: 0 },
      { x: Math.cos(ang) * d, y: Math.sin(ang) * d - 60, scale: 1 + Math.random(), rotation: gsap.utils.random(-180, 180), opacity: 0,
        duration: 1.1 + Math.random() * 0.6, delay: 0.35, ease: 'power3.out', onComplete: () => p.remove() });
  }
}
function spin() {
  spins += 1; dry += 1;
  let s;
  if (dry >= ODDS || Math.random() < 1 / ODDS) s = STAR;
  else do { s = pool[Math.floor(Math.random() * pool.length)]; } while (s === last && pool.length > 1);
  if (s === STAR) dry = 0;
  last = s;
  const p = packById.get(s.pack), [rk, rl] = rarity(s);
  prize.innerHTML = `<img class="diecut ${rk}" src="${s.url}" alt="${s.name} sticker">${s === STAR ? '<span class="prize-star">★</span>' : ''}`;
  prizeName.innerHTML = `<span class="rar r-${rk}">${rl}</span> ${s === STAR ? 'Jackpot! ' : ''}${s.name.replace(/ \(animated\)$/, '')}, from ${p.label}.`;
  prizeCfg.querySelector('[data-pack]').textContent = p.id;
  prizeCfg.dataset.copy = `agentpeeps set claude ${p.id}`;
  customize.href = `stickers.html?claude=${encodeURIComponent(p.id)}#${p.id}`;
  odds.textContent = s === STAR ? 'You got the ★ sticker. Spin again for the rest.' : `Spin ${spins}. The ★ sticker shows up within ${ODDS - dry} more spins.`;
  if (reduced) { fillDome(); return; }
  gsap.to(knob, { rotation: spins * 360, duration: 0.7, ease: 'back.out(1.6)' });
  gsap.timeline()
    .to(dome.children, { x: 'random(-9,9)', y: 'random(-9,9)', rotation: 'random(-25,25)', duration: 0.07, repeat: 5, yoyo: true, ease: 'none', stagger: 0.01 })
    .to(dome.children, { y: 40, opacity: 0, duration: 0.18, stagger: 0.015, ease: 'power2.in' })
    .add(() => { fillDome(); gsap.fromTo(dome.children, { y: -50, opacity: 0, scale: 0.6 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.03, ease: 'back.out(2.2)' }); });
  gsap.fromTo(prize.firstChild, { scale: 0.6, y: -70, rotation: -40, opacity: 0 },
    { scale: s === STAR ? 1.12 : 1, y: 0, rotation: gsap.utils.random(-12, 12), opacity: 1, duration: s === STAR ? 1 : 0.7, delay: 0.3, ease: s === STAR ? 'elastic.out(1, 0.45)' : 'back.out(2)' });
  if (s === STAR) {
    burst();
    dome.classList.add('jackpot');
    setTimeout(() => dome.classList.remove('jackpot'), 1800);
  }
}
$('#spin').addEventListener('click', spin);
knob.addEventListener('click', spin);

/* ---------- orbit ring ---------- */
const ring = (id, ids) => {
  const list = pick(ids);
  document.getElementById(id).innerHTML = list.map((s, i) => `<img class="lift" src="${s.url}" alt="" style="--a:${(i * 360) / list.length}deg">`).join('');
};
ring('ring1', ['claude/claude-spark', 'color-blobs/blob-blue-triangle', 'plush-blobs/plush-yellow-frustrated', 'color-blobs/blob-orange-cloud',
  'plush-blobs/plush-pink-smile', 'pixel-food/pixel-astronaut', 'gradient-icons/gradient-sleepy-ghost', 'flame-expressions/flame-joy',
  'flame-expressions/flame-friendly', 'color-blobs/blob-green-capsule', 'plush-blobs/plush-blue-alarmed', 'pixel-food/pixel-cat-glasses',
  'gradient-icons/gradient-flame', 'claude/claude-coding']);

initUI();

if (!reduced) {
  // hero stickers pop in, then drift a little with the scroll
  gsap.from('[data-hero] [data-float]', { scale: 0.9, opacity: 0, y: 14, duration: 0.8, ease: 'back.out(1.8)', stagger: 0.07, delay: 0.35 });
  gsap.utils.toArray('[data-hero] [data-float]').forEach((el, i) => gsap.to(el, {
    y: -(30 + (i % 3) * 25), ease: 'none',
    scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 0.6 },
  }));

  // the video frame settles in as it scrolls up
  gsap.fromTo('.screen', { scale: 0.94 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '#see', start: 'top bottom', end: 'top 30%', scrub: 0.5 } });

  // the ring turns on its own and speed up with the scroll
  const spin = gsap.to('#ring1', { rotation: 360, duration: 90, repeat: -1, ease: 'none' });
  ScrollTrigger.create({
    trigger: '#start', start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => {
      const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 250, 8);
      gsap.to(spin, { timeScale: boost, duration: 0.2, overwrite: true, onComplete: () => gsap.to(spin, { timeScale: 1, duration: 1.2 }) });
    },
  });
}

// Live install count under the hero (hidden if npm fails); stars join once there are 20+.
Promise.all([
  fetch('https://api.npmjs.org/downloads/point/last-month/agentpeeps').then((r) => r.json()).then((d) => d.downloads),
  fetch('https://api.github.com/repos/watermelon588/agentpeeps').then((r) => r.json()).then((d) => d.stargazers_count).catch(() => 0),
]).then(([npm, stars]) => {
  if (!Number.isFinite(npm)) return;
  const fmt = new Intl.NumberFormat('en', { notation: 'compact' });
  $('[data-stat="npm"]').textContent = fmt.format(npm);
  if (stars >= 20) { $('[data-stat="stars"]').textContent = fmt.format(stars); $('[data-star]').hidden = false; }
  $('[data-stats]').hidden = false;
}).catch(() => {});

// Site visits (counted once per browser session); shown from 1,000 real visits on.
let counted = false;
try { counted = sessionStorage.getItem('peeps-visit') === '1'; sessionStorage.setItem('peeps-visit', '1'); } catch {}
fetch('/api/visits', { method: counted ? 'GET' : 'POST' }).then((r) => r.ok ? r.json() : null).then((d) => {
  if (!d || !(d.visits >= 1000)) return; // show only once it means something, like the 20+ stars rule
  $('[data-stat="visits"]').textContent = new Intl.NumberFormat('en', { notation: 'compact' }).format(d.visits);
  $('[data-visits]').hidden = false;
}).catch(() => {});
