## Tracebit Caltrops 3D Visualizer

Flat, graphic Three.js tool for exploring a 3‑axis caltrop mark (X/Y/Z arms plus welded center sphere) and exporting candidate variable logos.

### Running it

- Open `index.html` directly in a modern browser, or
- Serve the folder with a simple static server (for example: `python -m http.server` from this directory) and visit `http://localhost:8000`.

### Controls

- **Rotate / Zoom**: Use mouse drag + scroll (OrbitControls, when available).
- **X / Y / Z Axis sliders**: Adjust the length of each arm independently in real time.
- **Reset Pose**: Return camera and caltrop to a neutral three‑quarter view.
- **Isometric**: Snap to an isometric‑style angle that balances all three axes.
- **Auto Rotate**: Toggle a slow, continuous spin for motion studies.
- **Seed controls**: Use `-`, `+`, `Random`, or type a seed value to remap the three arm lengths deterministically within the configured range.
- **Download PNG**: Captures the current pose and lengths at screen resolution using a flat white‑on‑black render, suitable for logo sketching and refinement workflows.

The code is organized so the caltrop geometry and state object can be extended later (additional arms, color systems, camera presets, etc.) while keeping the current artifact focused on graphic, non‑photoreal output.

