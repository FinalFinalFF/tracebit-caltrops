# Notes

## Running locally

Use a static server from this directory (`python -m http.server` or any port). If the browser shows JSON `{"detail":"Not Found"}`, you are hitting a different process (for example FastAPI on the same port), not this static site.

## Preset shortcuts

| Shortcut | Intent |
|----------|--------|
| **Default** | Seed 1, solid black background, white bit, auto rotate + auto length on, default stroke/center/lasers, default gradient palette in state (for when switching to gradient). |
| **Vibes** | Gradient with `DEFAULT_GRADIENT_COLORS`, black bit, random seed (lengths + pose), auto motion off, stroke / center / laser guides match **Default**. |
| **Random** | Random seed, random bit and background (solid or gradient), random toggles and geometry-related sliders. |

## State and rendering

- `state` in `main.js` holds all parameters; `syncFullUI()` keeps the sidebar in sync after shortcuts.
- Background gradient is drawn to a 2D canvas → `CanvasTexture` → `scene.background` so PNG export matches the view.
- One **Seed** value drives lengths and Euler rotation via a single `mulberry32` stream; use **Auto Rotate** off to see a stable seeded pose.
