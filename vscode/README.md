# Agent Presence for VS Code

See which AI coding agent is working on which file, live, in the Explorer.

- **Explorer badges**: 🍑 Claude Code, 🤖 Codex, 🧭 Copilot, 🎈 Antigravity, 🌱 subagents, each in its own color. Folders light up when an agent works inside them. Hover for who, what and when.
- **Agents view** (Explorer sidebar): every running agent with its sticker, its subagents, and the files it touched. Click a file to open it.
- Works in VS Code, Cursor, Windsurf and Antigravity.

Needs the agent-presence hooks (Claude Code, Codex, Copilot and Antigravity), which feed `~/.agent-presence/events.jsonl`:

```bash
npm i -g agent-presence
agent-presence init
```

Want the animated stickers floating over your screen too? Run `agent-presence overlay`.

## Settings

- `agentPresence.badges`: badge per agent, e.g. `{ "claude": "C", "codex": "X", "Explore": "🔍" }` (1–2 characters or one emoji)
- `agentPresence.recentSeconds`: how long a badge stays after the agent moves on (default 90)

Custom sticker images and names come from `~/.agent-presence/config.json`, shared with the overlay.
