# Contributing to Agent Peeps

Thanks for helping! Small, focused PRs get merged fastest.

## Good places to start

- Issues labelled [`good first issue`](https://github.com/watermelon588/agentpeeps/labels/good%20first%20issue) are small and well described.
- A new sticker pack (see below) needs no code at all.
- Questions and ideas go in [Discussions](https://github.com/watermelon588/agentpeeps/discussions).

## Setup

```bash
git clone https://github.com/watermelon588/agentpeeps
cd agentpeeps
npm install
node node_modules/electron/install.js   # fetch the Electron binary once
npm test                                 # parser + installer + terminal sticker checks
npm run overlay                          # terminal 1: the floating stickers
npm run demo                             # terminal 2: fake Claude, Codex, Copilot and Antigravity sessions
```

`AGENT_PRESENCE_HOME=<dir>` points everything at a scratch folder, so you never touch your real hooks.

The website lives in `website/web` (Vite + Tailwind): `cd website/web && npm install && npm run dev`.

## Where things are

| Path | What |
|---|---|
| `cli.js` | everything outside the overlay: hook parsing (`normalize`), installers, `watch`, `show`, packs |
| `overlay/` | the Electron overlay and control room |
| `avatars/free/` | sticker packs shipped on npm |
| `avatars/terminal.json` | the pixel stickers for the terminal, baked by `npm run terminal-stickers` |
| `vscode/` | the VS Code extension |
| `website/web/` | agentpeeps.space |
| `test.js` | one file of plain `assert` checks, no framework |

## Rules of the road

- **Hooks must never break an agent.** The emitter always exits 0, never blocks, and never registers a hook whose output decides permissions. Any change near `emit` needs a check in `test.js`.
- **No new dependencies** unless there's no small alternative. The CLI has none today.
- **Local only.** No network calls, no telemetry.
- Run `npm test` before you push. CI runs it on Windows, macOS and Linux.

## Adding a sticker pack

A pack is a folder of images (`.webp`, `.png`, `.gif`, `.svg`), ideally transparent and about 256x256.

- **Shipped on npm** (`avatars/free/<pack>/`): only art you made or that's licensed for redistribution (CC0, CC-BY, MIT...). Say where it came from in the PR.
- **Characters owned by companies** (cartoons, games...) can only go in the website's fan section (`website/web/src/stickers-fan/`), never in the npm package.

Then `npm run terminal-stickers` if it should also appear in the terminal view (needs Python + Pillow).

## Releasing (maintainers)

1. Update `CHANGELOG.md` and bump `version` in `package.json`.
2. `npm test && npm publish`
3. `git tag vX.Y.Z && git push --tags`, then create a GitHub release from the tag with the changelog section.
