// Control room screenshots for the docs. Positions come from room-meta.json, written by the capture script
// together with the images (public/docs/room). Each note: sel = the captured element, at = which edge the arrow
// points to (c, l, r, t, b), ox/oy = pin nudge in screenshot px, dir = where the label sits (l, r, u, d), d = distance, dx/dy = nudges.
import META from './room-meta.json';

const K = (k) => `<kbd>${k}</kbd>`;
const fig = (name, extra) => ({ src: `/docs/room/${name}.webp`, ...META[name], ...extra });

export const FIGS = {
  overview: fig('overview', {
    alt: 'The Overview page: four live sessions, totals, a Claude card that needs you with a helper, and the activity log',
    caption: 'Overview, with a demo session: Claude is waiting on a permission prompt while its test-writer helper runs the tests.',
    notes: [
      { sel: 'nav button', at: 'r', dir: 'r', d: 150, text: `Four pages. Press ${K('1')}–${K('4')} to jump between them.` },
      { sel: '.top .vis', at: 'b', dir: 'd', d: 14, dx: 40, text: `Live sessions, and the switch that shows or hides every sticker (${K('Ctrl+Alt+Shift+A')}).` },
      { sel: '.stat.alert', at: 'b', dir: 'd', d: 58, dx: 205, text: 'Totals: helpers, who needs you, tool calls, files.' },
      { sel: '.card.waiting .state', at: 'r', dir: 'r', d: 95, dy: 4, text: 'What it is doing right now. Red when it needs you.' },
      { sel: '.card.waiting .helpers', at: 'r', dir: 'r', d: 95, dy: 40, text: 'Its helpers (subagents) and what each one is on.' },
      { sel: '.card.waiting .ft button', at: 'b', dir: 'd', d: 48, text: 'Change its sticker, or hide this agent.' },
      { sel: '.log', at: 't', dir: 'u', d: 40, dx: 170, text: 'Every hook event, newest first.' },
      { sel: 'nav h3 + h3 + button', at: 'r', dir: 'd', d: 175, dx: -10, text: 'Stickers per agent, helper, helper type or model.' },
    ],
  }),
  display: fig('display', {
    alt: 'The Display page: where to show, my apps, size, when to show, details, motion, status icon, opacity, helper layout and agents',
    notes: [
      { sel: '.row:nth-child(2) .seg', at: 'r', dir: 'u', d: 35, dx: 106, text: 'Everywhere, or only while your editor or terminal is in front.' },
      { sel: '.row.apps .front', at: 'l', dir: 'l', d: 14, dy: 12, text: 'The app in front right now, and whether the stickers show.' },
      { sel: '.row.apps .chips', at: 'l', dir: 'l', d: 14, dy: 80, text: 'Highlighted apps count as yours. Dashed ones were in front lately: click to add.' },
      { sel: '.row:nth-child(7) .seg', at: 'r', dir: 'd', d: 31, dx: 110, text: 'Most settings have a global shortcut, shown next to them.' },
      { sel: '.panel:nth-of-type(2) .row:nth-child(2) .seg', at: 't', dir: 'u', d: 12, dx: 130, text: 'How a helper shows its agent: a line, a dashed pod, or nothing.' },
      { sel: '.panel:nth-of-type(3) .chips', at: 't', dir: 'u', d: 8, dx: 110, text: 'Turn each agent on or off.' },
    ],
  }),
  bubbles: fig('bubbles', {
    alt: 'The Bubbles page: a live preview on a dark and a light desktop, and every speech-bubble setting',
    notes: [
      { sel: '.desk.dark .bub', at: 'l', dir: 'd', d: 40, dx: -110, text: 'Live preview on a dark and a light desktop.' },
      { sel: '.row:nth-child(1) .sw', at: 'r', dir: 'r', d: 240, text: `Every bubble on or off (${K('Ctrl+Alt+Shift+B')}).` },
      { sel: '.row:nth-child(2) .seg', at: 'r', dir: 'r', d: 150, text: 'A card, or just text with a soft shadow.' },
      { sel: '.row:nth-child(3) .sw', at: 'r', dir: 'r', d: 240, dy: -8, text: 'A thin outline around the card, or none.' },
      { sel: '.row:nth-child(4) .seg', at: 'r', dir: 'r', d: 150, dy: -30, text: 'Auto: white text in dark mode, black in light.' },
      { sel: '.swatches', at: 'r', dir: 'r', d: 60, text: 'Text color: auto, a swatch, or any color.' },
      { sel: '.row:nth-child(7) .sw', at: 'r', dir: 'r', d: 240, text: 'Pop the bubble open when an agent needs you.' },
      { sel: '.row:nth-child(8) .sw', at: 'r', dir: 'r', d: 240, text: 'Tool calls, files touched and time on task.' },
    ],
  }),
  shortcuts: fig('shortcuts', {
    alt: 'The Shortcuts page: a switch for global shortcuts, every shortcut with its status, and the keys inside the window',
    notes: [
      { sel: '.panel .sw', at: 'r', dir: 'r', d: 150, text: `Turn global shortcuts off if they clash. ${K('A')} always works.` },
      { sel: '.keys .key:nth-child(1) .combo', at: 'l', ox: -12, dir: 'u', d: 6, dx: 162, text: `${K('Ctrl')} ${K('Alt')} ${K('Shift')} (${K('⌘')} ${K('⌥')} ${K('⇧')} on macOS) plus a letter.` },
      { sel: '.keys .key:nth-child(1) .ok', at: 'r', ox: 10, dir: 'u', d: 6, text: '“ready”, “off”, or “used by another app”.' },
      { sel: '.panel:last-of-type', at: 't', dir: 'u', d: 6, dx: 200, text: 'Keys inside this window.' },
    ],
  }),
  stickers: fig('stickers', {
    alt: "Claude's sticker page: a whole pack and one picked sticker, buttons to add your own, and the free packs",
    notes: [
      { sel: '.chosen .pick.pack', at: 't', dir: 'u', d: 10, dx: 260, text: 'A whole pack. Images added to it later are picked up.' },
      { sel: '.chosen .pick:not(.pack)', at: 'r', dir: 'r', d: 40, text: 'Single stickers. With several, each session gets its own.' },
      { sel: '.actions .btn', at: 'l', dir: 'l', d: 12, text: 'Use your own images. Nothing is copied.' },
      { sel: 'h2 .use', at: 'r', dir: 'r', d: 30, dy: -6, text: 'Use a whole pack in one click.' },
      { sel: '.tile[aria-pressed="true"]', at: 'b', dir: 'd', d: 18, text: 'Picked ones are numbered.' },
      { sel: 'nav button[aria-current="true"] .count', at: 'r', dir: 'd', d: 20, dx: 60, text: 'How many stickers this target has.' },
    ],
  }),
  bubble: fig('bubble', {
    pad: [250, 34],
    alt: 'A pinned speech bubble over a Claude sticker with two helpers joined to it by a line',
    notes: [
      { sel: '.group > .chibi .who', at: 'l', ox: -11, dir: 'l', d: 34, dy: -8, text: 'Agent name.' },
      { sel: '.group > .chibi .meta', at: 'r', ox: 8, dir: 'r', d: 36, dy: -12, text: 'Model · folder.' },
      { sel: '.group > .chibi .verb', at: 'l', ox: -24, dir: 'l', d: 34, dy: 10, text: 'What it is doing, with a status dot.' },
      { sel: '.group > .chibi .obj', at: 'r', ox: 12, dir: 'r', d: 120, dy: 20, text: 'The file or command it is on.' },
      { sel: '.group > .chibi .files', at: 'l', ox: -11, dir: 'l', d: 34, dy: 30, text: 'Recent files. Click one to show it in its folder.' },
      { sel: '.group > .chibi .stats', at: 'r', ox: 8, dir: 'r', d: 36, dy: 18, text: 'Tool calls · files touched · time on task.' },
      { sel: '.subs', at: 'l', dir: 'l', d: 34, dy: 10, text: "Helpers, joined by a line in the agent's color." },
      { sel: '.group > .chibi .sticker', at: 'r', dir: 'r', d: 34, dy: 30, text: 'Click to pin the bubble open (outlined). Drag to move.' },
    ],
  }),
};
