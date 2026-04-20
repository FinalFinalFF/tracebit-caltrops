# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A static Three.js visualizer for exploring Tracebit's 3-axis caltrop logo mark. No build system, no package manager — just HTML, JS, and vendored dependencies.

## Running

Open `index.html` in a browser, or serve the directory:

```
python -m http.server
```

## Architecture

- **`index.html` / `main.js`** — Renders arms as 2D camera-facing rectangles projected from 3D, so strokes always appear as perfect rectangles with 90-degree corners regardless of rotation. Uses a center disc instead of a sphere. PNG export uses the WebGL canvas (including `scene.background` when gradient or solid). SVG export builds vector output in JS (`buildCurrentSvg()`) with the same projection math as the renderer.

**Key patterns:**

- Orthographic camera (not perspective) — the output is flat/graphic, not photoreal.
- **`state`** object holds sliders, seed, background mode, bit color, etc. **`syncFullUI()`** in `initUI` refreshes all controls and materials after programmatic changes (e.g. shortcut presets).
- **`updateArmProjections()`** each frame: projects local axes through `caltropGroup.rotation` and orients camera-facing meshes; fills **`lastArmScreenProjection`** for gradient alignment.
- **`updateBackground()`** — solid `THREE.Color` or **`CanvasTexture`** from an offscreen 2D gradient aligned to the selected arm direction.
- **`applySeed(seed)`** — single `mulberry32(seed)` stream: three draws for arm lengths, three for Euler rotation.
- Shortcut handlers: **`applyShortcutDefault`** (static lengths + zero rotation, no auto motion), **`applyShortcutAuto`** (seed 1 + **`applySeed(1)`** + auto rotate/length), **`applyShortcutVibes`**, **`applyShortcutRandom`** (wide randomization but keeps stroke thickness and center radius), **`applyShortcutFullRandom`** (also randomizes those two); shared defaults in **`DEFAULT_ARM_LENGTHS`**, **`DEFAULT_THICKNESS`**, **`DEFAULT_SPHERE_RADIUS`**, **`DEFAULT_GRADIENT_COLORS`**, laser defaults.

**Export parity:** SVG export duplicates the renderer's projection math in JS. Any change to `updateArmProjections()`, camera setup, or arm geometry must be mirrored in `buildCurrentSvg()` or PNG and SVG outputs will diverge.

**UI sync:** After any programmatic mutation to `state` (shortcut handlers, preset loads), call `syncFullUI()` — otherwise sidebar controls drift from the rendered scene.

## Vendored Dependencies

All in `vendor/` — loaded via an import map in the HTML (`"three"` maps to `vendor/three.module.min.js`):

- `three.module.min.js` — Three.js core
- `OrbitControls.js` — camera orbit controls

## Sibling Files

- `blender_caltrop.py` — standalone Blender script that builds a 3D caltrop matching the Three.js defaults (`ARM_HALF`, `THICKNESS`, `SPHERE_R`). Keep in sync with `DEFAULT_*` constants in `main.js` if those change.
- `NOTES.md` — default-geometry tables and preset-behavior matrix.
- `CHANGELOG.md` — log notable changes here when adding shortcuts, defaults, or export behavior.
