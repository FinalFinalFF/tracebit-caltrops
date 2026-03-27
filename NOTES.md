# Notes

## Running locally

Use a static server from this directory (`python -m http.server` or any port). If the browser shows JSON `{"detail":"Not Found"}`, you are hitting a different process (for example FastAPI on the same port), not this static site.

## Default geometry (sliders)

Defined in `main.js` as **`DEFAULT_ARM_LENGTHS`**, **`DEFAULT_THICKNESS`**, **`DEFAULT_SPHERE_RADIUS`**:

| Control | Value |
|---------|-------|
| X / Y / Z length | **1.00** / **1.00** / **1.30** |
| Stroke thickness | **0.075** |
| Center radius | **0.100** |

**Reset** (Arms) restores `DEFAULT_ARM_LENGTHS` and turns off Auto Length. **Default** shortcut restores these plus stroke/center radius and laser defaults.

## Preset shortcuts

The bar uses **two rows**: **Default** and **Auto** on the first row; **Vibes** and **Random** on the second.

| Shortcut | Intent |
|----------|--------|
| **Default** | Seed 1 (display/export), solid black, white bit, **default arm lengths** (`DEFAULT_ARM_LENGTHS`), **zero rotation**, auto rotate + auto length **off**, default stroke/center/lasers; isometric camera. |
| **Auto** | Seed 1 + **`applySeed(1)`** for lengths/pose, auto rotate + auto length **on**, same solid black / white bit / defaults as the old Default shortcut. |
| **Vibes** | Gradient with `DEFAULT_GRADIENT_COLORS`, black bit, random seed (lengths + pose), auto motion off, stroke / center / laser guides match defaults. |
| **Random** | Random seed, random bit and background (solid or gradient), random toggles and geometry-related sliders. |

## State and rendering

- `state` in `main.js` holds all parameters; `syncFullUI()` keeps the sidebar in sync after shortcuts.
- Background gradient is drawn to a 2D canvas → `CanvasTexture` → `scene.background` so PNG export matches the view.
- One **Seed** value drives lengths and Euler rotation via a single `mulberry32` stream; use **Auto Rotate** off to see a stable seeded pose.
