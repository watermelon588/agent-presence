---
name: agentpeeps
description: Set up, start, stop or check Agent Peeps, the floating stickers that show what Claude Code, Codex, Copilot and Antigravity agents are doing. Use when the user says "set up agentpeeps", "start/stop agentpeeps", "stickers on/off", "pause the stickers", "is agentpeeps running" or "remove agentpeeps".
---

# Agent Peeps

Agent Peeps puts a small live sticker on screen for every AI coding agent session. It works through the agents' own hooks and runs locally; nothing leaves the machine. Needs Node 18+.

Setup is **one time**. After it, the stickers start by themselves whenever the user starts working (a new agent session, or a prompt in one that's already open). Never re-run `init` to "start" it.

## Set it up (only if it isn't already)

1. **Check first.** It's already set up if `~/.claude/settings.json` or `~/.codex/hooks.json` contains `agentpeeps ... emit`. If so, skip to step 4.
2. **Install the hooks:**
   ```
   npx -y agentpeeps init
   ```
   It finds every supported agent (Claude Code, Codex, Copilot, Antigravity), backs up their settings, adds its hooks, and installs a permanent copy to `~/.agent-presence/app` so the hooks keep working after npx clears its cache. To set up only some agents: `npx -y agentpeeps init claude codex`.
3. **Make sure the stickers are running.** `init` starts them and downloads Electron once, which takes a minute. If they aren't running afterwards, run `overlay` (see "Running the CLI" below).
4. **Make sure this skill is saved** so the user can later say "stop agentpeeps" to you. `init` saves it for Claude Code (`~/.claude/skills/agentpeeps/SKILL.md`) and Codex (`~/.agents/skills/agentpeeps/SKILL.md`). If it's missing for the agent you are, write this whole file there, unchanged.
5. **Tell the user** in two or three lines: which agents got hooks, that the stickers are running, and the things they still have to do themselves:
   - **Codex:** open `/hooks` in Codex once and trust the Agent Peeps hooks. Codex won't run new hooks until they do.
   - **Copilot / Antigravity:** restart them so they load the hooks.
   - From now on they can say "stop agentpeeps" or "start agentpeeps" to you.

## Running the CLI

Use the first one that works:

1. `agentpeeps <command>` if it's on PATH (from `npm i -g agentpeeps`)
2. `node "$HOME/.agent-presence/app/node_modules/agentpeeps/cli.js" <command>`
   (PowerShell: `node "$env:USERPROFILE\.agent-presence\app\node_modules\agentpeeps\cli.js" <command>`)
3. `npx -y agentpeeps <command>`

## Day to day

| The user wants | Do |
|---|---|
| Start / show the stickers | `overlay` |
| Stop for now (they come back on the next new session) | `overlay --quit` |
| Stop until I turn it back on | set `"autostart": false` in `~/.agent-presence/config.json`, then `overlay --quit` |
| Turn automatic start back on | set `"autostart": true`, then `overlay` |
| Is it running? | read the PID in `~/.agent-presence/overlay.pid` and check that the process is alive. Don't run `overlay` just to check, because that starts it. |
| Change stickers, size or names | `control` opens the control room (point and click, no config editing). Or use `packs` to list packs and `set <target> <pack>`, e.g. `set claude capybaras`, `set helpers robots`, `set model:opus cats`. |
| Watch in the terminal | `watch` |
| Remove completely | `uninstall` (removes the hooks and this skill; old settings were backed up as `*.bak-agent-presence`). |

## Rules

- Edit `~/.agent-presence/config.json` by parsing and rewriting the JSON. Keep every existing key. Edits apply live, with no restart.
- Sticker image paths in the config must point inside `~/.agent-presence/` (the `app` copy or `stickers/`), never into an `_npx` cache folder, which npx deletes.
- Don't edit the agents' hook settings by hand. Use `init` and `uninstall`.
- After an action, report it in one line (started / stopped / already running / set up).

Docs: https://www.agentpeeps.space/docs.html · Source: https://github.com/watermelon588/agentpeeps
