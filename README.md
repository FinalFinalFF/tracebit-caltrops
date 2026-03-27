## Tracebit Caltrops 3D Visualizer

Flat, graphic Three.js tool for exploring a 3‑axis caltrop mark (X/Y/Z arms plus center disc) and exporting candidate variable logos.

### Running it

- Open `index.html` directly in a modern browser, or
- Serve the folder with a simple static server (for example: `python -m http.server` from this directory) and open the URL it prints (often `http://localhost:8000`; use another port if that one is already in use).

### Shortcuts

At the top of the sidebar (always visible), on **two rows** (Default / Auto, then Vibes / Random):

- **Default** — Static baseline: white bit on black, default arm lengths (no animated length), neutral rotation, auto rotate and auto length off, default stroke/center/laser settings. Same as a fresh load.
- **Auto** — Seed 1 with animated motion: auto rotate and auto length on, lengths/pose from `applySeed(1)` (white on black, same defaults as before).
- **Vibes** — Gradient background (default palette), black bit, random seed for lengths and pose, motion off; stroke/center/lasers match defaults.
- **Random** — Randomizes seed, colors, background mode, toggles, and geometry sliders.

### Sidebar sections

Sections collapse in an accordion (only one open at a time). **Shortcuts** and **Export** stay visible.

- **Arms** — Axis lengths, auto length, reset lengths, stroke thickness, center radius.
- **Laser Guides** — On/off, thickness, opacity.
- **Pose** — Reset (isometric view, turns off auto rotate), auto rotate.
- **Style** — Bit color; solid or gradient background (gradient aligned to a projected axis, 2–4 stops).
- **Variation (Seed)** — One seed sets arm lengths and rotation (turn off auto rotate to see the pose).
- **Export** — PNG (includes background), SVG.

### Details

See [NOTES.md](NOTES.md) for local dev tips and preset behavior. Changes are summarized in [CHANGELOG.md](CHANGELOG.md).

The code is organized so the caltrop geometry and state object can be extended later (additional arms, color systems, camera presets, etc.) while keeping the current artifact focused on graphic, non‑photoreal output.
