# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- **Shortcuts** bar (always visible): **Default** (initial load preset), **Vibes** (gradient + black bit + random seed + static pose, laser/stroke/center at defaults), **Random** (wide randomization).
- **Collapsible sidebar** sections with accordion behavior (one open at a time); **Export** and **Shortcuts** stay visible.
- **Gradient backgrounds** via `CanvasTexture` on `scene.background` (2–4 stops), aligned to projected X/Y/Z arm; updates with rotation and orbit; included in PNG export.
- **Solid** background color option.
- **Style**: **Bit color** for arms, center disc, and laser guides; SVG export uses the same color.
- **Reset lengths** under Arms (default X/Y/Z, turns off Auto Length).
- **Pose**: single **Reset** (isometric camera + turns off Auto Rotate).
- **Single seed** for both arm lengths and rotation (`applySeed`).

### Changed

- Consolidated on one **main.js** entry (2D stroke / rect rendering); removed legacy box/SVGRenderer stack and unused vendor files.
- **README** and **CLAUDE.md** updated to match current behavior.

### Removed

- Duplicate `index-lines.html` / `main-lines.js` naming; legacy `main.js` box variant, root `three.min.js` / `three-global.js` stubs, `vendor/lines/*`, `SVGRenderer.js`, `Projector.js`.
