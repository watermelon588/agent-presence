# Agent Peeps for VS Code

See which AI coding agent is working on which file, live, in the Explorer.

- **Explorer badges**: solid initials in each agent's color: 🅒 Claude Code, 🅧 Codex, 🅟 Copilot, 🅐 Antigravity. Helpers show their type's initial (🅔 Explore, 🅣 test-writer). Folders light up when an agent works inside them. Hover for who, what and when.
- **Agents view** (Explorer sidebar): every running agent with its sticker (the one picked in the control room, or a dot in its color), its subagents, and the files it touched. Click a file to open it.
- Works in VS Code, Cursor, Windsurf and Antigravity.

Needs the Agent Peeps hooks (Claude Code, Codex, Copilot and Antigravity), which feed `~/.agent-presence/events.jsonl`:

```bash
npm i -g agentpeeps
agentpeeps init
```

Want the animated stickers floating over your screen too? Run `agentpeeps overlay`.

## Settings

- `agentPresence.badges`: badge per agent, e.g. `{ "claude": "C", "codex": "X", "Explore": "🔍" }` (1–2 characters or one emoji)
- `agentPresence.recentSeconds`: how long a badge stays after the agent moves on (default 90)

Custom sticker images and names come from `~/.agent-presence/config.json`, shared with the overlay.
