// Web replica of the Agent Peeps overlay (mirrors agent-presence/overlay/index.html):
// small stickers bottom-right, a line icon for the state, outlined text with no boxes,
// helpers in a dashed pod tinted with the parent's color. Hover a sticker for who / what / files.
import { AGENTS, agentDisc, helperDisc, iconSvg, VERB } from './stickers.js';

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// [agent, helper type, state, file or command]
const STEPS = [
  ['claude', null, 'thinking'], ['claude', null, 'reading', 'src/auth.ts'],
  ['codex', null, 'thinking'], ['claude', null, 'delegating', 'map the auth code'],
  ['claude', 'Explore', 'reading', 'src/session.ts'], ['codex', null, 'writing', 'api/routes.py'],
  ['copilot', null, 'reading', 'README.md'], ['claude', 'test-writer', 'writing', 'auth.test.ts'],
  ['claude', null, 'writing', 'src/auth.ts'], ['codex', null, 'running', 'pytest -q'],
  ['claude', 'Explore', 'gone'], ['copilot', null, 'writing', 'docs/setup.md'],
  ['claude', 'test-writer', 'running', 'npm test'], ['claude', null, 'waiting'],
  ['codex', null, 'done'], ['claude', 'test-writer', 'gone'], ['copilot', null, 'done'],
  ['claude', null, 'writing', 'src/session.ts'], ['claude', null, 'done'],
];

export function createDock(root) {
  const d = root.dataset;
  const avatars = {}; // key -> url or [urls]; key = agent, "<agent>-subagent" or "subagent"
  const names = {};
  const project = d.project || 'my-app';
  const agents = new Map();
  const only = d.only ? d.only.split(',') : null;
  const steps = only ? STEPS.filter((s) => only.includes(s[0])) : STEPS;
  root.classList.add('ap-dock');

  const nameOf = (agent) => names[agent] || AGENTS[agent].name;
  const pickOf = (v, id) => (Array.isArray(v) ? v[hash(id) % v.length] : v);
  const srcOf = (a) => a.sub
    ? pickOf(avatars[a.agent + '-subagent'] || avatars.subagent, a.key) || helperDisc(a.agent, a.sub)
    : pickOf(avatars[a.agent], a.key) || agentDisc(a.agent);

  const make = (a) => {
    const el = document.createElement('div');
    el.className = 'ap-chibi' + (a.sub ? ' ap-sub' : '');
    el.tabIndex = 0;
    el.innerHTML = `<div class="ap-info ap-say"><div class="ap-who"></div><div class="ap-what"></div><div class="ap-files"></div></div>
      <div class="ap-pic"><img class="ap-sticker" alt="">${a.sub ? `<b class="ap-badge">${AGENTS[a.agent].letter}</b>` : ''}<span class="ap-icon"></span></div>
      <div class="ap-line ap-say"></div>`;
    return el;
  };
  const paint = (a) => {
    const img = a.el.querySelector('.ap-sticker');
    img.src = srcOf(a);
    img.alt = a.sub ? `${a.sub}, a helper for ${nameOf(a.agent)}` : `${nameOf(a.agent)} sticker`;
  };
  const setState = (a, state, what) => {
    a.el.className = a.el.className.replace(/\s*s-\w+/g, '') + ' s-' + state;
    a.state = state; a.what = what;
    if (what && !a.files.includes(what) && /[./]/.test(what)) a.files = [what, ...a.files].slice(0, 3);
    const text = state === 'idle' || state === 'thinking' || state === 'waiting' || state === 'done' ? VERB[state] : `${VERB[state]} ${what || ''}`.trim();
    a.el.querySelector('.ap-icon').innerHTML = iconSvg(state);
    a.el.querySelector('.ap-line').textContent = text.replace(/^(\w+) (?:src|api|docs)\//, '$1 ');
    a.el.querySelector('.ap-who').textContent = a.sub ? `${a.sub} · helping ${nameOf(a.agent)}` : `${nameOf(a.agent)} · ${project}`;
    a.el.querySelector('.ap-what').textContent = text;
    a.el.querySelector('.ap-files').innerHTML = a.files.map((f) => `<span>› ${f}</span>`).join('');
  };
  const remove = (key) => {
    const a = agents.get(key); if (!a) return;
    for (const k of [...agents.keys()]) if (k.startsWith(key + ':')) agents.delete(k);
    agents.delete(key);
    a.el.classList.add('ap-leave');
    setTimeout(() => (a.group || a.el).remove(), 260);
  };
  const upsert = (agent, sub, state, what) => {
    const key = sub ? agent + ':' + sub : agent;
    if (state === 'gone') return remove(key);
    if (sub && !agents.has(agent)) upsert(agent, null, 'delegating');
    let a = agents.get(key);
    if (!a) {
      a = { agent, sub, key, files: [] };
      a.el = make(a);
      if (sub) agents.get(agent).subs.prepend(a.el);
      else {
        a.group = document.createElement('div'); a.group.className = 'ap-group';
        a.group.style.setProperty('--agent', AGENTS[agent].color);
        a.subs = document.createElement('div'); a.subs.className = 'ap-subs';
        a.group.append(a.el, a.subs); root.append(a.group);
      }
      paint(a);
      agents.set(key, a);
    }
    setState(a, state, what);
  };

  let i = 0, timer;
  const speed = Number(d.speed) || 1500;
  const tick = () => {
    if (i === steps.length) {
      [...agents.keys()].filter((k) => !k.includes(':')).forEach(remove);
      i = 0; timer = setTimeout(tick, 1400); return;
    }
    upsert(...steps[i++]);
    timer = setTimeout(tick, i === steps.length ? 3200 : speed);
  };
  // Reduced motion: a calm, fully populated snapshot instead of a looping replay.
  if (reduce()) steps.slice(0, 10).forEach((s) => upsert(...s));
  else {
    // only play while on screen
    new IntersectionObserver(([e]) => { clearTimeout(timer); if (e.isIntersecting) tick(); }).observe(root);
  }

  return {
    setAvatar(key, src) { if (src && (!Array.isArray(src) || src.length)) avatars[key] = src; else delete avatars[key]; agents.forEach(paint); },
    setName(key, name) { if (name) names[key] = name; else delete names[key]; agents.forEach((a) => a.agent === key && setState(a, a.state, a.what)); },
  };
}
