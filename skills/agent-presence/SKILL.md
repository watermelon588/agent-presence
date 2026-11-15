---
name: agent-presence
description: Customize or control the agent-presence sticker overlay — set a custom sticker image for Claude, Codex, Copilot, Antigravity or a subagent type, rename an agent's sticker, or start, stop and check the floating overlay. Use when the user mentions their agent sticker, chibi, avatar, mascot or the presence overlay.
---

# agent-presence

The overlay reads `~/.agent-presence/config.json` (Windows: `%USERPROFILE%\.agent-presence\config.json`). Create it if missing; keep existing keys when editing.

```json
{
  "avatars": { "claude": "<image path>", "codex": "<image path>", "subagent": "<image path>", "<subagent type>": "<image path>" },
  "names": { "claude": "Mochi", "codex": "Bit" },
  "autostart": true
}
```

- Avatar keys: `claude`, `codex`, `copilot`, `antigravity`, a subagent type such as `Explore` or `test-writer`, `<agent>-subagent`, or `subagent` for every helper.
- Images: PNG, GIF (animation plays), SVG or WebP, square, about 256 px. Use absolute paths; `~` is allowed. Check the file exists before writing it.
- `autostart: false` stops the overlay from opening on new sessions.

Commands (the npm package must be installed: `npm i -g agent-presence`):

- `agent-presence overlay` starts it, `agent-presence overlay --quit` stops it. Restart it after changing avatars or names.
- `agent-presence watch` shows the same live view in the terminal.

Do not edit the agent's hook settings to customize stickers; only the config file above.
