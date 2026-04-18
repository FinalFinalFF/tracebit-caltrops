# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- **Inner fillets** at the concave inside corners of the mark (replaces the center disc). Rendered via a 2D overlay: each arm drawn as a rotated rectangle, then an additive arc patch at each CCW-adjacent concave corner. Radius fades as the corner drifts outward from origin, so near-parallel axes no longer produce tooth artifacts or floating rectangles.
- **Fillet Radius** slider under Shape → Mark (replaces Center Radius); included in SVG export (background-colored fillet circles at arm-edge intersections).
- **Plane Angle Min** slider in the Pose panel: constrains Auto Rotate so no axis-plane can drift near edge-on. Implementation reparameterizes Auto Rotate as spin-around-view-axis + bounded tilt, which can never degenerate no matter how long it runs. Geometric max for three orthogonal axes is ~35.26°; values above collapse to pure spin.
- **Sidebar scrolls independently** of the canvas (`body { overflow: hidden }`, `#controls` gets its own `overflow-y: auto` + `overscroll-behavior: contain`). Canvas stays pinned to the viewport.

### Changed

- **Vibes** preset reworked as a concrete captured config (arms 1.25 / 1.0 / 1.5, thickness 0.1, fillet 0.025, dark bit `#1c1c1c` on a radial-on-radial gradient, plane grid on, Auto Rotate + Auto Length on, plane-angle limit 8°) rather than a random-each-press generator.
- **Shortcuts** bar (always visible): **Default** (static baseline, no auto motion), **Auto** (seed 1 + animated rotate/length), **Vibes** (gradient + black bit + random seed + static pose, laser/stroke/center at defaults), **Random** (wide randomization).
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
- **Default geometry** (sliders, Reset, shortcut baselines): arm lengths **X 1.0 / Y 1.0 / Z 1.3**, stroke thickness **0.075**, center radius **0.1**; **Auto Length** animation oscillates around those lengths.
- **Shortcuts** layout: two rows (**Default** / **Auto**, then **Vibes** / **Random**).

### Removed

- Duplicate `index-lines.html` / `main-lines.js` naming; legacy `main.js` box variant, root `three.min.js` / `three-global.js` stubs, `vendor/lines/*`, `SVGRenderer.js`, `Projector.js`.
