<p align="center"><img src="logo.png" width="112" alt="Agent Peeps logo"></p>

<h1 align="center">Agent Peeps</h1>

<p align="center"><b>A tiny sticker for every AI coding agent, live on your screen.</b><br>
See which agent is on which file, what it's doing, and when it needs you.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agentpeeps"><img src="https://img.shields.io/badge/npm-agentpeeps-2f4bff" alt="npm: agentpeeps"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-121214" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/local%20only-no%20account%2C%20no%20network-7fd99a" alt="Local only">
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#your-own-stickers">Stickers</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="https://agentpeeps.space">Website</a> ·
  <a href="https://agentpeeps.space/docs.html">Docs</a>
</p>

<p align="center"><img src="docs/readme/demo.gif" width="760" alt="A capybara sticker in the corner of the screen shows Claude writing login.ts while a helper sticker reads the tests"></p>

<p align="center"><code>npx agentpeeps init</code></p>

<div align="center">
<table>
  <tr>
    <td align="center" width="120"><img src="docs/readme/agents/claude.svg" width="36" height="36" alt=""><br><sub><b>Claude Code</b></sub></td>
    <td align="center" width="120"><img src="docs/readme/agents/codex.svg" width="36" height="36" alt=""><br><sub><b>Codex</b></sub></td>
    <td align="center" width="120"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/readme/agents/copilot-dark.svg"><img src="docs/readme/agents/copilot.svg" width="36" height="36" alt=""></picture><br><sub><b>GitHub Copilot</b></sub></td>
    <td align="center" width="120"><img src="docs/readme/agents/antigravity.svg" width="36" height="36" alt=""><br><sub><b>Antigravity</b></sub></td>
    <td align="center" width="120"><img src="docs/readme/agents/vscode.svg" width="36" height="36" alt=""><br><sub><b>VS Code</b></sub></td>
  </tr>
</table>
</div>

One sticker per Claude Code, Codex, Copilot or Antigravity session, a smaller one for each subagent (helper), and a tiny icon for what it's doing: reading, writing, running, done, or needs you. Hover for the file it's on.

- Works with **Claude Code** (CLI, desktop app, IDE), **Codex**, **GitHub Copilot** (VS Code agent mode and Copilot CLI) and **Antigravity**, because it listens to the agents' own hooks, not to an editor.
- Floats above everything, VS Code included. Clicks pass straight through except on the stickers.
- Local only: no server, no account, no network.
- npm: `agentpeeps`. The old `agent-presence` command still works, and settings stay in `~/.agent-presence`.

## Install

```bash
npx agentpeeps init    # adds hooks for every supported agent it finds (backups are kept)
```

The stickers appear on your next agent session (or start them now with `npx agentpeeps overlay`).
Because npx runs from a cache it may clear, `init` first installs a permanent copy into `~/.agent-presence/app` and points the hooks there. Run it again any time to update.

Prefer a global install? Same result:

```bash
npm i -g agentpeeps
agentpeeps init
agentpeeps overlay     # start the stickers (also auto-starts on your next agent session)
```

| Agent | Where `init` writes |
|---|---|
| Claude Code | `~/.claude/settings.json` |
| Codex | `~/.codex/hooks.json` |
| Copilot | `~/.copilot/hooks/agent-presence.json` (VS Code agent mode and Copilot CLI both read it) |
| Antigravity | `~/.gemini/config/hooks.json`, under the `agent-presence` key |

Pick some with `agentpeeps init copilot antigravity`.

Codex asks you to trust new hooks once: open `/hooks` in Codex and approve the Agent Peeps entries.
Copilot and Antigravity load hooks at startup, so restart them after `init`. Their hooks can't run in the background, so Agent Peeps only listens to events that can't hold up or block the agent: a tool call shows up when it finishes, not when it starts.

### Or as plugins (hooks + a customize-my-sticker skill; the overlay still comes from npm)

<p align="center"><img src="docs/readme/ask-your-agent.gif" width="760" alt="Claude Code is asked to set up Agent Peeps, runs agentpeeps init and three set commands, and the new stickers appear in the corner on the next session"></p>
<p align="center"><sub>Or skip the commands: ask your agent to set it up and pick its own stickers.</sub></p>

**Claude Code**

```
/plugin marketplace add watermelon588/agent-presence
/plugin install agent-presence@agent-presence
```

**Codex** (CLI or desktop app)

```bash
codex plugin marketplace add watermelon588/agent-presence
```

Then open `/plugins` in Codex, install **Agent Peeps**, and approve its hooks when Codex asks (Codex never trusts plugin hooks automatically). Plugins with hooks can't be listed in OpenAI's public plugin directory, so this GitHub marketplace is the install path.

Use either the plugin or `agentpeeps init` for an agent, not both, or every event is recorded twice.

