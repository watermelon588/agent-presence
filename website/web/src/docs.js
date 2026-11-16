

import { initUI, lenis } from './lib/ui.js';
import { FIGS } from './room-figs.js';

/* Annotated screenshots: <figure class="shot" data-shot="overview">. Each note is a numbered pin on the part it
   explains, with a small label and an arrow when the figure is wide enough, or a numbered list under it when not. */
const SVGNS = 'http://www.w3.org/2000/svg';
const anchor = ([, x, y, w, h], a = 'c') => ({ c: [x + w / 2, y + h / 2], l: [x, y + h / 2], r: [x + w, y + h / 2], t: [x + w / 2, y], b: [x + w / 2, y + h] })[a];
document.querySelectorAll('figure.shot').forEach((fig) => {
  const f = FIGS[fig.dataset.shot];
  if (!f) return;
  const notes = f.notes.map((n) => { const r = f.rects.find((x) => x && x[0] === n.sel); if (!r) { console.warn('no rect for', n.sel); return null; } const [ax, ay] = anchor(r, n.at); return { ...n, p: [ax + (n.ox || 0), ay + (n.oy || 0)] }; }).filter(Boolean);
  // pad: room around a small screenshot for the labels, as [x, y] in screenshot pixels
  const [px, py] = f.pad || [0, 0], W0 = f.w + 2 * px, H0 = f.h + 2 * py;
  const imgStyle = f.pad ? ` style="position:absolute;left:${px / W0 * 100}%;top:${py / H0 * 100}%;width:${f.w / W0 * 100}%"` : '';
  fig.innerHTML = `<div class="shot-stage${f.pad ? ' padded' : ''}"${f.pad ? ` style="aspect-ratio:${W0}/${H0}"` : ''}>
      <img src="${f.src}" width="${f.w}" height="${f.h}" alt="${f.alt}" loading="lazy" decoding="async"${imgStyle}>
      <div class="shot-ink"><svg class="shot-arrows" aria-hidden="true"><defs><marker id="ah-${fig.dataset.shot}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 9 5 0 9z"/></marker></defs></svg>
      ${notes.map((n, i) => `<span class="pin" aria-hidden="true">${i + 1}</span><span class="tag"><b>${i + 1}</b>${n.text}</span>`).join('')}</div>
    </div>
    <ol class="shot-legend">${notes.map((n) => `<li>${n.text}</li>`).join('')}</ol>
    ${f.caption ? `<figcaption>${f.caption}</figcaption>` : ''}`;
  const stage = fig.querySelector('.shot-stage'), ink = stage.querySelector('.shot-ink'), svg = stage.querySelector('svg'), pins = stage.querySelectorAll('.pin'), tags = stage.querySelectorAll('.tag');
  const layout = () => {
    // labels are placed on an 880px-wide layer, then scaled with the screenshot, so they shrink with it
    const real = stage.clientWidth, z = Math.min(1, real / 880), W = real / z, H = stage.clientHeight / z, k = W / W0;
    const compact = real < 640;
    fig.classList.toggle('compact', compact);
    Object.assign(ink.style, { width: W + 'px', height: H + 'px', transform: `scale(${z})` });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.querySelectorAll('path.a').forEach((p) => p.remove());
    notes.forEach((n, i) => {
      const tx = (n.p[0] + px) * k, ty = (n.p[1] + py) * k, pin = pins[i], tag = tags[i];
      pin.style.left = tx + 'px'; pin.style.top = ty + 'px';
      if (compact) return;
      const bw = tag.offsetWidth, bh = tag.offsetHeight, d = (n.d ?? 60) * Math.min(1, k * 1.4);
      let x = { r: tx + d, l: tx - d - bw, u: tx - bw / 2 + (n.dx || 0), d: tx - bw / 2 + (n.dx || 0) }[n.dir];
      let y = { r: ty - bh / 2 + (n.dy || 0), l: ty - bh / 2 + (n.dy || 0), u: ty - d - bh, d: ty + d }[n.dir];
      x = Math.max(6, Math.min(x, W - bw - 6)); y = Math.max(6, Math.min(y, H - bh - 6));
      tag.style.left = x + 'px'; tag.style.top = y + 'px';
      // arrow: from the label's nearest edge to just short of the pin, slightly curved
      const sx = n.dir === 'r' ? x : n.dir === 'l' ? x + bw : Math.max(x + 10, Math.min(tx, x + bw - 10));
      const sy = n.dir === 'u' ? y + bh : n.dir === 'd' ? y : Math.max(y + 8, Math.min(ty, y + bh - 8));
      const len = Math.hypot(tx - sx, ty - sy), ex = tx - (tx - sx) / len * 13, ey = ty - (ty - sy) / len * 13;
      const bend = n.dir === 'r' || n.dir === 'l' ? [0, (ty - sy) * 0.5 - 12] : [(tx - sx) * 0.5 + 14, 0];
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('class', 'a');
      p.setAttribute('d', `M${sx} ${sy} Q${(sx + ex) / 2 + bend[0]} ${(sy + ey) / 2 + bend[1]} ${ex} ${ey}`);
      p.setAttribute('marker-end', `url(#ah-${fig.dataset.shot})`);
      svg.appendChild(p);
    });
  };
  new ResizeObserver(layout).observe(stage);
  stage.querySelector('img').addEventListener('load', layout);
});

