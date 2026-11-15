# agent-presence

Sticker chibis that float over your screen and show what your AI coding agents are doing, live.
One sticker per Claude Code or Codex session, smaller ones for each subagent, and a speech bubble with the file or command it is on right now.

```
  [✏️ auth.ts]        [▶️ npm test]      [❗ needs you]
     (Codex)         (test-writer)        (Claude)
```

- Works with Claude Code (CLI, desktop app, IDE) and Codex, because it listens to the agents' own hooks, not to an editor.
- Floats above everything, VS Code included. Clicks pass straight through except on the stickers.
- Local only: no server, no account, no network.

## Install

```bash
npm i -g agent-presence
agent-presence init        # adds hooks to ~/.claude/settings.json and ~/.codex/hooks.json (backups are kept)
agent-presence overlay     # start the stickers (also auto-starts on your next agent session)
```

Codex asks you to trust new hooks once: open `/hooks` in Codex and approve the agent-presence entries.

### Or as plugins (hooks + a customize-my-sticker skill; the overlay still comes from npm)

**Claude Code**

```
/plugin marketplace add watermelon588/agent-presence
/plugin install agent-presence@agent-presence
```

**Codex** (CLI or desktop app)

```bash
codex plugin marketplace add watermelon588/agent-presence
```

Then open `/plugins` in Codex, install **Agent Presence**, and approve its hooks when Codex asks (Codex never trusts plugin hooks automatically). Plugins with hooks can't be listed in OpenAI's public plugin directory, so this GitHub marketplace is the install path.

Use either the plugin or `agent-presence init` for an agent, not both, or every event is recorded twice.

### In VS Code (also Cursor, Windsurf, Antigravity)

The [`vscode/`](vscode/) extension reads the same event log and adds:

- **Explorer badges**: 🍑 Claude, 🤖 Codex, 🌱 subagents, in each agent's color, with folders lighting up around active files
- an **Agents** view in the Explorer with each agent's sticker, its subagents and the files it touched

Until it's on the Marketplace / Open VSX: `code --install-extension vscode/agent-presence-vscode-0.1.0.vsix`

## Commands

| Command | What it does |
|---|---|
| `agent-presence init [claude\|codex]` | Install hooks (both by default) |
| `agent-presence uninstall [claude\|codex]` | Remove only our hooks |
| `agent-presence overlay` / `--quit` | Start / stop the floating stickers |
| `agent-presence watch` | Same live view, in the terminal |
| `agent-presence emit <agent>` | Used by the hooks: reads hook JSON on stdin |

In the overlay: drag a sticker to move the dock, hover for recent files (click one to show it in its folder), right-click to hide or quit, `Ctrl+Alt+Shift+A` toggles it.

## Your own stickers

Any PNG, GIF (animated works), SVG or WebP. Put paths in `~/.agent-presence/config.json`:

```json
{
  "avatars": {
    "claude": "~/stickers/fox.gif",
    "codex": "~/stickers/robot.png",
    "subagent": "~/stickers/sprout.svg",
    "Explore": "~/stickers/detective.png",
    "test-writer": "~/stickers/bee.png"
  },
  "names": { "claude": "Mochi", "codex": "Bit" },
  "autostart": true
}
```

Keys are an agent (`claude`, `codex`), a subagent type (`Explore`, `test-writer`, anything you named), `<agent>-subagent`, or `subagent` for the default helper. Square images around 256 px look best.

## How it works

```
Claude Code hooks ─┐
                   ├─ agent-presence emit ─→ ~/.agent-presence/events.jsonl ─→ overlay (Electron) / watch (terminal)
Codex hooks ───────┘
```

Every hook appends one JSON line (agent, session, subagent id/type, state, file). The emitter never blocks or fails the agent: hooks run async and errors are swallowed (set `AGENT_PRESENCE_DEBUG=1` to see them).

States: `idle`, `thinking`, `reading`, `writing`, `running`, `delegating`, `browsing`, `waiting` (needs your permission), `done`.

## Develop

```bash
npm install
node node_modules/electron/install.js   # fetch the Electron binary once
npm test                                 # parser + installer checks
npm run overlay                          # terminal 1
npm run demo                             # terminal 2: plays a fake Claude + Codex session
```

`AGENT_PRESENCE_HOME=<dir>` points everything at a scratch folder. `AGENT_PRESENCE_SNAPSHOT=out.png` makes the overlay save a picture of the dock and quit.

## Roadmap

- Publish the VS Code extension to the Marketplace and Open VSX (Cursor, Windsurf and Antigravity install from Open VSX)
- Copilot, Antigravity, OpenCode, DeepSeek Harness hooks
- Move the Codex manifest to the newer root `plugin.json` (`extensions.com.openai`) once Codex versions without it are gone
- Sticker packs

MIT
