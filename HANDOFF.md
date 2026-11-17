# Agent Peeps handoff for Claude

Updated 2026-11-16. This checkout is the `agent-presence` folder. The package currently calls itself Agent Peeps and exposes both `agentpeeps` and `agent-presence` as CLI names.

## Where to start

- `sticks/` contains the source art. `avatars/stickers/manifest.json` records processed sources, output paths and crop bounds where applicable. Compare normalized `source` paths against this manifest before taking on another batch.
- `avatars/stickers/general/` contains the generated sticker packs. `packs()` in `cli.js` discovers image files by folder, and `library()` in `overlay/main.js` supplies those packs to the control room. `node cli.js packs` lists the live categories from this checkout.
- `brand/` contains the reference images. The four finished candidates are in `brand/cutouts/`. The app has no new logo references from this batch.

## Latest sticker batch

The four newly supplied JPG sheets yielded 39 static WebP stickers, each with a looping GIF variant. Repeated poses within the printable sheets were skipped. The supplied pigeon GIF was cleaned up and imported as an additional loop. The batch added 79 entries to the manifest, all using transparent 256 × 256 canvases.

| Pack | Static WebP | Looping GIF | Source |
|---|---:|---:|---|
| `angry-birds` | 14 | 14 | `Angry Bird Printables.jpg` and `Free Printable Angry Birds Stickers, Toppers or Labels_.jpg` |
| `minions` | 23 | 23 | `download (6).jpg` |
| `gumball` | 2 | 2 | `b4c55ef8ca57f57fd5dcfcb443196f90.jpg` |
| `birds` | 0 | 1 | The `Meditation Space Ideas` download, which contains the blue pigeon loop |

The pigeon export is `avatars/stickers/general/birds/blue-pigeon-hop.gif`. It retains all 24 source frames and their total timing. The previous batch contributed 77 WebP stickers and 89 looping GIFs from 32 inputs.

## Brand cutouts

These are reference-derived transparent 1024 × 1024 PNGs, centered with consistent padding. They were created with built-in image editing, then checked on light and dark backgrounds. The edit prompt asked to isolate the mascot while preserving its proportions, outline, colors and opaque white details.

| Output under `brand/cutouts/` | Reference under `brand/` |
|---|---|
| `blue-pigeon.png` | `0afb2ca5bdc8e078416b97595b782f00.jpg` |
| `green-pig.png` | `8db3919d62a019d133dab2a3b6f78f84.jpg` |
| `zombie-head.png` | `bb44c98e855aec07a9d51e4c3427dd3f.jpg` |
| `big-eyed-duck.png` | `f12b6fbf5e69dcf11f0b28fc4da0215f.jpg` |

## Verification and open items

- The pack loader finds all 79 new assets. Each file opened at the expected dimensions, and each GIF has multiple frames, transparency and an infinite loop. The manifest now has 407 entries.
- Two older manifest entries already pointed at absent files before this batch. They are `general/psyduck.webp` and `general/screaming-frog.webp`. Confirm whether those older entries should be restored or removed if asked to clean up the catalog.
- The three MP4 sources were outside the requested image and GIF batch. The logo selection and any wiring into the tray, package or plugin are still open decisions.
- Verification used this local checkout. The current npm `files` list omits `avatars/` and `brand/`. If asked to ship bundled assets, verify the packed archive before release.
- The checkout contains pre-existing source edits and staged avatar deletions. Preserve that work and keep any next change scoped to the user's request.