### In VS Code (also Cursor, Windsurf, Antigravity)

The [`vscode/`](vscode/) extension reads the same event log and adds:

- **Explorer badges**: solid initials in each agent's color (🅒 Claude, 🅧 Codex, 🅟 Copilot, 🅐 Antigravity; helpers show their type's initial, e.g. 🅔 Explore), with folders lighting up around active files
- an **Agents** view in the Explorer with each agent's sticker, its subagents and the files it touched

Until it's on the Marketplace / Open VSX: `code --install-extension vscode/agent-presence-vscode-0.1.0.vsix`

## Commands

| Command | What it does |
|---|---|
| `agentpeeps init [agent...]` | Install hooks: `claude`, `codex`, `copilot`, `antigravity` (default: every one found) |
| `agentpeeps uninstall [agent...]` | Remove only our hooks |
| `agentpeeps overlay` / `--quit` | Start / stop the floating stickers |
| `agentpeeps control [agent]` | Open the control room (optionally straight on one agent's stickers) |
| `agentpeeps packs` | List sticker packs |
| `agentpeeps set <target> <pack|image|default>` | Give an agent, a model (`model:opus`), helpers or a helper type its stickers |
| `agentpeeps watch` | Live view in the terminal: a small color pixel sticker per agent and helper (it hops while working, shakes when it needs you), then the files each one touched. Redraws in place, so it only takes the lines it needs |
| `agentpeeps show [pack|agent|all] [--once]` | Preview the terminal stickers: 75 clean ones, including the official model logos (`show`, `show claude`, `show pixel-food`, `show all`). Busy stickers aren't in the terminal set; agents using one show their logo there instead |
| `agentpeeps emit <agent> [event]` | Used by the hooks: reads hook JSON on stdin |

### Control room (no config editing, no agent, no tokens)

Press `Ctrl+Alt+Shift+C`, click the **tray icon** (next to the clock) or run `agentpeeps control`. One window holds everything, and it opens instantly.

<p align="center"><img src="docs/readme/control-room/overview.webp" width="760" alt="The control room's Overview page with numbered labels: the four pages, the live session count, the on-screen switch, totals, a session card that needs you, its helpers, its sticker and hide buttons, the activity log and the sticker targets"></p>

- **Overview**: every live session with its sticker, model, folder, what it's doing, its helpers, tool calls, files touched and time on task, plus a running activity log.
- **Display**: size, when to show an agent, details, motion (lively / calm / off), status icon, resting opacity, helper layout (joining line / dashed pod / side by side), which agents to show, and **Only over my apps**: hide the stickers whenever an app other than your editor or terminal is in front.
- **Bubbles**: speech bubbles on or off, card or text only, border, theme (auto: white text in dark mode, black in light), text color, text size, open by itself when an agent needs you, stats line. With a live preview.
- **Shortcuts**: every global shortcut, whether it's ready or taken by another app, and one switch to turn them off.
- **Stickers**: one set per agent, per agent's helpers, every helper, a helper type (Explore, test-writer...) or a model rule. Pick several and each session or helper gets its own.

The full visual tour, with every page and setting labeled: **[docs/control-room.md](docs/control-room.md)**.

<p align="center"><img src="docs/readme/control-room/bubble.webp" width="560" alt="A speech bubble over a Claude sticker, labeled: name, model and folder, status, current file, recent files, stats line, status icon, helpers joined by a line"></p>

### Keyboard shortcuts

`Ctrl+Alt+Shift` (`⌘⌥⇧` on macOS) plus:

| Key | Does | | Key | Does |
|---|---|---|---|---|
| `A` | Show or hide the stickers | | `S` | Next size |
| `C` | Open the control room | | `W` | When to show an agent |
| `F` | Everywhere / only over my apps | | `L` | Helper layout |
| `B` | Speech bubbles on or off | | `M` | Motion: lively, calm, off |
| `P` | Peek: open every bubble | | `H` | Hide for 30 minutes |
| `T` | Bubble theme | | `R` | Reset positions |
| `D` | Details in the bubble or always | | | |

A toast at the bottom of the screen confirms each one. Turn them off in the control room if they clash with another app (`A` always works).

### On the stickers

- **Hover** for who it is, what it's doing, its recent files (click one to show it in its folder) and its stats.
- **Click** to pin the bubble open. A bubble also opens by itself when an agent needs you.
- **Drag** a sticker to put that agent anywhere; each agent remembers its spot.
- **Right-click** to change or hide just that one, peek at every bubble, hide everything for 30 minutes, or quit.

By default the stickers are small and disappear a few seconds after an agent finishes. Until you pick stickers, each agent shows its own logo. Helpers are joined to their agent by a thin line in its color.

## Your own stickers

<p align="center"><img src="docs/readme/stickers.png" width="760" alt="Ten stickers from the built-in packs: plush blobs, gradient icons, pixel characters, color blobs, a flame and a purple octopus"></p>

### Packs, from the terminal

<p align="center"><img src="docs/readme/customize.gif" width="760" alt="The terminal runs agentpeeps set claude capybaras, set codex cats and set helpers fruit-cats, and the stickers in the corner swap as each command runs"></p>

15 free packs come built in: plush-blobs, gradient-icons, pixel-food, color-blobs, flame-expressions, monster-icons, retro-windows, capybaras, cats and more. Your own pack is a folder of images in `~/.agent-presence/stickers/<pack name>/`. Point any agent, model or helper at one:

```bash
agentpeeps packs                       # list your packs
agentpeeps set claude capybaras        # every Claude session gets a capybara
agentpeeps set codex cats
agentpeeps set model:opus capybaras    # sessions on a model containing "opus"
agentpeeps set model:fable cats
agentpeeps set helpers fruit-cats      # every subagent
agentpeeps set claude-helpers critters # only Claude's subagents
agentpeeps set Explore detective.png   # one subagent type, one image
agentpeeps set claude default          # back to Claude's logo
```

A session uses its model rule first (the longest match wins), then its agent. A helper uses its type, then its agent's helpers, then every helper. Images added to a pack later are picked up automatically. Claude Code and Antigravity report the model; for agents that don't, model rules simply don't apply.

### Or click

Drop images into `~/.agent-presence/stickers/` (subfolders become groups) and pick them in the control room, or use **Add from my computer…** there. Any PNG, GIF (animated works), SVG, WebP or JPEG; square, about 256 px, looks best.

The control room writes `~/.agent-presence/config.json`, which you (or an agent) can also edit by hand; the overlay applies changes live:

```json
{
  "avatars": {
    "claude": "pack:plush-blobs",
    "model:opus": ["~/stickers/fox.gif", "~/stickers/owl.png"],
    "codex": "~/stickers/robot.png",
    "subagent": "~/stickers/sprout.svg",
    "Explore": "~/stickers/detective.png",
    "test-writer": "~/stickers/bee.png"
  },
  "names": { "claude": "Foxy" },
  "size": "small",
  "show": "working",
  "details": "hover",
  "agents": { "copilot": false },
  "autostart": true,
  "scope": "apps",
  "apps": ["Code", "Cursor", "WindowsTerminal"],
  "helpers": "line",
  "motion": "lively",
  "opacity": 80,
  "shortcuts": true,
  "bubble": { "on": true, "style": "card", "border": true, "theme": "auto", "text": "auto", "size": "medium", "auto": true, "stats": true }
}
```

Sticker keys: an agent (`claude`, `codex`, `copilot`, `antigravity`), `<agent>-subagent` for that agent's helpers, `subagent` for every helper, or a helper type (`Explore`, `test-writer`, anything you named). A helper uses its type first, then its agent's helpers, then every helper. A list gives each session (or helper) one of its images. Every other key is listed in [docs/control-room.md](docs/control-room.md#settings-file).

## How it works

```
Claude Code hooks ─┐
Codex hooks ───────┤
Copilot hooks ─────┼─ agentpeeps emit ─→ ~/.agent-presence/events.jsonl ─→ overlay (Electron) / watch (terminal) / VS Code
Antigravity hooks ─┘
```

Every hook appends one JSON line (agent, session, subagent id/type, state, file). The emitter never blocks or fails the agent: it always exits 0, swallows errors (set `AGENT_PRESENCE_DEBUG=1` to see them), runs async where the agent allows it, and never registers a hook whose output decides permissions.

States: `idle`, `thinking`, `reading`, `writing`, `running`, `delegating`, `browsing`, `waiting` (needs your permission), `done`.

## Develop

```bash
npm install
node node_modules/electron/install.js   # fetch the Electron binary once
npm test                                 # parser + installer checks
npm run overlay                          # terminal 1
npm run demo                             # terminal 2: plays fake Claude, Codex, Copilot and Antigravity sessions
```

`AGENT_PRESENCE_HOME=<dir>` points everything at a scratch folder. `AGENT_PRESENCE_SNAPSHOT=out.png` makes the overlay save a picture of the dock and quit.

## Roadmap

- Publish the VS Code extension to the Marketplace and Open VSX (Cursor, Windsurf and Antigravity install from Open VSX)
- OpenCode, DeepSeek Harness hooks
- Copilot / Antigravity: show tool calls as they start, if they get a non-blocking pre-tool hook
- Move the Codex manifest to the newer root `plugin.json` (`extensions.com.openai`) once Codex versions without it are gone
- Sticker packs

MIT
