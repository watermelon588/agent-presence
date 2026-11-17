// Shared behaviour for every variant: draggable stickers, copy buttons, scroll reveal,
// and a web replica of the Agent Presence overlay dock that replays the repo's demo.js session.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let top = 100;

  document.querySelectorAll('[data-drag]').forEach((el) => {
    let x = 0, y = 0, sx = 0, sy = 0, lastX = 0, base = 0;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    el.addEventListener('dragstart', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      sx = e.clientX - x; sy = e.clientY - y; lastX = e.clientX;
      base = parseFloat(getComputedStyle(el).rotate) || 0;
      el.style.zIndex = ++top;
      el.style.cursor = 'grabbing';
      el.style.transition = 'scale .2s cubic-bezier(.34,1.56,.64,1), rotate .25s ease-out';
      el.style.scale = reduce ? '' : '1.12';
      el.classList.add('is-grabbed');
    });
    el.addEventListener('pointermove', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      x = e.clientX - sx; y = e.clientY - sy;
      el.style.translate = `${x}px ${y}px`;
      if (!reduce) el.style.rotate = `${base + Math.max(-18, Math.min(18, (e.clientX - lastX) * 1.5))}deg`;
      lastX = e.clientX;
    });
    const drop = (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      el.releasePointerCapture(e.pointerId);
      el.style.cursor = 'grab'; el.style.scale = ''; el.style.rotate = `${base}deg`;
      el.classList.remove('is-grabbed');
    };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
  });

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const label = btn.querySelector('[data-copy-label]');
    const original = label ? label.textContent : '';
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copy); } catch { /* clipboard blocked: still show feedback */ }
      if (label) label.textContent = 'Copied!';
      btn.classList.add('is-copied');
      setTimeout(() => { if (label) label.textContent = original; btn.classList.remove('is-copied'); }, 1600);
    });
  });

  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }), { threshold: 0.15 });
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

  /* ---------- Agent Presence dock replica (mirrors overlay/index.html) ---------- */
  const css = `
  .ap-dock{display:flex;flex-direction:row-reverse;align-items:flex-end;gap:22px;padding-top:64px;min-height:calc(var(--ap-s,88px) + 84px);
    font:650 12px/1.25 var(--ap-font,ui-rounded,"SF Pro Rounded","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif);color:var(--ap-ink,#3b2a2a)}
  .ap-group{display:flex;flex-direction:row-reverse;align-items:flex-end;gap:6px}
  .ap-subs{display:flex;flex-direction:row-reverse;align-items:flex-end;gap:10px;margin-bottom:8px}
  .ap-chibi{position:relative;transform:rotate(var(--tilt,0deg));transition:transform .3s cubic-bezier(.3,1.6,.5,1)}
  .ap-chibi:hover{transform:rotate(0deg) translateY(-6px) scale(1.06)}
  .ap-body{display:flex;flex-direction:column;align-items:center}
  .ap-sticker{width:var(--ap-s,88px);height:var(--ap-s,88px);object-fit:contain;-webkit-user-drag:none;
    filter:hue-rotate(var(--hue,0deg)) drop-shadow(0 2px 0 rgba(0,0,0,.06)) drop-shadow(0 7px 9px rgba(60,30,15,.28))}
  .ap-sub .ap-sticker{width:calc(var(--ap-s,88px)*.62);height:calc(var(--ap-s,88px)*.62)}
  .ap-name{margin-top:-6px;padding:2px 9px;background:var(--ap-paper,#fffdf8);border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.18);font-size:11px;white-space:nowrap;position:relative}
  .ap-sub .ap-name{font-size:10px;padding:1px 6px}
  .ap-bubble{position:absolute;bottom:calc(100% - 4px);left:50%;transform:translateX(-50%);background:var(--ap-paper,#fffdf8);border:2px solid var(--accent,#e8dccf);
    border-radius:14px;padding:4px 10px;white-space:nowrap;box-shadow:0 4px 10px rgba(0,0,0,.16);transition:opacity .2s,border-color .2s;z-index:2}
  .ap-sub .ap-bubble{font-size:10.5px;padding:3px 8px}
  .ap-sub:nth-child(even) .ap-bubble{bottom:calc(100% + 22px)}
  .ap-chibi:not(.ap-sub) .ap-bubble{left:auto;right:-6px;transform:none}
  .ap-group:nth-child(even)>.ap-chibi .ap-bubble{bottom:calc(100% + 24px)}
  .ap-bubble:empty{opacity:0}
  .s-idle .ap-sticker{animation:ap-bob 3.4s ease-in-out infinite;opacity:.82}
  .s-thinking .ap-sticker{animation:ap-sway 2.2s ease-in-out infinite}
  .s-reading .ap-sticker{animation:ap-tilt 1.8s ease-in-out infinite}
  .s-writing .ap-sticker{animation:ap-wiggle .35s ease-in-out infinite}
  .s-running .ap-sticker{animation:ap-hop .7s ease-in-out infinite}
  .s-delegating .ap-sticker,.s-browsing .ap-sticker{animation:ap-pulse 1.2s ease-in-out infinite}
  .s-waiting .ap-sticker{animation:ap-bounce 1s ease-in-out infinite}
  .s-waiting .ap-bubble{font-weight:750}
  .s-done .ap-sticker{animation:ap-pop .5s cubic-bezier(.3,1.6,.5,1)}
  .ap-enter{animation:ap-pop .45s cubic-bezier(.3,1.6,.5,1)}
  .ap-leave{animation:ap-leave .3s ease-in forwards}
  @keyframes ap-bob{50%{transform:translateY(-3px)}}
  @keyframes ap-sway{50%{transform:rotate(4deg)}}
  @keyframes ap-tilt{50%{transform:rotate(-8deg) translateX(-2px)}}
  @keyframes ap-wiggle{25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}
  @keyframes ap-hop{30%{transform:translateY(-10px) scaleY(1.04)}55%{transform:translateY(0) scaleY(.94)}}
  @keyframes ap-pulse{50%{transform:scale(1.07)}}
  @keyframes ap-bounce{0%,100%{transform:translateY(0)}40%,60%{transform:translateY(-14px) rotate(4deg)}}
  @keyframes ap-pop{0%{transform:scale(.6)}60%{transform:scale(1.14)}100%{transform:scale(1)}}
  @keyframes ap-leave{to{transform:scale(.3) translateY(10px);opacity:0}}
  @media (prefers-reduced-motion:reduce){.ap-dock *{animation:none !important;transition:none !important}}`;
  if (document.querySelector('[data-dock]')) document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const ICON = { thinking: '💭', reading: '🔍', writing: '✏️', running: '▶️', delegating: '🧩', browsing: '🌐', working: '⚙️' };
  const ACCENT = { thinking: '#d9d2f5', reading: '#bfe3f5', writing: '#f7c3a1', running: '#bde8c8', delegating: '#f1cdec',
    browsing: '#bfe3f5', working: '#e8dccf', waiting: '#ff8a80', done: '#bde8c8', idle: '#e8dccf' };
  const HUES = [0, 50, 100, -100, -60, -30];
  const hueOf = (s) => HUES[[...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];

  // The session from the repo's demo.js: [agent, subagent type, state, file or detail]
  const STEPS = [
    ['claude', null, 'idle'], ['claude', null, 'thinking'], ['claude', null, 'reading', 'auth.ts'],
    ['codex', null, 'idle'], ['claude', null, 'delegating', 'map the auth code'],
    ['claude', 'Explore', 'thinking'], ['claude', 'Explore', 'reading', 'session'],
    ['codex', null, 'writing', 'routes.py'], ['claude', 'test-writer', 'thinking'],
    ['claude', 'test-writer', 'writing', 'auth.test.ts'], ['claude', null, 'writing', 'auth.ts'],
    ['codex', null, 'running', 'pytest -q'], ['claude', 'Explore', 'gone'],
    ['claude', 'test-writer', 'running', 'npm test'], ['claude', null, 'waiting'],
    ['codex', null, 'done'], ['claude', 'test-writer', 'gone'],
    ['claude', null, 'writing', 'session.ts'], ['claude', null, 'done'],
  ];

  function Dock(root) {
    const d = root.dataset;
    const avatars = { claude: d.claude || 'assets/avatars/claude.svg', codex: d.codex || 'assets/avatars/codex.svg', subagent: d.sub || 'assets/avatars/subagent.svg' };
    const names = { claude: d.claudeName || 'Claude', codex: d.codexName || 'Codex' };
    const project = d.project || 'my-app';
    const agents = new Map();
    const steps = d.only ? STEPS.filter((st) => st[0] === d.only) : STEPS;
    root.classList.add('ap-dock');

    const make = (isSub) => {
      const el = document.createElement('div');
      el.className = 'ap-chibi' + (isSub ? ' ap-sub' : '');
      el.style.setProperty('--tilt', (Math.random() * 10 - 5).toFixed(1) + 'deg');
      el.innerHTML = '<div class="ap-body ap-enter"><div class="ap-bubble"></div><img class="ap-sticker" alt=""><div class="ap-name"></div></div>';
      return el;
    };
    const paint = (a) => {
      const img = a.el.querySelector('.ap-sticker');
      if (!a.sub) { img.src = avatars[a.agent]; img.alt = names[a.agent] + ' sticker'; return; }
      img.src = avatars[a.sub] || avatars.subagent; img.alt = a.sub + ' subagent sticker';
      // Only the default Pip is hue-shifted per subagent type; custom stickers keep their colours.
      img.style.setProperty('--hue', avatars[a.sub] || !avatars.subagent.endsWith('avatars/subagent.svg') ? '0deg' : hueOf(a.sub) + 'deg');
    };
    const setState = (a, state, what) => {
      a.el.className = a.el.className.replace(/\s*s-\w+/g, '') + ' s-' + state;
      a.el.style.setProperty('--accent', ACCENT[state] || ACCENT.working);
      a.el.querySelector('.ap-bubble').textContent = state === 'idle' ? '' : state === 'done' ? '✓ done'
        : state === 'waiting' ? '❗ needs you' : state === 'thinking' ? '💭 thinking' : (ICON[state] || '⚙️') + ' ' + (what || state);
    };
    const remove = (key) => {
      const a = agents.get(key); if (!a) return;
      for (const k of [...agents.keys()]) if (k.startsWith(key + ':')) agents.delete(k);
      agents.delete(key);
      const node = a.group || a.el;
      a.el.querySelector('.ap-body').className = 'ap-body ap-leave';
      setTimeout(() => node.remove(), 320);
    };
    const upsert = (agent, sub, state, what) => {
      const key = sub ? agent + ':' + sub : agent;
      if (state === 'gone') return remove(key);
      if (sub && !agents.has(agent)) upsert(agent, null, 'delegating');
      let a = agents.get(key);
      if (!a) {
        a = { el: make(!!sub), agent, sub };
        if (sub) agents.get(agent).subs.prepend(a.el);
        else {
          a.group = document.createElement('div'); a.group.className = 'ap-group';
          a.subs = document.createElement('div'); a.subs.className = 'ap-subs';
          a.group.append(a.el, a.subs); root.append(a.group);
        }
        paint(a);
        a.el.querySelector('.ap-name').textContent = sub || names[agent] + ' · ' + project;
        agents.set(key, a);
      }
      setState(a, state, what);
    };

    let i = 0;
    const speed = Number(d.speed) || 1500;
    const tick = () => {
      if (i === steps.length) {
        [...agents.keys()].filter((k) => !k.includes(':')).forEach(remove);
        i = 0; return setTimeout(tick, 1600);
      }
      upsert(...steps[i++]);
      setTimeout(tick, i === steps.length ? 3200 : speed);
    };
    // Reduced motion: show a calm, fully populated snapshot instead of a looping replay.
    if (reduce) { steps.slice(0, 12).forEach((s) => upsert(...s)); } else tick();

    return {
      setAvatar(key, src) { avatars[key] = src; agents.forEach(paint); },
      setName(key, name) { names[key] = name; agents.forEach((a) => { if (!a.sub && a.agent === key) a.el.querySelector('.ap-name').textContent = name + ' · ' + project; }); },
    };
  }
  window.AP = new Map();
  document.querySelectorAll('[data-dock]').forEach((el) => window.AP.set(el.id || el, Dock(el)));
})();
