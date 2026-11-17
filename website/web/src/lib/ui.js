// Shared page behaviour: theme toggle, smooth scroll, blur-in text, scroll reveal,
// draggable stickers, copy buttons, magnetic buttons, nav state.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { wireSupport } from './support.js';

gsap.registerPlugin(ScrollTrigger);
export { gsap, ScrollTrigger };
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
export let lenis = null;

export function initUI() {
  theme();
  smooth();
  nav();
  document.querySelectorAll('[data-drag]').forEach(draggable);
  document.querySelectorAll('[data-copy]').forEach(copyButton);
  if (fine && !reduced) document.querySelectorAll('[data-magnetic]').forEach(magnetic);
  wireSupport();
  text();
  reveal();
  if (!reduced) {
    // footer wordmark rises letter by letter
    gsap.from('#wordmark .word span', {
      yPercent: 70, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.05,
      scrollTrigger: { trigger: '#wordmark', start: 'top 95%', once: true },
    });
  }
}

/* ---------- theme: light / dark, remembered, with a circular reveal ---------- */
function theme() {
  const root = document.documentElement;
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem('ap-theme', next); } catch { /* storage blocked: theme still switches */ }
    };
    if (!document.startViewTransition || reduced) return apply();
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' },
    ));
  }));
}

/* ---------- smooth scroll (Lenis driven by GSAP's ticker so ScrollTrigger stays in sync) ---------- */
function smooth() {
  if (reduced) return;
  lenis = new Lenis({ lerp: 0.11, anchors: { offset: -72 } });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

function nav() {
  const bar = document.querySelector('[data-nav]');
  if (!bar) return;
  ScrollTrigger.create({ start: 8, end: 'max', onToggle: (s) => bar.classList.toggle('is-scrolled', s.isActive) });
}

/* ---------- text: words blur in ---------- */
function splitWords(el) {
  const out = [];
  [...el.childNodes].forEach((n) => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.append(part);
        const w = document.createElement('span');
        w.className = 'w'; w.textContent = part;
        frag.append(w); out.push(w);
      });
      n.replaceWith(frag);
    } else if (n.nodeType === 1 && n.tagName !== 'BR') {
      if (n.matches('img, svg, .keep')) out.push(n);
      else out.push(...splitWords(n));
    }
  });
  return out;
}

function text() {
  document.querySelectorAll('[data-split]').forEach((el) => {
    const words = splitWords(el);
    gsap.set(el, { visibility: 'visible' });
    if (reduced) return;
    const hero = el.closest('[data-hero]');
    gsap.from(words, {
      opacity: 0, filter: 'blur(14px)', yPercent: 45, duration: 1.15, ease: 'expo.out', stagger: 0.055,
      delay: hero ? 0.15 : 0, clearProps: 'filter',
      scrollTrigger: hero ? undefined : { trigger: el, start: 'top 88%', once: true },
    });
  });
}

function reveal() {
  const els = gsap.utils.toArray('[data-reveal]');
  if (reduced) return gsap.set(els, { opacity: 1 });
  ScrollTrigger.batch(els, {
    start: 'top 90%', once: true,
    onEnter: (batch) => gsap.fromTo(batch, { opacity: 0, y: 36, filter: 'blur(8px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'expo.out', stagger: 0.08, clearProps: 'filter,transform' }),
  });
}

/* ---------- draggable stickers (uses the CSS translate/rotate/scale props, so GSAP transforms stay free) ---------- */
let topZ = 100;
export function draggable(el) {
  let x = 0, y = 0, sx = 0, sy = 0, lastX = 0, base = 0;
  el.style.touchAction = 'none';
  el.addEventListener('dragstart', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    sx = e.clientX - x; sy = e.clientY - y; lastX = e.clientX;
    base = parseFloat(getComputedStyle(el).rotate) || 0;
    el.style.zIndex = ++topZ;
    el.style.transition = 'scale .2s cubic-bezier(.34,1.56,.64,1), rotate .25s ease-out';
    if (!reduced) el.style.scale = '1.12';
    el.classList.add('is-grabbed');
  });
  el.addEventListener('pointermove', (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    x = e.clientX - sx; y = e.clientY - sy;
    el.style.translate = `${x}px ${y}px`;
    if (!reduced) el.style.rotate = `${base + Math.max(-18, Math.min(18, (e.clientX - lastX) * 1.5))}deg`;
    lastX = e.clientX;
  });
  const drop = (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    el.style.scale = ''; el.style.rotate = `${base}deg`;
    el.classList.remove('is-grabbed');
  };
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
}

// .install pills are built here from data-copy: a terminal-style pill whose Copy key morphs into a check,
// with a "Paste it in your terminal" tip above it. Other [data-copy] buttons just swap their [data-copy-label].
export function copyButton(btn) {
  if (btn.classList.contains('install') && !btn.children.length) {
    if (!btn.hasAttribute('aria-label')) btn.setAttribute('aria-label', `Copy command: ${btn.dataset.copy}`);
    btn.innerHTML = '<span class="i-prompt" aria-hidden="true">$</span><span class="i-cmd"></span>'
      + '<span class="i-key" aria-hidden="true"><span class="i-idle"><i class="ph-bold ph-copy"></i>Copy</span><span class="i-done"><i class="ph-bold ph-check"></i>Copied</span></span>'
      + '<span class="i-tip" role="status"></span>';
    btn.querySelector('.i-cmd').textContent = btn.dataset.copy;
  }
  const label = btn.querySelector('[data-copy-label]');
  const tip = btn.querySelector('.i-tip');
  const original = label?.textContent;
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copy); } catch { /* clipboard blocked: still show feedback */ }
    if (label) label.textContent = 'Copied!';
    if (tip) tip.textContent = 'Copied! Paste it in your terminal';
    btn.classList.add('is-copied');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      if (label) label.textContent = original;
      btn.classList.remove('is-copied');
      if (tip) setTimeout(() => { if (!btn.classList.contains('is-copied')) tip.textContent = ''; }, 300);
    }, 1800);
  });
}

function magnetic(el) {
  const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'elastic.out(1, 0.4)' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'elastic.out(1, 0.4)' });
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    xTo((e.clientX - r.left - r.width / 2) * 0.25);
    yTo((e.clientY - r.top - r.height / 2) * 0.35);
  });
  el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
}