const STATES = [
  ['thinking', 'ph-dots-three', 'After a prompt or between tools'],
  ['reading', 'ph-eye', 'Read, Grep, Glob, LS'],
  ['writing', 'ph-pencil-simple', 'Edit, Write, MultiEdit, NotebookEdit, apply_patch'],
  ['running', 'ph-terminal', 'Bash, PowerShell, shell commands'],
  ['delegating', 'ph-git-branch', 'Agent, Task, spawn_agent: handing off to a helper'],
  ['browsing', 'ph-globe', 'WebFetch, WebSearch, any MCP tool'],
  ['working', 'ph-lightning', 'Any other tool'],
  ['waiting', 'ph-warning-circle', 'Needs you: a permission prompt or notification', 'alert'],
  ['done', 'ph-check-circle', 'Finished its turn', 'ok'],
  ['gone', 'ph-x', 'Session or helper ended; the sticker leaves'],
];
document.getElementById('states').innerHTML = STATES.map(([s, icon, what, tone]) =>
  `<li${tone ? ` class="${tone}"` : ''}><i class="ph ${icon}" aria-hidden="true"></i><code>${s}</code><span>${what}</span></li>`).join('');

// Sidebar + mobile select built from the h2s, so they never drift from the content.
const sections = [...document.querySelectorAll('#doc section[id]')];
const side = document.getElementById('side');
const jump = document.getElementById('jump');
sections.forEach((s, i) => {
  const title = s.querySelector('h2').textContent;
  side.insertAdjacentHTML('beforeend', `<a href="#${s.id}"><span>${String(i + 1).padStart(2, '0')}</span>${title}</a>`);
  jump.add(new Option(title, s.id));
});

const go = id => {
  const el = document.getElementById(id);
  lenis ? lenis.scrollTo(el, { offset: -88 }) : el.scrollIntoView({ behavior: 'smooth' });
  history.replaceState(null, '', '#' + id);
};
jump.addEventListener('change', () => go(jump.value));

// Scroll-spy: the last section whose top has passed 30% of the viewport.
const links = [...side.querySelectorAll('a')];
let current;
function spy() {
  const line = innerHeight * 0.3;
  let i = 0;
  sections.forEach((s, n) => { if (s.getBoundingClientRect().top <= line) i = n; });
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) i = sections.length - 1;
  if (i === current) return;
  current = i;
  links.forEach((a, n) => a.toggleAttribute('aria-current', n === i));
  jump.value = sections[i].id;
}
addEventListener('scroll', spy, { passive: true });
addEventListener('resize', spy);

initUI();
spy();
