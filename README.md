# agent-presence

Sticker chibis that float over your screen and show what your AI coding agents are doing, live.
One sticker per Claude Code, Codex, Copilot or Antigravity session, smaller ones for each subagent, and a speech bubble with the file or command it is on right now.

```
  [✏️ auth.ts]        [▶️ npm test]      [❗ needs you]
     (Codex)         (test-writer)        (Claude)
```

- Works with Claude Code (CLI, desktop app, IDE), Codex, GitHub Copilot (VS Code agent mode and Copilot CLI) and Antigravity, because it listens to the agents' own hooks, not to an editor.
- Floats above everything, VS Code included. Clicks pass straight through except on the stickers.
- Local only: no server, no account, no network.

## Install

```bash
npx agent-presence init    # adds hooks for every supported agent it finds (backups are kept)
```

The stickers appear on your next agent session (or start them now with `npx agent-presence overlay`).
Because npx runs from a cache it may clear, `init` first installs a permanent copy into `~/.agent-presence/app` and points the hooks there. Run it again any time to update.

Prefer a global install? Same result:

```bash
npm i -g agent-presence
agent-presence init
agent-presence overlay     # start the stickers (also auto-starts on your next agent session)
```

| Agent | Where `init` writes |
|---|---|
| Claude Code | `~/.claude/settings.json` |
| Codex | `~/.codex/hooks.json` |
| Copilot | `~/.copilot/hooks/agent-presence.json` (VS Code agent mode and Copilot CLI both read it) |
| Antigravity | `~/.gemini/config/hooks.json`, under the `agent-presence` key |

Pick some with `agent-presence init copilot antigravity`.

Codex asks you to trust new hooks once: open `/hooks` in Codex and approve the agent-presence entries.
Copilot and Antigravity load hooks at startup, so restart them after `init`. Their hooks can't run in the background, so agent-presence only listens to events that can't hold up or block the agent: a tool call shows up when it finishes, not when it starts.

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

- **Explorer badges**: 🍑 Claude, 🤖 Codex, 🧭 Copilot, 🎈 Antigravity, 🌱 subagents, in each agent's color, with folders lighting up around active files
- an **Agents** view in the Explorer with each agent's sticker, its subagents and the files it touched

Until it's on the Marketplace / Open VSX: `code --install-extension vscode/agent-presence-vscode-0.1.0.vsix`

## Commands

| Command | What it does |
|---|---|
| `agent-presence init [agent...]` | Install hooks: `claude`, `codex`, `copilot`, `antigravity` (default: every one found) |
| `agent-presence uninstall [agent...]` | Remove only our hooks |
| `agent-presence overlay` / `--quit` | Start / stop the floating stickers |
| `agent-presence watch` | Same live view, in the terminal |
| `agent-presence emit <agent> [event]` | Used by the hooks: reads hook JSON on stdin |

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

Keys are an agent (`claude`, `codex`, `copilot`, `antigravity`), a subagent type (`Explore`, `test-writer`, anything you named), `<agent>-subagent`, or `subagent` for the default helper. Square images around 256 px look best.

## How it works

```
Claude Code hooks ─┐
Codex hooks ───────┤
Copilot hooks ─────┼─ agent-presence emit ─→ ~/.agent-presence/events.jsonl ─→ overlay (Electron) / watch (terminal) / VS Code
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
