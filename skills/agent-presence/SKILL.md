---
name: agent-presence
description: Customize or control the Agent Peeps sticker overlay — set sticker images for Claude, Codex, Copilot, Antigravity, their helpers or a subagent type, change size or when stickers show, or start, stop and check the floating overlay. Use when the user mentions their agent sticker, chibi, avatar, mascot or the presence overlay.
---

# agentpeeps

Usually the fastest answer is: open the control room (tray icon, or `agentpeeps control`, or `agentpeeps control claude` for one agent's stickers). It changes everything with clicks and costs no tokens. Edit the config only when asked to.

The overlay reads `~/.agent-presence/config.json` (Windows: `%USERPROFILE%\.agent-presence\config.json`). Create it if missing; keep existing keys when editing.

```json
{
  "avatars": { "claude": ["<image>", "<image>"], "codex": "<image>", "claude-subagent": "<image>", "subagent": "<image>", "<subagent type>": "<image>" },
  "names": { "claude": "Foxy" },
  "size": "small", "show": "working", "details": "hover", "agents": { "copilot": false },
  "autostart": true
}
```

- Avatar values: an image path, `"pack:<name>"`, or a list. Keys: `claude`, `codex`, `copilot`, `antigravity`, `model:<text>` (sessions whose model contains it), `<agent>-subagent` (that agent's helpers), `subagent` (every helper), or a subagent type such as `Explore`. A list gives each session or helper one image from it.
- Images: PNG, GIF (animation plays), SVG, WebP or JPEG, square, about 256 px. The user's library is `~/.agent-presence/stickers/`. Use absolute paths; `~` is allowed. Check the file exists before writing it.
- Other keys: `size` (`small`|`medium`|`large`), `show` (`working`|`alerts`|`always`), `details` (`hover`|`always`), `agents` (e.g. `{ "copilot": false }`). The overlay applies edits live.
- `autostart: false` stops the overlay from opening on new sessions.

Commands (the npm package must be installed: `npm i -g agentpeeps`):

- `agentpeeps packs` lists packs (folders in `~/.agent-presence/stickers/`). `agentpeeps set <target> <pack|image|default>` assigns them, e.g. `set claude capybaras`, `set model:opus capybaras`, `set helpers fruit-cats`, `set claude-helpers critters`, `set Explore ~/x.png`. Prefer this over editing the config.

- `agentpeeps overlay` starts it, `agentpeeps overlay --quit` stops it. Config edits apply live, no restart.
- `agentpeeps watch` shows the same live view in the terminal.

Do not edit the agent's hook settings to customize stickers; only the config file above.
