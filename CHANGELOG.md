# Changelog

## 0.2.0 (2026-11-20)

- The stickers now start by themselves when you start working: on a new agent session, or on a prompt in one that's already open (after a crash or a reboot). Before this, the permanent copy `init` installs never had Electron, so autostart silently did nothing until you ran `agentpeeps overlay` once.
- `init` starts the stickers right away and downloads Electron for the hooks' copy. If Electron is still missing when a session starts, the hook fetches it in the background without slowing the agent.
- `agentpeeps overlay --quit` and the tray's Quit pause autostart until your next new session.
- Windows: the stickers no longer get stuck under other windows (like browser tabs) after Windows drops them out of always-on-top (sleep/wake, Explorer restarting, an app going fullscreen). The overlay takes the top spot back within 2 seconds.
- New `agentpeeps` skill, saved by `init` for Claude Code and Codex and removed by `uninstall`: tell your agent "stop agentpeeps", "start agentpeeps" or "turn it off until I say". It's also served at agentpeeps.space/skill.md, so a new user can paste "Set up Agent Peeps for me: read https://www.agentpeeps.space/skill.md and follow it." into their agent.

## 0.1.1 (2026-11-18)

- Model-logo stickers (Claude, OpenAI, Gemini, Grok, Meta, DeepSeek, Kimi, GLM, Qwen, Mistral, MiniMax, Perplexity, Copilot, Codex, Antigravity) and the Claude pack now ship in the package.
- `agentpeeps watch` and `agentpeeps show`: live color pixel stickers in the terminal (75 stickers). Rows that don't fit the window are left out instead of cut in half.
- Asking for a website-only fan pack explains why it's missing and how to get it.
- The website can download a whole sticker pack as one zip.
- `agentpeeps --version`.

## 0.1.0 (2026-11-16)

- First release: a floating sticker for every Claude Code, Codex, GitHub Copilot and Antigravity session, with an icon for what it's doing.
- `agentpeeps init` adds hooks for every supported agent it finds, with backups. `uninstall` removes only ours.
- 15 free sticker packs, your own packs from any folder, the control room, the VS Code extension.
