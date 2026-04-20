// Tracebit Caltrops — 2D stroke rendering with 3D-projected, camera-facing rectangles.
// Arms always appear as perfect 2D rectangles with 90° corners regardless of 3D rotation.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

let scene, camera, renderer, controls;
let caltropGroup; // rotation tracker only — no visible children
let armMeshX, armMeshY, armMeshZ, armMeshDiag;
/** Background-colored circles placed at arm-edge intersections to create inner fillets. */
let filletCircles = [];
let guideMeshX, guideMeshY, guideMeshZ, guideMeshDiag;
let gridLineSegments;
let gridLineMaterial;

let bgCanvas;
let bgTexture;
/** 2D canvas overlay positioned over the WebGL canvas; used to draw inner fillets on top of the arms. */
let filletOverlayCanvas;
let filletOverlayCtx;
/** Last projected arm directions in camera space (same order as arms in updateArmProjections). */
let lastArmScreenProjection = [
  { px: 1, py: 0, projFactor: 1 },
  { px: 0, py: 1, projFactor: 1 },
  { px: 0, py: 1, projFactor: 1 },
  { px: 1, py: 0, projFactor: 1 },
];
/** Normalized canvas-space direction (x right, y down) for gradient; reused when axis is edge-on. */
let lastGradientCanvasDir = { dx: 1, dy: 0 };

const ARM_LOCAL_DIRS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];
/** Default fourth-arm direction in local space: body diagonal (1,1,1) in Y-up coordinates. */
const DEFAULT_FOURTH_ARM_AZIMUTH_DEG = 45;
const DEFAULT_FOURTH_ARM_ELEVATION_DEG = (Math.asin(1 / Math.sqrt(3)) * 180) / Math.PI;
const fourthArmDirScratch = new THREE.Vector3();

/** Y-up: azimuth in XZ (from +Z toward +X); elevation from horizontal toward +Y. */
function getFourthArmLocalDir(target) {
  const elev = THREE.MathUtils.degToRad(state.fourthArmElevationDeg);
  const azim = THREE.MathUtils.degToRad(state.fourthArmAzimuthDeg);
  const ch = Math.cos(elev);
  return target.set(ch * Math.sin(azim), Math.sin(elev), ch * Math.cos(azim)).normalize();
}

const LASER_GUIDE_DEFAULT_THICKNESS = 0.002;
const LASER_GUIDE_DEFAULT_OPACITY = 0.95;
const LASER_GUIDE_EPS = 1e-6;

/** Default X / Y / Z arm lengths (sliders and Reset). */
const DEFAULT_ARM_LENGTHS = Object.freeze({ lenX: 2.0, lenY: 1.0, lenZ: 2.0, lenDiag: 1.0 });

const DEFAULT_THICKNESS = 0.1;
const DEFAULT_FILLET_RADIUS = 0.01;
const DEFAULT_CAMERA_POSITION = Object.freeze({ x: 4.21, y: 0.91, z: 5.42 });

/** Default gradient stops (Shortcuts Default / Vibes). */
const DEFAULT_GRADIENT_COLORS = Object.freeze(["#8a9a8e", "#f5e6e8", "#c45c3e", "#2a1810"]);

/** Default second-radial stops (independent layer on top). */
const DEFAULT_GRADIENT2_COLORS = Object.freeze(["#ffffff", "#1a1a1a", "#BA95BD", "#000000"]);

/** Quick-pick swatches for all color controls (hex field + native picker). */
const PALETTE_PRESET_HEX = Object.freeze([
  "#EBEBEB",
  "#BA95BD",
  "#8A3C90",
  "#BD3B43",
  "#8a9a8e",
  "#f5e6e8",
  "#c45c3e",
  "#436083",
  "#BFBDBB",
  "#FFB2B5",
  "#FFEDC0",
]);

const state = {
  lenX: DEFAULT_ARM_LENGTHS.lenX,
  lenY: DEFAULT_ARM_LENGTHS.lenY,
  lenZ: DEFAULT_ARM_LENGTHS.lenZ,
  lenDiag: DEFAULT_ARM_LENGTHS.lenDiag,
  showFourthArm: false,
  fourthArmAzimuthDeg: DEFAULT_FOURTH_ARM_AZIMUTH_DEG,
  fourthArmElevationDeg: DEFAULT_FOURTH_ARM_ELEVATION_DEG,
  thickness: DEFAULT_THICKNESS,
  filletRadius: DEFAULT_FILLET_RADIUS,
  autoRotate: false,
  autoLength: false,
  /** Minimum angle (deg) between any axis-plane and the viewing direction during Auto Rotate.
   *  Higher values keep planes from going edge-on (less overlap of axis lines in the view).
   *  ~35° = isometric pose / pure spin around the view axis. */
  planeAngleLimitDeg: 45,
  showLaserGuides: false,
  laserGuideThickness: LASER_GUIDE_DEFAULT_THICKNESS,
  laserGuideOpacity: LASER_GUIDE_DEFAULT_OPACITY,
  seed: 1,
  backgroundMode: "solid",
  solidBackgroundColor: "#000000",
  /** "linear" | "radial" — only when backgroundMode is gradient */
  gradientType: "linear",
  /** Radial outer radius as a fraction of half the canvas diagonal (0.02–3). */
  gradientRadialRadius: 0.55,
  /** Ellipse semi-axis multipliers vs. base radius (1 = circle). */
  gradientRadialWidth: 1,
  gradientRadialHeight: 1,
  /** Center offset as a fraction of full canvas width / height (−0.5 … 0.5). */
  gradientRadialOffsetX: 0,
  gradientRadialOffsetY: 0,
  /** Fills the canvas before the radial; also the outer stop for 1-color radial. */
  gradientRadialCanvasBackground: "#000000",
  /** Second radial drawn on top of the first (radial gradient mode only). */
  gradientRadial2Enabled: false,
  gradientRadial2Radius: 0.35,
  gradientRadial2Width: 1,
  gradientRadial2Height: 1,
  gradientRadial2OffsetX: 0.2,
  gradientRadial2OffsetY: -0.15,
  gradientRadial2ColorCount: 2,
  gradientRadial2Colors: [...DEFAULT_GRADIENT2_COLORS],
  gradientAlignAxis: 0,
  gradientColorCount: 3,
  gradientColors: [...DEFAULT_GRADIENT_COLORS],
  bitColorHex: "#ffffff",
  showGridLines: false,
  /** Lines parallel to each axis on one coordinate face (see updateGridLines); count per side of origin. */
  gridCountX: 4,
  gridCountY: 4,
  gridCountZ: 4,
  /** World-space spacing between adjacent parallel lines (perpendicular offset). */
  gridSpacingX: 0.15,
  gridSpacingY: 0.15,
  gridSpacingZ: 0.15,
};

function init() {
  const container = document.getElementById("canvas-container");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const aspect = width / height;
  const frustumSize = 4;

  camera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    50
  );
  camera.position.set(DEFAULT_CAMERA_POSITION.x, DEFAULT_CAMERA_POSITION.y, DEFAULT_CAMERA_POSITION.z);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  filletOverlayCanvas = document.createElement("canvas");
  filletOverlayCanvas.style.position = "absolute";
  filletOverlayCanvas.style.top = "0";
  filletOverlayCanvas.style.left = "0";
  filletOverlayCanvas.style.width = "100%";
  filletOverlayCanvas.style.height = "100%";
  filletOverlayCanvas.style.pointerEvents = "none";
  container.appendChild(filletOverlayCanvas);
  filletOverlayCtx = filletOverlayCanvas.getContext("2d");
  resizeFilletOverlay(width, height);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;

  caltropGroup = new THREE.Object3D();

  armMeshX = createArmRect();
  armMeshY = createArmRect();
  armMeshZ = createArmRect();
  armMeshDiag = createArmRect();
  armMeshDiag.visible = false;
  guideMeshX = createGuideRect();
  guideMeshY = createGuideRect();
  guideMeshZ = createGuideRect();
  guideMeshDiag = createGuideRect();
  guideMeshX.visible = false;
  guideMeshY.visible = false;
  guideMeshZ.visible = false;
  guideMeshDiag.visible = false;
  scene.add(guideMeshX);
  scene.add(guideMeshY);
  scene.add(guideMeshZ);
  scene.add(guideMeshDiag);
  scene.add(armMeshX);
  scene.add(armMeshY);
  scene.add(armMeshZ);
  scene.add(armMeshDiag);

  // 6 arm pairs × 4 edge-intersection corners = 24 fillet circles max
  for (let i = 0; i < 24; i++) {
    const circle = createFilletCircle();
    filletCircles.push(circle);
    scene.add(circle);
  }

  gridLineMaterial = new THREE.LineBasicMaterial({
    transparent: true,
    depthWrite: false,
  });
  gridLineSegments = new THREE.LineSegments(new THREE.BufferGeometry(), gridLineMaterial);
  gridLineSegments.visible = false;
  gridLineSegments.renderOrder = -1;
  scene.add(gridLineSegments);

  bgCanvas = document.createElement("canvas");
  bgTexture = new THREE.CanvasTexture(bgCanvas);
  if ("colorSpace" in bgTexture) {
    bgTexture.colorSpace = THREE.SRGBColorSpace;
  }
  bgTexture.minFilter = THREE.LinearFilter;
  bgTexture.magFilter = THREE.LinearFilter;

  window.addEventListener("resize", onWindowResize);

  initUI();
  initAccordionPanels();
  resizeBackgroundCanvas();

  animate();
}

function createArmRect() {
  const geom = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  return new THREE.Mesh(geom, mat);
}

function createFilletCircle() {
  const geom = new THREE.CircleGeometry(1, 32);
  // Color is synced to background each frame via updateFilletColors()
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 1; // renders after arm rects
  mesh.visible = false;
  return mesh;
}

/**
 * Intersect two 2D lines defined by point + direction.
 * Returns [x, y] or null if parallel.
 */
function lineIntersect2D(p1x, p1y, d1x, d1y, p2x, p2y, d2x, d2y) {
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-6) return null;
  const dx = p2x - p1x, dy = p2y - p1y;
  const s = (dx * d2y - dy * d2x) / cross;
  return [p1x + s * d1x, p1y + s * d1y];
}

function createGuideRect() {
  const geom = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: state.laserGuideOpacity,
    depthWrite: false,
  });
  return new THREE.Mesh(geom, mat);
}

function distanceToViewportEdge(directionX, directionY, halfWidth, halfHeight) {
  const maxX = Math.abs(directionX) > LASER_GUIDE_EPS ? halfWidth / Math.abs(directionX) : Infinity;
  const maxY = Math.abs(directionY) > LASER_GUIDE_EPS ? halfHeight / Math.abs(directionY) : Infinity;
  return Math.min(maxX, maxY);
}

/** Half-length along worldDir through origin so the orthographic projection matches laser guides. */
function worldAxisHalfLength(worldDir, camRight, camUp, halfWidth, halfHeight) {
  const px = worldDir.dot(camRight);
  const py = worldDir.dot(camUp);
  const projFactor = Math.sqrt(px * px + py * py);
  if (projFactor <= LASER_GUIDE_EPS) return 0;
  const dirX = px / projFactor;
  const dirY = py / projFactor;
  const halfGuideLength = distanceToViewportEdge(dirX, dirY, halfWidth, halfHeight);
  return halfGuideLength / projFactor;
}

/** Sync fillet circle color to the current background (solid color only). */
function updateFilletColors() {
  const c = new THREE.Color(state.solidBackgroundColor);
  filletCircles.forEach((circle) => {
    if (circle.material) circle.material.color.copy(c);
  });
}

function updateGuideMaterialVisuals() {
  [guideMeshX, guideMeshY, guideMeshZ, guideMeshDiag].forEach((guide) => {
    if (!guide || !guide.material) return;
    guide.material.opacity = state.laserGuideOpacity;
    guide.material.needsUpdate = true;
  });
  if (gridLineMaterial) {
    gridLineMaterial.opacity = state.laserGuideOpacity * 0.45;
    gridLineMaterial.needsUpdate = true;
  }
}

function updateBitColorVisuals() {
  const c = new THREE.Color(state.bitColorHex);
  [armMeshX, armMeshY, armMeshZ, armMeshDiag].forEach((mesh) => {
    if (mesh && mesh.material) mesh.material.color.copy(c);
  });
  updateFilletColors();
  [guideMeshX, guideMeshY, guideMeshZ, guideMeshDiag].forEach((guide) => {
    if (guide && guide.material) guide.material.color.copy(c);
  });
  if (gridLineMaterial) {
    gridLineMaterial.color.copy(c);
    gridLineMaterial.opacity = state.laserGuideOpacity * 0.45;
    gridLineMaterial.needsUpdate = true;
  }
}

const gridOffsetScratch = new THREE.Vector3();

function pushGridLineWorld(flat, origin, axisWorld, extent) {
  const o = origin;
  const d = axisWorld;
  flat.push(
    o.x - d.x * extent,
    o.y - d.y * extent,
    o.z - d.z * extent,
    o.x + d.x * extent,
    o.y + d.y * extent,
    o.z + d.z * extent
  );
}

// Project each arm's 3D direction onto the camera plane, then orient
// camera-facing rectangles along the resulting 2D directions.
function updateArmProjections() {
  camera.updateMatrixWorld();

  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  camera.matrixWorld.extractBasis(camRight, camUp, camFwd);

  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(caltropGroup.rotation);
  const halfWidth = (camera.right - camera.left) * 0.5;
  const halfHeight = (camera.top - camera.bottom) * 0.5;

  getFourthArmLocalDir(fourthArmDirScratch);
  const arms = [
    { mesh: armMeshX, guide: guideMeshX, dir: ARM_LOCAL_DIRS[0], len: state.lenX, draw: true },
    { mesh: armMeshY, guide: guideMeshY, dir: ARM_LOCAL_DIRS[1], len: state.lenY, draw: true },
    { mesh: armMeshZ, guide: guideMeshZ, dir: ARM_LOCAL_DIRS[2], len: state.lenZ, draw: true },
    {
      mesh: armMeshDiag,
      guide: guideMeshDiag,
      dir: fourthArmDirScratch,
      len: state.lenDiag,
      draw: state.showFourthArm,
    },
  ];

  arms.forEach(({ mesh, guide, dir, len, draw }, armIndex) => {
    const worldDir = dir.clone().applyMatrix4(rotMatrix);

    const px = worldDir.dot(camRight);
    const py = worldDir.dot(camUp);

    const angle = Math.atan2(py, px);
    const projFactor = Math.sqrt(px * px + py * py);
    lastArmScreenProjection[armIndex] = { px, py, projFactor };
    const projectedLen = Math.max(projFactor * len, 0.001);

    if (!draw) {
      mesh.visible = false;
      if (guide) guide.visible = false;
      return;
    }

    mesh.visible = true;
    mesh.quaternion.copy(camera.quaternion);
    mesh.rotateZ(angle);

    mesh.scale.set(projectedLen, state.thickness, 1);
    mesh.position.set(0, 0, 0);

    if (guide) {
      if (state.showLaserGuides && projFactor > LASER_GUIDE_EPS) {
        const dirX = px / projFactor;
        const dirY = py / projFactor;
        const halfGuideLength = distanceToViewportEdge(dirX, dirY, halfWidth, halfHeight);
        const fullGuideLength = halfGuideLength * 2;
        guide.visible = true;
        guide.quaternion.copy(camera.quaternion);
        guide.rotateZ(angle);
        guide.scale.set(fullGuideLength, Math.max(state.laserGuideThickness, 0.001), 1);
        guide.position.set(0, 0, 0);
      } else {
        guide.visible = false;
      }
    }
  });

  updateFilletCircles(arms);
}

function updateFilletCircles(arms) {
  // WebGL fillet circles aren't used — arms + fillets are fully drawn on the 2D overlay.
  for (let i = 0; i < filletCircles.length; i++) filletCircles[i].visible = false;
  // Hide the WebGL arm meshes too; the overlay is now authoritative for the logo shape.
  [armMeshX, armMeshY, armMeshZ, armMeshDiag].forEach((m) => { if (m) m.visible = false; });

  if (!filletOverlayCtx || !filletOverlayCanvas) return;

  const canvasW = filletOverlayCanvas.width;
  const canvasH = filletOverlayCanvas.height;
  const ctx = filletOverlayCtx;
  ctx.clearRect(0, 0, canvasW, canvasH);

  const hw = state.thickness / 2;
  const r = state.filletRadius;

  const frustumW = camera.right - camera.left;
  const scale = canvasW / frustumW;
  const halfW = canvasW / 2;
  const halfH = canvasH / 2;
  const toPxX = (x) => halfW + x * scale;
  const toPxY = (y) => halfH - y * scale;

  // Each visible arm is rendered bidirectionally (−halfLen…+halfLen through origin).
  const armList = [];
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i];
    const proj = lastArmScreenProjection[i];
    if (!arm.draw || proj.projFactor < LASER_GUIDE_EPS) continue;
    const nx = proj.px / proj.projFactor;
    const ny = proj.py / proj.projFactor;
    const halfLen = (proj.projFactor * arm.len) / 2;
    if (halfLen <= hw) continue;
    armList.push({ nx, ny, halfLen });
  }
  if (armList.length === 0) return;

  ctx.fillStyle = state.bitColorHex;

  // Pass 1 — draw each arm as a rotated filled rectangle. Robust across all poses:
  // the union is always a well-formed shape, no self-intersecting polygon walks.
  for (const a of armList) {
    const { nx, ny, halfLen } = a;
    const lx = -ny, ly = nx; // left perpendicular
    ctx.beginPath();
    ctx.moveTo(toPxX( nx*halfLen + lx*hw), toPxY( ny*halfLen + ly*hw));
    ctx.lineTo(toPxX( nx*halfLen - lx*hw), toPxY( ny*halfLen - ly*hw));
    ctx.lineTo(toPxX(-nx*halfLen - lx*hw), toPxY(-ny*halfLen - ly*hw));
    ctx.lineTo(toPxX(-nx*halfLen + lx*hw), toPxY(-ny*halfLen + ly*hw));
    ctx.closePath();
    ctx.fill();
  }

  if (r <= 0.0005) return;

  // Pass 2 — at each concave corner between CCW-adjacent half-arms, add an additive
  // fillet patch (material filling the sharp inside corner with a smooth arc).
  const halves = [];
  for (const a of armList) {
    halves.push({ nx: a.nx, ny: a.ny, halfLen: a.halfLen, angle: Math.atan2(a.ny, a.nx) });
    halves.push({ nx: -a.nx, ny: -a.ny, halfLen: a.halfLen, angle: Math.atan2(-a.ny, -a.nx) });
  }
  halves.sort((a, b) => a.angle - b.angle);

  const n = halves.length;
  for (let i = 0; i < n; i++) {
    const h = halves[i];
    const nxt = halves[(i + 1) % n];
    let gap = nxt.angle - h.angle;
    if (gap < 0) gap += Math.PI * 2;
    // Skip degenerate pairs: near-parallel (no meaningful corner) or near-opposite (same axis).
    if (gap <= 0.02 || gap >= Math.PI - 0.02) continue;

    // h's LEFT edge meets nxt's RIGHT edge at the concave corner C.
    const C = lineIntersect2D(
      -h.ny*hw, h.nx*hw, h.nx, h.ny,
      nxt.ny*hw, -nxt.nx*hw, nxt.nx, nxt.ny
    );
    if (!C) continue;

    // Fade the fillet radius as C drifts outward from origin. Full radius when C is
    // near the center (standard concave corners); tapers to zero as C approaches the
    // tip — avoids tooth artifacts for near-parallel axes where C sits far out.
    const maxArm = Math.max(h.halfLen, nxt.halfLen);
    const dC = Math.hypot(C[0], C[1]);
    const fadeStart = maxArm * 0.35;
    const fadeEnd = maxArm * 0.7;
    if (dC >= fadeEnd) continue;
    const fade = dC <= fadeStart ? 1 : 1 - (dC - fadeStart) / (fadeEnd - fadeStart);
    const radius = r * fade;
    if (radius <= 0.0005) continue;

    const gapHalf = gap / 2;
    const tanHalf = Math.tan(gapHalf);
    if (tanHalf <= 1e-6) continue;
    let tanLen = radius / tanHalf;

    // Clamp tanLen so tangent points stay within each arm's forward extent.
    const cDotH = C[0]*h.nx + C[1]*h.ny;
    const cDotN = C[0]*nxt.nx + C[1]*nxt.ny;
    const availMax = Math.min(h.halfLen - cDotH, nxt.halfLen - cDotN);
    if (availMax <= 1e-4) continue;
    if (tanLen > availMax) tanLen = availMax;

    const effR = tanLen * tanHalf;
    if (effR <= 1e-4) continue;

    const T1x = C[0] + h.nx * tanLen,   T1y = C[1] + h.ny * tanLen;
    const T2x = C[0] + nxt.nx * tanLen, T2y = C[1] + nxt.ny * tanLen;

    // Additive patch: T1 → arc (tangent at T1 and T2, in the non-material wedge) → T2 → C → T1.
    // arcTo naturally places the arc on the small-angle side at C — the non-material wedge.
    ctx.beginPath();
    ctx.moveTo(toPxX(T1x), toPxY(T1y));
    ctx.arcTo(toPxX(C[0]), toPxY(C[1]), toPxX(T2x), toPxY(T2y), effR * scale);
    ctx.lineTo(toPxX(C[0]), toPxY(C[1]));
    ctx.closePath();
    ctx.fill();
  }
}

function onWindowResize() {
  const container = document.getElementById("canvas-container");
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const aspect = width / height;
  const frustumSize = 4;

  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  resizeFilletOverlay(width, height);
  resizeBackgroundCanvas();
}

function resizeFilletOverlay(cssW, cssH) {
  if (!filletOverlayCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  filletOverlayCanvas.width = Math.max(1, Math.round(cssW * dpr));
  filletOverlayCanvas.height = Math.max(1, Math.round(cssH * dpr));
}

function resizeBackgroundCanvas() {
  if (!renderer || !bgCanvas) return;
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  if (bgCanvas.width !== w || bgCanvas.height !== h) {
    bgCanvas.width = w;
    bgCanvas.height = h;
    if (bgTexture) bgTexture.needsUpdate = true;
  }
}

function clampGradientColorCount(raw) {
  return Math.max(1, Math.min(4, raw | 0));
}

/** Parse #rgb / #rrggbb for gradient stops (avoids dark halos when fading to transparent). */
function hexColorToRgb(hex) {
  let h = String(hex).trim();
  if (!h.startsWith("#")) return null;
  h = h.slice(1);
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return null;
  return { r, g, b };
}

/**
 * One radial layer in canvas pixel space (ellipse covers the viewport via transformed fill).
 * @param {string} outerOneColorStop - outer stop when n === 1 (opaque fade target)
 * @param {{ oneColorTransparentOuter?: boolean }} [opts] - if true and n===1, outer stop is same hue at alpha 0 (clean blend over layers below)
 */
function fillCanvasRadialGradientLayer(ctx, w, h, outerOneColorStop, radiusFrac, widthMul, heightMul, ox, oy, colors, n, opts) {
  const halfDiag = Math.hypot(w, h) * 0.5;
  const base = Math.max(8, halfDiag * Math.max(0.02, Math.min(3, radiusFrac)));
  const rx = base * Math.max(0.05, Math.min(8, widthMul));
  const ry = base * Math.max(0.05, Math.min(8, heightMul));
  const oox = Math.max(-0.5, Math.min(0.5, ox));
  const ooy = Math.max(-0.5, Math.min(0.5, oy));
  const gc = w * 0.5 + oox * w;
  const gr = h * 0.5 + ooy * h;

  const gRadial = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  if (n === 1) {
    gRadial.addColorStop(0, colors[0]);
    if (opts?.oneColorTransparentOuter) {
      const rgb = hexColorToRgb(colors[0]);
      gRadial.addColorStop(1, rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},0)` : "rgba(0,0,0,0)");
    } else {
      gRadial.addColorStop(1, outerOneColorStop);
    }
  } else {
    for (let i = 0; i < n; i++) {
      gRadial.addColorStop(i / (n - 1), colors[i]);
    }
  }

  ctx.save();
  ctx.translate(gc, gr);
  ctx.scale(rx, ry);
  ctx.fillStyle = gRadial;
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const [px, py] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ]) {
    const u = (px - gc) / rx;
    const v = (py - gr) / ry;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }
  const pad = 2;
  ctx.fillRect(uMin - pad, vMin - pad, uMax - uMin + 2 * pad, vMax - vMin + 2 * pad);
  ctx.restore();
}

function updateBackground() {
  if (!bgCanvas || !bgTexture || !scene) return;

  updateFilletColors();
  resizeBackgroundCanvas();

  if (state.backgroundMode === "solid") {
    scene.background = new THREE.Color(state.solidBackgroundColor);
    return;
  }

  const w = bgCanvas.width;
  const h = bgCanvas.height;
  const ctx = bgCanvas.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const n = clampGradientColorCount(state.gradientColorCount);

  let g;
  if (state.gradientType === "radial") {
    ctx.fillStyle = state.gradientRadialCanvasBackground;
    ctx.fillRect(0, 0, w, h);

    fillCanvasRadialGradientLayer(
      ctx,
      w,
      h,
      state.gradientRadialCanvasBackground,
      state.gradientRadialRadius,
      state.gradientRadialWidth,
      state.gradientRadialHeight,
      state.gradientRadialOffsetX,
      state.gradientRadialOffsetY,
      state.gradientColors,
      n
    );

    if (state.gradientRadial2Enabled) {
      const n2 = clampGradientColorCount(state.gradientRadial2ColorCount);
      fillCanvasRadialGradientLayer(
        ctx,
        w,
        h,
        "",
        state.gradientRadial2Radius,
        state.gradientRadial2Width,
        state.gradientRadial2Height,
        state.gradientRadial2OffsetX,
        state.gradientRadial2OffsetY,
        state.gradientRadial2Colors,
        n2,
        { oneColorTransparentOuter: n2 === 1 }
      );
    }
  } else if (n === 1) {
    ctx.fillStyle = state.gradientColors[0];
    ctx.fillRect(0, 0, w, h);
  } else {
    const axis = Math.max(0, Math.min(3, state.gradientAlignAxis | 0));
    const proj = lastArmScreenProjection[axis];
    let dx = lastGradientCanvasDir.dx;
    let dyC = lastGradientCanvasDir.dy;
    if (proj.projFactor > LASER_GUIDE_EPS) {
      const ndx = proj.px / proj.projFactor;
      const ndy = -proj.py / proj.projFactor;
      const len = Math.hypot(ndx, ndy);
      if (len > LASER_GUIDE_EPS) {
        dx = ndx / len;
        dyC = ndy / len;
        lastGradientCanvasDir = { dx, dy: dyC };
      }
    }
    const L = Math.hypot(w, h) * 0.5;
    const x0 = cx - dx * L;
    const y0 = cy - dyC * L;
    const x1 = cx + dx * L;
    const y1 = cy + dyC * L;
    g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < n; i++) {
      g.addColorStop(i / (n - 1), state.gradientColors[i]);
    }
  }

  if (g) {
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  bgTexture.needsUpdate = true;
  scene.background = bgTexture;
}

function updateGridLines() {
  if (!gridLineSegments || !gridLineSegments.geometry || !camera) return;

  if (!state.showGridLines) {
    gridLineSegments.visible = false;
    return;
  }

  camera.updateMatrixWorld();
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  camera.matrixWorld.extractBasis(camRight, camUp, camFwd);

  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(caltropGroup.rotation);
  const wx = ARM_LOCAL_DIRS[0].clone().applyMatrix4(rotMatrix).normalize();
  const wy = ARM_LOCAL_DIRS[1].clone().applyMatrix4(rotMatrix).normalize();
  const wz = ARM_LOCAL_DIRS[2].clone().applyMatrix4(rotMatrix).normalize();

  const halfW = (camera.right - camera.left) * 0.5;
  const halfH = (camera.top - camera.bottom) * 0.5;
  const extent = Math.max(halfW, halfH) * 5;

  const sx = Math.max(0.001, state.gridSpacingX);
  const sy = Math.max(0.001, state.gridSpacingY);
  const sz = Math.max(0.001, state.gridSpacingZ);
  const nx = Math.max(0, state.gridCountX | 0);
  const ny = Math.max(0, state.gridCountY | 0);
  const nz = Math.max(0, state.gridCountZ | 0);

  const positions = [];
  const o = gridOffsetScratch;

  if (!state.showLaserGuides) {
    const axLen = worldAxisHalfLength(wx, camRight, camUp, halfW, halfH);
    const ayLen = worldAxisHalfLength(wy, camRight, camUp, halfW, halfH);
    const azLen = worldAxisHalfLength(wz, camRight, camUp, halfW, halfH);
    o.set(0, 0, 0);
    if (axLen > LASER_GUIDE_EPS) pushGridLineWorld(positions, o, wx, axLen);
    if (ayLen > LASER_GUIDE_EPS) pushGridLineWorld(positions, o, wy, ayLen);
    if (azLen > LASER_GUIDE_EPS) pushGridLineWorld(positions, o, wz, azLen);
  }

  // One offset direction per family (two planes each drew a “first” line at the same spacing).
  // X-parallel: XY plane only (±Y). Y-parallel: XY only (±X). Z-parallel: XZ only (±X).
  for (let j = 1; j <= nx; j++) {
    o.copy(wy).multiplyScalar(j * sx);
    pushGridLineWorld(positions, o, wx, extent);
    o.negate();
    pushGridLineWorld(positions, o, wx, extent);
  }
  for (let i = 1; i <= ny; i++) {
    o.copy(wx).multiplyScalar(i * sy);
    pushGridLineWorld(positions, o, wy, extent);
    o.negate();
    pushGridLineWorld(positions, o, wy, extent);
  }
  for (let i = 1; i <= nz; i++) {
    o.copy(wx).multiplyScalar(i * sz);
    pushGridLineWorld(positions, o, wz, extent);
    o.negate();
    pushGridLineWorld(positions, o, wz, extent);
  }

  if (positions.length === 0) {
    gridLineSegments.visible = false;
    return;
  }

  const posAttr = new THREE.BufferAttribute(new Float32Array(positions), 3);
  gridLineSegments.geometry.setAttribute("position", posAttr);
  gridLineSegments.geometry.computeBoundingSphere();
  gridLineSegments.visible = true;
}

function animate() {
  requestAnimationFrame(animate);

  if (state.autoRotate) {
    const t = performance.now() * 0.0003;
    // Compose rotation as: spin around the view axis + bounded tilt perpendicular to it.
    // Spin-around-V preserves each axis's angle with V, so no plane can go edge-on.
    // Tilt adds motion away from isometric; magnitude is capped by planeAngleLimitDeg.
    const baselineDeg = 35.264; // all-axes plane angle at isometric pose
    const limit = Math.max(0, state.planeAngleLimitDeg || 0);
    const maxTiltDeg = Math.max(0, baselineDeg - limit);
    const maxTiltRad = THREE.MathUtils.degToRad(maxTiltDeg);
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    const camRight = new THREE.Vector3();
    camera.matrixWorld.extractBasis(camRight, new THREE.Vector3(), new THREE.Vector3());
    const qSpin = new THREE.Quaternion().setFromAxisAngle(viewDir, t);
    const qTilt = new THREE.Quaternion().setFromAxisAngle(
      camRight,
      Math.sin(t * 0.67) * maxTiltRad
    );
    caltropGroup.quaternion.copy(qTilt).multiply(qSpin);
    if (state._ui) syncPoseSlidersFromRotation();
  }

  if (state.autoLength) {
    const t = performance.now() * 0.0005;
    const baseX = DEFAULT_ARM_LENGTHS.lenX;
    const baseY = DEFAULT_ARM_LENGTHS.lenY;
    const baseZ = DEFAULT_ARM_LENGTHS.lenZ;
    const amp = 0.35;

    state.lenX = baseX + Math.sin(t * 1.0) * amp;
    state.lenY = baseY + Math.sin(t * 1.7 + 1.2) * amp;
    state.lenZ = baseZ + Math.sin(t * 2.3 + 2.4) * amp;
    if (state.showFourthArm) {
      const baseD = DEFAULT_ARM_LENGTHS.lenDiag;
      state.lenDiag = baseD + Math.sin(t * 1.9 + 0.4) * amp;
    }

    if (state._ui) {
      const { lenXInput, lenYInput, lenZInput, lenDiagInput, lenXValue, lenYValue, lenZValue, lenDiagValue } =
        state._ui;
      if (lenXInput) lenXInput.value = state.lenX.toString();
      if (lenYInput) lenYInput.value = state.lenY.toString();
      if (lenZInput) lenZInput.value = state.lenZ.toString();
      if (lenDiagInput && state.showFourthArm) lenDiagInput.value = state.lenDiag.toString();
      if (lenXValue) lenXValue.value = state.lenX.toFixed(2);
      if (lenYValue) lenYValue.value = state.lenY.toFixed(2);
      if (lenZValue) lenZValue.value = state.lenZ.toFixed(2);
      if (lenDiagValue && state.showFourthArm) lenDiagValue.value = state.lenDiag.toFixed(2);
    }
  }

  updateArmProjections();
  updateBackground();
  updateGridLines();

  if (controls && typeof controls.update === "function") {
    controls.update();
  }
  renderer.render(scene, camera);
}

// --- UI / Seeds -------------------------------------------------------------

function clampToRangeBounds(v, rangeEl, isInt) {
  if (!rangeEl) return null;
  const min = parseFloat(rangeEl.min);
  const max = parseFloat(rangeEl.max);
  if (Number.isNaN(v)) return null;
  let c = Math.min(max, Math.max(min, v));
  if (isInt) c = Math.round(c);
  return c;
}

/** Map degrees to −180…180 for pose sliders. */
function normalizeDegForPoseUi(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function syncPoseSlidersFromRotation() {
  const ui = state._ui;
  if (!ui || !caltropGroup || !ui.poseRotXInput) return;
  const r = caltropGroup.rotation;
  const ex = normalizeDegForPoseUi(THREE.MathUtils.radToDeg(r.x));
  const ey = normalizeDegForPoseUi(THREE.MathUtils.radToDeg(r.y));
  const ez = normalizeDegForPoseUi(THREE.MathUtils.radToDeg(r.z));
  ui.poseRotXInput.value = ex.toFixed(1);
  ui.poseRotYInput.value = ey.toFixed(1);
  ui.poseRotZInput.value = ez.toFixed(1);
  if (ui.poseRotXValue) ui.poseRotXValue.value = ex.toFixed(1);
  if (ui.poseRotYValue) ui.poseRotYValue.value = ey.toFixed(1);
  if (ui.poseRotZValue) ui.poseRotZValue.value = ez.toFixed(1);
}

function syncHexFieldsFromColorPickers() {
  document.querySelectorAll(".color-control-wrap").forEach((wrap) => {
    const picker = wrap.querySelector('input[type="color"]');
    const hex = wrap.querySelector(".color-hex-input");
    if (picker && hex) hex.value = picker.value;
  });
}

function mountColorPresetsAndHex(colorInput) {
  if (!colorInput || colorInput.dataset.colorEnhance === "1") return;
  colorInput.dataset.colorEnhance = "1";
  const wrap = document.createElement("div");
  wrap.className = "color-control-wrap";
  const parent = colorInput.parentNode;
  parent.insertBefore(wrap, colorInput);
  wrap.appendChild(colorInput);

  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "color-hex-input";
  hexInput.setAttribute("inputmode", "text");
  hexInput.setAttribute("autocomplete", "off");
  hexInput.setAttribute("spellcheck", "false");
  hexInput.maxLength = 7;
  hexInput.value = colorInput.value;

  const presetRow = document.createElement("div");
  presetRow.className = "color-preset-row";
  PALETTE_PRESET_HEX.forEach((hex) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-preset-swatch";
    b.style.backgroundColor = hex;
    const label = hex.toUpperCase();
    b.title = label;
    b.setAttribute("aria-label", `Palette ${label}`);
    b.addEventListener("click", () => {
      const v = hex.toLowerCase();
      colorInput.value = v;
      hexInput.value = v;
      colorInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    presetRow.appendChild(b);
  });

  wrap.appendChild(hexInput);
  wrap.appendChild(presetRow);

  const syncHexFromPicker = () => {
    hexInput.value = colorInput.value;
  };
  colorInput.addEventListener("input", syncHexFromPicker);

  const applyHexFromField = () => {
    let v = hexInput.value.trim();
    if (!v.startsWith("#")) v = `#${v}`;
    if (!/^#[0-9A-Fa-f]{6}$/.test(v)) return;
    const canon = v.toLowerCase();
    colorInput.value = canon;
    hexInput.value = canon;
    colorInput.dispatchEvent(new Event("input", { bubbles: true }));
  };
  hexInput.addEventListener("change", applyHexFromField);
  hexInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyHexFromField();
    }
  });
}

function initAccordionPanels() {
  const panels = document.querySelectorAll("#controls details.panel-section");
  panels.forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      panels.forEach((other) => {
        if (other !== details) other.open = false;
      });
    });
  });
}

function initUI() {
  const lenXInput = document.getElementById("lenX");
  const lenYInput = document.getElementById("lenY");
  const lenZInput = document.getElementById("lenZ");
  const lenDiagInput = document.getElementById("lenDiag");
  const fourthArmAzimuthInput = document.getElementById("fourthArmAzimuth");
  const fourthArmElevationInput = document.getElementById("fourthArmElevation");
  const thicknessInput = document.getElementById("thickness");
  const filletRadiusInput = document.getElementById("filletRadius");
  const laserGuideThicknessInput = document.getElementById("laserGuideThickness");
  const laserGuideOpacityInput = document.getElementById("laserGuideOpacity");
  const lenXValue = document.getElementById("lenX-value");
  const lenYValue = document.getElementById("lenY-value");
  const lenZValue = document.getElementById("lenZ-value");
  const lenDiagValue = document.getElementById("lenDiag-value");
  const fourthArmAzimuthValue = document.getElementById("fourthArmAzimuth-value");
  const fourthArmElevationValue = document.getElementById("fourthArmElevation-value");
  const thicknessValue = document.getElementById("thickness-value");
  const filletRadiusValue = document.getElementById("filletRadius-value");
  const laserGuideThicknessValue = document.getElementById("laserGuideThickness-value");
  const laserGuideOpacityValue = document.getElementById("laserGuideOpacity-value");
  const planeAngleLimitInput = document.getElementById("planeAngleLimit");
  const planeAngleLimitValue = document.getElementById("planeAngleLimit-value");

  const autoRotateToggle = document.getElementById("autoRotateToggle");
  const autoLengthToggle = document.getElementById("autoLengthToggle");
  const laserGuidesToggle = document.getElementById("laserGuidesToggle");
  const fourthArmToggle = document.getElementById("fourthArmToggle");
  const fourthArmDetailControls = document.getElementById("fourthArmDetailControls");
  const poseRotXInput = document.getElementById("poseRotX");
  const poseRotYInput = document.getElementById("poseRotY");
  const poseRotZInput = document.getElementById("poseRotZ");
  const poseRotXValue = document.getElementById("poseRotX-value");
  const poseRotYValue = document.getElementById("poseRotY-value");
  const poseRotZValue = document.getElementById("poseRotZ-value");
  const poseResetBtn = document.getElementById("poseReset");
  const resetArmLengthsBtn = document.getElementById("resetArmLengths");
  const bitColorInput = document.getElementById("bitColor");

  const seedDisplay = document.getElementById("seed-display");
  const seedPrev = document.getElementById("seedPrev");
  const seedNext = document.getElementById("seedNext");
  const seedRandom = document.getElementById("seedRandom");
  const seedInput = document.getElementById("seedInput");
  const seedGo = document.getElementById("seedGo");

  const downloadPngBtn = document.getElementById("downloadPng");
  const downloadSvgBtn = document.getElementById("downloadSvg");

  const backgroundModeSolidBtn = document.getElementById("backgroundModeSolid");
  const backgroundModeGradientBtn = document.getElementById("backgroundModeGradient");
  const solidBackgroundControls = document.getElementById("solidBackgroundControls");
  const gradientBackgroundControls = document.getElementById("gradientBackgroundControls");
  const solidBackgroundColorInput = document.getElementById("solidBackgroundColor");
  const gradientAlignAxisSelect = document.getElementById("gradientAlignAxis");
  const gradientColorCountSelect = document.getElementById("gradientColorCount");
  const gradientColorInputs = [
    document.getElementById("gradientColor0"),
    document.getElementById("gradientColor1"),
    document.getElementById("gradientColor2"),
    document.getElementById("gradientColor3"),
  ];
  const gradientColor1Wrap = document.getElementById("gradientColor1-wrap");
  const gradientColor2Wrap = document.getElementById("gradientColor2-wrap");
  const gradientColor3Wrap = document.getElementById("gradientColor3-wrap");
  const gradientTypeLinearBtn = document.getElementById("gradientTypeLinear");
  const gradientTypeRadialBtn = document.getElementById("gradientTypeRadial");
  const gradientLinearControls = document.getElementById("gradientLinearControls");
  const gradientRadialControls = document.getElementById("gradientRadialControls");
  const gradientRadialRadiusInput = document.getElementById("gradientRadialRadius");
  const gradientRadialRadiusValue = document.getElementById("gradientRadialRadius-value");
  const gradientRadialWidthInput = document.getElementById("gradientRadialWidth");
  const gradientRadialWidthValue = document.getElementById("gradientRadialWidth-value");
  const gradientRadialHeightInput = document.getElementById("gradientRadialHeight");
  const gradientRadialHeightValue = document.getElementById("gradientRadialHeight-value");
  const gradientRadialOffsetXInput = document.getElementById("gradientRadialOffsetX");
  const gradientRadialOffsetXValue = document.getElementById("gradientRadialOffsetX-value");
  const gradientRadialOffsetYInput = document.getElementById("gradientRadialOffsetY");
  const gradientRadialOffsetYValue = document.getElementById("gradientRadialOffsetY-value");
  const gradientRadialCanvasBackgroundInput = document.getElementById("gradientRadialCanvasBackground");
  const gradientRadial2Toggle = document.getElementById("gradientRadial2Toggle");
  const gradientRadial2DetailControls = document.getElementById("gradientRadial2DetailControls");
  const gradientRadial2RadiusInput = document.getElementById("gradientRadial2Radius");
  const gradientRadial2RadiusValue = document.getElementById("gradientRadial2Radius-value");
  const gradientRadial2WidthInput = document.getElementById("gradientRadial2Width");
  const gradientRadial2WidthValue = document.getElementById("gradientRadial2Width-value");
  const gradientRadial2HeightInput = document.getElementById("gradientRadial2Height");
  const gradientRadial2HeightValue = document.getElementById("gradientRadial2Height-value");
  const gradientRadial2OffsetXInput = document.getElementById("gradientRadial2OffsetX");
  const gradientRadial2OffsetXValue = document.getElementById("gradientRadial2OffsetX-value");
  const gradientRadial2OffsetYInput = document.getElementById("gradientRadial2OffsetY");
  const gradientRadial2OffsetYValue = document.getElementById("gradientRadial2OffsetY-value");
  const gradientRadial2ColorCountSelect = document.getElementById("gradientRadial2ColorCount");
  const gradientRadial2ColorInputs = [
    document.getElementById("gradientRadial2Color0"),
    document.getElementById("gradientRadial2Color1"),
    document.getElementById("gradientRadial2Color2"),
    document.getElementById("gradientRadial2Color3"),
  ];
  const gradientRadial2Color1Wrap = document.getElementById("gradientRadial2Color1-wrap");
  const gradientRadial2Color2Wrap = document.getElementById("gradientRadial2Color2-wrap");
  const gradientRadial2Color3Wrap = document.getElementById("gradientRadial2Color3-wrap");

  const gridLinesToggle = document.getElementById("gridLinesToggle");
  const planeGridDetailControls = document.getElementById("planeGridDetailControls");
  const gridCountXInput = document.getElementById("gridCountX");
  const gridCountYInput = document.getElementById("gridCountY");
  const gridCountZInput = document.getElementById("gridCountZ");
  const gridSpacingXInput = document.getElementById("gridSpacingX");
  const gridSpacingYInput = document.getElementById("gridSpacingY");
  const gridSpacingZInput = document.getElementById("gridSpacingZ");
  const gridCountXValue = document.getElementById("gridCountX-value");
  const gridCountYValue = document.getElementById("gridCountY-value");
  const gridCountZValue = document.getElementById("gridCountZ-value");
  const gridSpacingXValue = document.getElementById("gridSpacingX-value");
  const gridSpacingYValue = document.getElementById("gridSpacingY-value");
  const gridSpacingZValue = document.getElementById("gridSpacingZ-value");

  state._ui = {
    lenXInput, lenYInput, lenZInput, lenDiagInput, fourthArmAzimuthInput, fourthArmElevationInput,
    thicknessInput, filletRadiusInput,
    laserGuideThicknessInput, laserGuideOpacityInput,
    lenXValue, lenYValue, lenZValue, lenDiagValue, fourthArmAzimuthValue, fourthArmElevationValue,
    thicknessValue, filletRadiusValue,
    laserGuideThicknessValue, laserGuideOpacityValue,
    fourthArmToggle,
    gradientRadialRadiusInput,
    gradientRadialWidthInput,
    gradientRadialHeightInput,
    gradientRadialOffsetXInput,
    gradientRadialOffsetYInput,
    gradientRadial2RadiusInput,
    gradientRadial2WidthInput,
    gradientRadial2HeightInput,
    gradientRadial2OffsetXInput,
    gradientRadial2OffsetYInput,
    gridCountXInput, gridCountYInput, gridCountZInput,
    gridSpacingXInput, gridSpacingYInput, gridSpacingZInput,
    poseRotXInput, poseRotYInput, poseRotZInput,
    poseRotXValue, poseRotYValue, poseRotZValue,
  };

  [
    bitColorInput,
    solidBackgroundColorInput,
    gradientRadialCanvasBackgroundInput,
    ...gradientColorInputs,
    ...gradientRadial2ColorInputs,
  ].forEach((el) => {
    mountColorPresetsAndHex(el);
  });

  function updateLengthDisplays() {
    lenXValue.value = state.lenX.toFixed(2);
    lenYValue.value = state.lenY.toFixed(2);
    lenZValue.value = state.lenZ.toFixed(2);
    if (lenDiagValue) lenDiagValue.value = state.lenDiag.toFixed(2);
    if (fourthArmAzimuthValue) fourthArmAzimuthValue.value = state.fourthArmAzimuthDeg.toFixed(0);
    if (fourthArmElevationValue) fourthArmElevationValue.value = state.fourthArmElevationDeg.toFixed(1);
    thicknessValue.value = state.thickness.toFixed(3);
    filletRadiusValue.value = state.filletRadius.toFixed(3);
    if (planeAngleLimitValue) planeAngleLimitValue.value = state.planeAngleLimitDeg.toFixed(0);
    laserGuideThicknessValue.value = state.laserGuideThickness.toFixed(3);
    laserGuideOpacityValue.value = state.laserGuideOpacity.toFixed(2);
    if (gradientRadialRadiusValue) gradientRadialRadiusValue.value = state.gradientRadialRadius.toFixed(2);
    if (gradientRadialWidthValue) gradientRadialWidthValue.value = state.gradientRadialWidth.toFixed(2);
    if (gradientRadialHeightValue) gradientRadialHeightValue.value = state.gradientRadialHeight.toFixed(2);
    if (gradientRadialOffsetXValue) gradientRadialOffsetXValue.value = state.gradientRadialOffsetX.toFixed(3);
    if (gradientRadialOffsetYValue) gradientRadialOffsetYValue.value = state.gradientRadialOffsetY.toFixed(3);
    if (gradientRadial2RadiusValue) gradientRadial2RadiusValue.value = state.gradientRadial2Radius.toFixed(2);
    if (gradientRadial2WidthValue) gradientRadial2WidthValue.value = state.gradientRadial2Width.toFixed(2);
    if (gradientRadial2HeightValue) gradientRadial2HeightValue.value = state.gradientRadial2Height.toFixed(2);
    if (gradientRadial2OffsetXValue) gradientRadial2OffsetXValue.value = state.gradientRadial2OffsetX.toFixed(3);
    if (gradientRadial2OffsetYValue) gradientRadial2OffsetYValue.value = state.gradientRadial2OffsetY.toFixed(3);
    if (gridCountXValue) gridCountXValue.value = String(state.gridCountX);
    if (gridCountYValue) gridCountYValue.value = String(state.gridCountY);
    if (gridCountZValue) gridCountZValue.value = String(state.gridCountZ);
    if (gridSpacingXValue) gridSpacingXValue.value = state.gridSpacingX.toFixed(3);
    if (gridSpacingYValue) gridSpacingYValue.value = state.gridSpacingY.toFixed(3);
    if (gridSpacingZValue) gridSpacingZValue.value = state.gridSpacingZ.toFixed(3);
  }

  function syncSliders() {
    lenXInput.value = state.lenX.toString();
    lenYInput.value = state.lenY.toString();
    lenZInput.value = state.lenZ.toString();
    if (lenDiagInput) lenDiagInput.value = state.lenDiag.toString();
    if (fourthArmAzimuthInput) fourthArmAzimuthInput.value = state.fourthArmAzimuthDeg.toString();
    if (fourthArmElevationInput) fourthArmElevationInput.value = state.fourthArmElevationDeg.toString();
    thicknessInput.value = state.thickness.toString();
    filletRadiusInput.value = state.filletRadius.toString();
    if (planeAngleLimitInput) planeAngleLimitInput.value = state.planeAngleLimitDeg.toString();
    laserGuideThicknessInput.value = state.laserGuideThickness.toString();
    laserGuideOpacityInput.value = state.laserGuideOpacity.toString();
    if (gradientRadialRadiusInput) gradientRadialRadiusInput.value = state.gradientRadialRadius.toString();
    if (gradientRadialWidthInput) gradientRadialWidthInput.value = state.gradientRadialWidth.toString();
    if (gradientRadialHeightInput) gradientRadialHeightInput.value = state.gradientRadialHeight.toString();
    if (gradientRadialOffsetXInput) gradientRadialOffsetXInput.value = state.gradientRadialOffsetX.toString();
    if (gradientRadialOffsetYInput) gradientRadialOffsetYInput.value = state.gradientRadialOffsetY.toString();
    if (gradientRadial2RadiusInput) gradientRadial2RadiusInput.value = state.gradientRadial2Radius.toString();
    if (gradientRadial2WidthInput) gradientRadial2WidthInput.value = state.gradientRadial2Width.toString();
    if (gradientRadial2HeightInput) gradientRadial2HeightInput.value = state.gradientRadial2Height.toString();
    if (gradientRadial2OffsetXInput) gradientRadial2OffsetXInput.value = state.gradientRadial2OffsetX.toString();
    if (gradientRadial2OffsetYInput) gradientRadial2OffsetYInput.value = state.gradientRadial2OffsetY.toString();
    if (gridCountXInput) gridCountXInput.value = String(state.gridCountX);
    if (gridCountYInput) gridCountYInput.value = String(state.gridCountY);
    if (gridCountZInput) gridCountZInput.value = String(state.gridCountZ);
    if (gridSpacingXInput) gridSpacingXInput.value = state.gridSpacingX.toString();
    if (gridSpacingYInput) gridSpacingYInput.value = state.gridSpacingY.toString();
    if (gridSpacingZInput) gridSpacingZInput.value = state.gridSpacingZ.toString();
    syncPoseSlidersFromRotation();
    updateLengthDisplays();
  }

  function mirrorRangeToValueField(valueEl, rangeEl, isInt) {
    if (!valueEl || !rangeEl) return;
    valueEl.min = rangeEl.min;
    valueEl.max = rangeEl.max;
    valueEl.step = isInt ? "1" : "any";
  }

  function wireNumericValueField(valueEl, rangeEl, stateKey, isInt) {
    if (!valueEl || !rangeEl) return;
    const commit = () => {
      let v = parseFloat(String(valueEl.value).trim().replace(/,/g, "."));
      if (Number.isNaN(v)) {
        updateLengthDisplays();
        return;
      }
      v = clampToRangeBounds(v, rangeEl, isInt);
      if (v === null) {
        updateLengthDisplays();
        return;
      }
      state[stateKey] = v;
      rangeEl.value = String(v);
      updateLengthDisplays();
      if (stateKey === "laserGuideOpacity") updateGuideMaterialVisuals();
    };
    valueEl.addEventListener("change", commit);
    valueEl.addEventListener("blur", commit);
    valueEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        valueEl.blur();
      }
    });
  }

  mirrorRangeToValueField(lenXValue, lenXInput, false);
  mirrorRangeToValueField(lenYValue, lenYInput, false);
  mirrorRangeToValueField(lenZValue, lenZInput, false);
  if (lenDiagValue && lenDiagInput) mirrorRangeToValueField(lenDiagValue, lenDiagInput, false);
  if (fourthArmAzimuthValue && fourthArmAzimuthInput) {
    mirrorRangeToValueField(fourthArmAzimuthValue, fourthArmAzimuthInput, false);
  }
  if (fourthArmElevationValue && fourthArmElevationInput) {
    mirrorRangeToValueField(fourthArmElevationValue, fourthArmElevationInput, false);
  }
  mirrorRangeToValueField(thicknessValue, thicknessInput, false);
  mirrorRangeToValueField(filletRadiusValue, filletRadiusInput, false);
  if (planeAngleLimitValue && planeAngleLimitInput) mirrorRangeToValueField(planeAngleLimitValue, planeAngleLimitInput, false);
  mirrorRangeToValueField(laserGuideThicknessValue, laserGuideThicknessInput, false);
  mirrorRangeToValueField(laserGuideOpacityValue, laserGuideOpacityInput, false);
  if (gradientRadialRadiusValue && gradientRadialRadiusInput) {
    mirrorRangeToValueField(gradientRadialRadiusValue, gradientRadialRadiusInput, false);
  }
  if (gradientRadialWidthValue && gradientRadialWidthInput) {
    mirrorRangeToValueField(gradientRadialWidthValue, gradientRadialWidthInput, false);
  }
  if (gradientRadialHeightValue && gradientRadialHeightInput) {
    mirrorRangeToValueField(gradientRadialHeightValue, gradientRadialHeightInput, false);
  }
  if (gradientRadialOffsetXValue && gradientRadialOffsetXInput) {
    mirrorRangeToValueField(gradientRadialOffsetXValue, gradientRadialOffsetXInput, false);
  }
  if (gradientRadialOffsetYValue && gradientRadialOffsetYInput) {
    mirrorRangeToValueField(gradientRadialOffsetYValue, gradientRadialOffsetYInput, false);
  }
  if (gradientRadial2RadiusValue && gradientRadial2RadiusInput) {
    mirrorRangeToValueField(gradientRadial2RadiusValue, gradientRadial2RadiusInput, false);
  }
  if (gradientRadial2WidthValue && gradientRadial2WidthInput) {
    mirrorRangeToValueField(gradientRadial2WidthValue, gradientRadial2WidthInput, false);
  }
  if (gradientRadial2HeightValue && gradientRadial2HeightInput) {
    mirrorRangeToValueField(gradientRadial2HeightValue, gradientRadial2HeightInput, false);
  }
  if (gradientRadial2OffsetXValue && gradientRadial2OffsetXInput) {
    mirrorRangeToValueField(gradientRadial2OffsetXValue, gradientRadial2OffsetXInput, false);
  }
  if (gradientRadial2OffsetYValue && gradientRadial2OffsetYInput) {
    mirrorRangeToValueField(gradientRadial2OffsetYValue, gradientRadial2OffsetYInput, false);
  }
  if (gridCountXValue && gridCountXInput) mirrorRangeToValueField(gridCountXValue, gridCountXInput, true);
  if (gridCountYValue && gridCountYInput) mirrorRangeToValueField(gridCountYValue, gridCountYInput, true);
  if (gridCountZValue && gridCountZInput) mirrorRangeToValueField(gridCountZValue, gridCountZInput, true);
  if (gridSpacingXValue && gridSpacingXInput) mirrorRangeToValueField(gridSpacingXValue, gridSpacingXInput, false);
  if (gridSpacingYValue && gridSpacingYInput) mirrorRangeToValueField(gridSpacingYValue, gridSpacingYInput, false);
  if (gridSpacingZValue && gridSpacingZInput) mirrorRangeToValueField(gridSpacingZValue, gridSpacingZInput, false);
  if (poseRotXValue && poseRotXInput) mirrorRangeToValueField(poseRotXValue, poseRotXInput, false);
  if (poseRotYValue && poseRotYInput) mirrorRangeToValueField(poseRotYValue, poseRotYInput, false);
  if (poseRotZValue && poseRotZInput) mirrorRangeToValueField(poseRotZValue, poseRotZInput, false);

  function updateSeedDisplay() {
    seedDisplay.textContent = state.seed.toString();
  }

  function updateToggleButtons() {
    autoRotateToggle.textContent = state.autoRotate ? "On" : "Off";
    autoLengthToggle.textContent = state.autoLength ? "On" : "Off";
    laserGuidesToggle.textContent = state.showLaserGuides ? "On" : "Off";
    laserGuidesToggle.classList.toggle("primary", state.showLaserGuides);
    if (fourthArmToggle) {
      fourthArmToggle.textContent = state.showFourthArm ? "On" : "Off";
      fourthArmToggle.classList.toggle("primary", state.showFourthArm);
    }
    if (fourthArmDetailControls) {
      fourthArmDetailControls.style.display = state.showFourthArm ? "block" : "none";
    }
    if (lenDiagInput) lenDiagInput.disabled = !state.showFourthArm;
    if (gridLinesToggle) {
      gridLinesToggle.textContent = state.showGridLines ? "On" : "Off";
      gridLinesToggle.classList.toggle("primary", state.showGridLines);
    }
    if (planeGridDetailControls) {
      planeGridDetailControls.style.display = state.showGridLines ? "block" : "none";
    }
    const poseDisabled = state.autoRotate;
    if (poseRotXInput) poseRotXInput.disabled = poseDisabled;
    if (poseRotYInput) poseRotYInput.disabled = poseDisabled;
    if (poseRotZInput) poseRotZInput.disabled = poseDisabled;
    if (poseRotXValue) poseRotXValue.disabled = poseDisabled;
    if (poseRotYValue) poseRotYValue.disabled = poseDisabled;
    if (poseRotZValue) poseRotZValue.disabled = poseDisabled;
    if (lenDiagValue) lenDiagValue.disabled = !state.showFourthArm;
  }

  function syncGradientTypeButtons() {
    if (!gradientTypeLinearBtn || !gradientTypeRadialBtn) return;
    const linear = state.gradientType === "linear";
    gradientTypeLinearBtn.classList.toggle("primary", linear);
    gradientTypeRadialBtn.classList.toggle("primary", !linear);
    if (gradientLinearControls) gradientLinearControls.style.display = linear ? "block" : "none";
    if (gradientRadialControls) gradientRadialControls.style.display = linear ? "none" : "block";
    updateRadial2Ui();
  }

  function syncBackgroundModeButtons() {
    const solid = state.backgroundMode === "solid";
    backgroundModeSolidBtn.classList.toggle("primary", solid);
    backgroundModeGradientBtn.classList.toggle("primary", !solid);
    solidBackgroundControls.style.display = solid ? "block" : "none";
    gradientBackgroundControls.style.display = solid ? "none" : "block";
    if (!solid) syncGradientTypeButtons();
  }

  function updateGradientColorVisibility() {
    const n = state.gradientColorCount;
    if (gradientColor1Wrap) gradientColor1Wrap.style.display = n >= 2 ? "block" : "none";
    if (gradientColor2Wrap) gradientColor2Wrap.style.display = n >= 3 ? "block" : "none";
    if (gradientColor3Wrap) gradientColor3Wrap.style.display = n >= 4 ? "block" : "none";
  }

  function updateRadial2GradientColorVisibility() {
    const n = state.gradientRadial2ColorCount;
    if (gradientRadial2Color1Wrap) gradientRadial2Color1Wrap.style.display = n >= 2 ? "block" : "none";
    if (gradientRadial2Color2Wrap) gradientRadial2Color2Wrap.style.display = n >= 3 ? "block" : "none";
    if (gradientRadial2Color3Wrap) gradientRadial2Color3Wrap.style.display = n >= 4 ? "block" : "none";
  }

  function updateRadial2Ui() {
    if (gradientRadial2Toggle) {
      gradientRadial2Toggle.textContent = state.gradientRadial2Enabled ? "On" : "Off";
      gradientRadial2Toggle.classList.toggle("primary", state.gradientRadial2Enabled);
    }
    const showDetails = state.gradientType === "radial" && state.gradientRadial2Enabled;
    if (gradientRadial2DetailControls) {
      gradientRadial2DetailControls.style.display = showDetails ? "block" : "none";
    }
    updateRadial2GradientColorVisibility();
  }

  function readGradientColorsFromInputs() {
    gradientColorInputs.forEach((el, i) => {
      if (el) state.gradientColors[i] = el.value;
    });
  }

  function readRadial2GradientColorsFromInputs() {
    gradientRadial2ColorInputs.forEach((el, i) => {
      if (el) state.gradientRadial2Colors[i] = el.value;
    });
  }

  solidBackgroundColorInput.value = state.solidBackgroundColor;
  if (gradientRadialCanvasBackgroundInput) {
    gradientRadialCanvasBackgroundInput.value = state.gradientRadialCanvasBackground;
  }
  if (gradientRadial2ColorCountSelect) {
    gradientRadial2ColorCountSelect.value = String(state.gradientRadial2ColorCount);
  }
  gradientRadial2ColorInputs.forEach((el, i) => {
    if (el) el.value = state.gradientRadial2Colors[i];
  });
  gradientAlignAxisSelect.value = String(state.gradientAlignAxis);
  gradientColorCountSelect.value = String(state.gradientColorCount);
  gradientColorInputs.forEach((el, i) => {
    if (el) el.value = state.gradientColors[i];
  });
  syncSliders();
  syncHexFieldsFromColorPickers();
  syncGradientTypeButtons();

  if (gradientTypeLinearBtn && gradientTypeRadialBtn) {
    gradientTypeLinearBtn.addEventListener("click", () => {
      state.gradientType = "linear";
      syncGradientTypeButtons();
    });
    gradientTypeRadialBtn.addEventListener("click", () => {
      state.gradientType = "radial";
      syncGradientTypeButtons();
    });
  }
  if (gradientRadialRadiusInput) {
    gradientRadialRadiusInput.addEventListener("input", () => {
      state.gradientRadialRadius = parseFloat(gradientRadialRadiusInput.value);
      updateLengthDisplays();
    });
  }
  const wireRadialFloat = (input, key) => {
    if (!input) return;
    input.addEventListener("input", () => {
      state[key] = parseFloat(input.value);
      updateLengthDisplays();
    });
  };
  wireRadialFloat(gradientRadialWidthInput, "gradientRadialWidth");
  wireRadialFloat(gradientRadialHeightInput, "gradientRadialHeight");
  wireRadialFloat(gradientRadialOffsetXInput, "gradientRadialOffsetX");
  wireRadialFloat(gradientRadialOffsetYInput, "gradientRadialOffsetY");
  if (gradientRadial2RadiusInput) {
    gradientRadial2RadiusInput.addEventListener("input", () => {
      state.gradientRadial2Radius = parseFloat(gradientRadial2RadiusInput.value);
      updateLengthDisplays();
    });
  }
  wireRadialFloat(gradientRadial2WidthInput, "gradientRadial2Width");
  wireRadialFloat(gradientRadial2HeightInput, "gradientRadial2Height");
  wireRadialFloat(gradientRadial2OffsetXInput, "gradientRadial2OffsetX");
  wireRadialFloat(gradientRadial2OffsetYInput, "gradientRadial2OffsetY");

  if (gradientRadial2Toggle) {
    gradientRadial2Toggle.addEventListener("click", () => {
      state.gradientRadial2Enabled = !state.gradientRadial2Enabled;
      updateRadial2Ui();
    });
  }

  if (gridLinesToggle) {
    gridLinesToggle.addEventListener("click", () => {
      state.showGridLines = !state.showGridLines;
      updateToggleButtons();
    });
  }
  const wireGridInput = (input, key, isInt) => {
    if (!input) return;
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      state[key] = isInt ? Math.max(0, Math.round(v)) : v;
      updateLengthDisplays();
    });
  };
  wireGridInput(gridCountXInput, "gridCountX", true);
  wireGridInput(gridCountYInput, "gridCountY", true);
  wireGridInput(gridCountZInput, "gridCountZ", true);
  wireGridInput(gridSpacingXInput, "gridSpacingX", false);
  wireGridInput(gridSpacingYInput, "gridSpacingY", false);
  wireGridInput(gridSpacingZInput, "gridSpacingZ", false);

  backgroundModeSolidBtn.addEventListener("click", () => {
    state.backgroundMode = "solid";
    syncBackgroundModeButtons();
  });
  backgroundModeGradientBtn.addEventListener("click", () => {
    state.backgroundMode = "gradient";
    syncBackgroundModeButtons();
  });
  solidBackgroundColorInput.addEventListener("input", () => {
    state.solidBackgroundColor = solidBackgroundColorInput.value;
  });
  gradientAlignAxisSelect.addEventListener("change", () => {
    state.gradientAlignAxis = parseInt(gradientAlignAxisSelect.value, 10) || 0;
  });
  gradientColorCountSelect.addEventListener("change", () => {
    const v = parseInt(gradientColorCountSelect.value, 10);
    state.gradientColorCount = v >= 1 && v <= 4 ? v : 3;
    updateGradientColorVisibility();
  });
  if (gradientRadialCanvasBackgroundInput) {
    gradientRadialCanvasBackgroundInput.addEventListener("input", () => {
      state.gradientRadialCanvasBackground = gradientRadialCanvasBackgroundInput.value;
    });
  }
  if (gradientRadial2ColorCountSelect) {
    gradientRadial2ColorCountSelect.addEventListener("change", () => {
      const v = parseInt(gradientRadial2ColorCountSelect.value, 10);
      state.gradientRadial2ColorCount = v >= 1 && v <= 4 ? v : 2;
      updateRadial2GradientColorVisibility();
    });
  }
  gradientRadial2ColorInputs.forEach((el) => {
    if (!el) return;
    el.addEventListener("input", readRadial2GradientColorsFromInputs);
  });
  gradientColorInputs.forEach((el) => {
    if (!el) return;
    el.addEventListener("input", readGradientColorsFromInputs);
  });

  syncBackgroundModeButtons();
  updateGradientColorVisibility();

  if (bitColorInput) {
    bitColorInput.value = state.bitColorHex;
    bitColorInput.addEventListener("input", () => {
      state.bitColorHex = bitColorInput.value;
      updateBitColorVisuals();
    });
  }

  lenXInput.addEventListener("input", () => {
    state.lenX = parseFloat(lenXInput.value);
    updateLengthDisplays();
  });
  lenYInput.addEventListener("input", () => {
    state.lenY = parseFloat(lenYInput.value);
    updateLengthDisplays();
  });
  lenZInput.addEventListener("input", () => {
    state.lenZ = parseFloat(lenZInput.value);
    updateLengthDisplays();
  });

  if (lenDiagInput) {
    lenDiagInput.addEventListener("input", () => {
      state.lenDiag = parseFloat(lenDiagInput.value);
      updateLengthDisplays();
    });
  }

  if (fourthArmAzimuthInput) {
    fourthArmAzimuthInput.addEventListener("input", () => {
      state.fourthArmAzimuthDeg = parseFloat(fourthArmAzimuthInput.value);
      updateLengthDisplays();
    });
  }
  if (fourthArmElevationInput) {
    fourthArmElevationInput.addEventListener("input", () => {
      state.fourthArmElevationDeg = parseFloat(fourthArmElevationInput.value);
      updateLengthDisplays();
    });
  }

  if (fourthArmToggle) {
    fourthArmToggle.addEventListener("click", () => {
      state.showFourthArm = !state.showFourthArm;
      updateToggleButtons();
    });
  }

  thicknessInput.addEventListener("input", () => {
    state.thickness = parseFloat(thicknessInput.value);
    updateLengthDisplays();
  });

  filletRadiusInput.addEventListener("input", () => {
    state.filletRadius = parseFloat(filletRadiusInput.value);
    updateLengthDisplays();
  });

  if (planeAngleLimitInput) {
    planeAngleLimitInput.addEventListener("input", () => {
      state.planeAngleLimitDeg = parseFloat(planeAngleLimitInput.value);
      updateLengthDisplays();
    });
  }

  laserGuideThicknessInput.addEventListener("input", () => {
    state.laserGuideThickness = parseFloat(laserGuideThicknessInput.value);
    updateLengthDisplays();
  });

  laserGuideOpacityInput.addEventListener("input", () => {
    state.laserGuideOpacity = parseFloat(laserGuideOpacityInput.value);
    updateGuideMaterialVisuals();
    updateLengthDisplays();
  });

  wireNumericValueField(lenXValue, lenXInput, "lenX", false);
  wireNumericValueField(lenYValue, lenYInput, "lenY", false);
  wireNumericValueField(lenZValue, lenZInput, "lenZ", false);
  if (lenDiagValue && lenDiagInput) wireNumericValueField(lenDiagValue, lenDiagInput, "lenDiag", false);
  if (fourthArmAzimuthValue && fourthArmAzimuthInput) {
    wireNumericValueField(fourthArmAzimuthValue, fourthArmAzimuthInput, "fourthArmAzimuthDeg", false);
  }
  if (fourthArmElevationValue && fourthArmElevationInput) {
    wireNumericValueField(fourthArmElevationValue, fourthArmElevationInput, "fourthArmElevationDeg", false);
  }
  wireNumericValueField(thicknessValue, thicknessInput, "thickness", false);
  wireNumericValueField(filletRadiusValue, filletRadiusInput, "filletRadius", false);
  if (planeAngleLimitValue && planeAngleLimitInput) {
    wireNumericValueField(planeAngleLimitValue, planeAngleLimitInput, "planeAngleLimitDeg", false);
  }
  wireNumericValueField(laserGuideThicknessValue, laserGuideThicknessInput, "laserGuideThickness", false);
  wireNumericValueField(laserGuideOpacityValue, laserGuideOpacityInput, "laserGuideOpacity", false);
  if (gradientRadialRadiusValue && gradientRadialRadiusInput) {
    wireNumericValueField(gradientRadialRadiusValue, gradientRadialRadiusInput, "gradientRadialRadius", false);
  }
  if (gradientRadialWidthValue && gradientRadialWidthInput) {
    wireNumericValueField(gradientRadialWidthValue, gradientRadialWidthInput, "gradientRadialWidth", false);
  }
  if (gradientRadialHeightValue && gradientRadialHeightInput) {
    wireNumericValueField(gradientRadialHeightValue, gradientRadialHeightInput, "gradientRadialHeight", false);
  }
  if (gradientRadialOffsetXValue && gradientRadialOffsetXInput) {
    wireNumericValueField(gradientRadialOffsetXValue, gradientRadialOffsetXInput, "gradientRadialOffsetX", false);
  }
  if (gradientRadialOffsetYValue && gradientRadialOffsetYInput) {
    wireNumericValueField(gradientRadialOffsetYValue, gradientRadialOffsetYInput, "gradientRadialOffsetY", false);
  }
  if (gradientRadial2RadiusValue && gradientRadial2RadiusInput) {
    wireNumericValueField(gradientRadial2RadiusValue, gradientRadial2RadiusInput, "gradientRadial2Radius", false);
  }
  if (gradientRadial2WidthValue && gradientRadial2WidthInput) {
    wireNumericValueField(gradientRadial2WidthValue, gradientRadial2WidthInput, "gradientRadial2Width", false);
  }
  if (gradientRadial2HeightValue && gradientRadial2HeightInput) {
    wireNumericValueField(gradientRadial2HeightValue, gradientRadial2HeightInput, "gradientRadial2Height", false);
  }
  if (gradientRadial2OffsetXValue && gradientRadial2OffsetXInput) {
    wireNumericValueField(gradientRadial2OffsetXValue, gradientRadial2OffsetXInput, "gradientRadial2OffsetX", false);
  }
  if (gradientRadial2OffsetYValue && gradientRadial2OffsetYInput) {
    wireNumericValueField(gradientRadial2OffsetYValue, gradientRadial2OffsetYInput, "gradientRadial2OffsetY", false);
  }
  if (gridCountXValue && gridCountXInput) wireNumericValueField(gridCountXValue, gridCountXInput, "gridCountX", true);
  if (gridCountYValue && gridCountYInput) wireNumericValueField(gridCountYValue, gridCountYInput, "gridCountY", true);
  if (gridCountZValue && gridCountZInput) wireNumericValueField(gridCountZValue, gridCountZInput, "gridCountZ", true);
  if (gridSpacingXValue && gridSpacingXInput) {
    wireNumericValueField(gridSpacingXValue, gridSpacingXInput, "gridSpacingX", false);
  }
  if (gridSpacingYValue && gridSpacingYInput) {
    wireNumericValueField(gridSpacingYValue, gridSpacingYInput, "gridSpacingY", false);
  }
  if (gridSpacingZValue && gridSpacingZInput) {
    wireNumericValueField(gridSpacingZValue, gridSpacingZInput, "gridSpacingZ", false);
  }

  autoRotateToggle.addEventListener("click", () => {
    state.autoRotate = !state.autoRotate;
    updateToggleButtons();
    if (!state.autoRotate) syncPoseSlidersFromRotation();
  });

  autoLengthToggle.addEventListener("click", () => {
    state.autoLength = !state.autoLength;
    updateToggleButtons();
  });

  laserGuidesToggle.addEventListener("click", () => {
    state.showLaserGuides = !state.showLaserGuides;
    updateToggleButtons();
  });

  function applyPoseFromInputs() {
    if (!caltropGroup || state.autoRotate || !poseRotXInput || !poseRotYInput || !poseRotZInput) return;
    const x = parseFloat(poseRotXInput.value);
    const y = parseFloat(poseRotYInput.value);
    const z = parseFloat(poseRotZInput.value);
    caltropGroup.rotation.set(
      THREE.MathUtils.degToRad(Number.isFinite(x) ? x : 0),
      THREE.MathUtils.degToRad(Number.isFinite(y) ? y : 0),
      THREE.MathUtils.degToRad(Number.isFinite(z) ? z : 0)
    );
    state.autoRotate = false;
    updateToggleButtons();
    syncPoseSlidersFromRotation();
  }

  [poseRotXInput, poseRotYInput, poseRotZInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", applyPoseFromInputs);
  });

  function wirePoseDegValueField(valueEl, rangeEl) {
    if (!valueEl || !rangeEl) return;
    const commit = () => {
      let v = parseFloat(String(valueEl.value).trim().replace(/,/g, "."));
      if (Number.isNaN(v)) {
        syncPoseSlidersFromRotation();
        return;
      }
      v = clampToRangeBounds(v, rangeEl, false);
      if (v === null) {
        syncPoseSlidersFromRotation();
        return;
      }
      rangeEl.value = String(v);
      applyPoseFromInputs();
    };
    valueEl.addEventListener("change", commit);
    valueEl.addEventListener("blur", commit);
    valueEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        valueEl.blur();
      }
    });
  }
  wirePoseDegValueField(poseRotXValue, poseRotXInput);
  wirePoseDegValueField(poseRotYValue, poseRotYInput);
  wirePoseDegValueField(poseRotZValue, poseRotZInput);

  poseResetBtn.addEventListener("click", () => {
    caltropGroup.rotation.set(0, 0, 0);
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    state.autoRotate = false;
    updateToggleButtons();
    syncPoseSlidersFromRotation();
  });

  resetArmLengthsBtn.addEventListener("click", () => {
    state.lenX = DEFAULT_ARM_LENGTHS.lenX;
    state.lenY = DEFAULT_ARM_LENGTHS.lenY;
    state.lenZ = DEFAULT_ARM_LENGTHS.lenZ;
    state.lenDiag = DEFAULT_ARM_LENGTHS.lenDiag;
    state.fourthArmAzimuthDeg = DEFAULT_FOURTH_ARM_AZIMUTH_DEG;
    state.fourthArmElevationDeg = DEFAULT_FOURTH_ARM_ELEVATION_DEG;
    state.autoLength = false;
    updateToggleButtons();
    syncSliders();
  });

  seedPrev.addEventListener("click", () => {
    state.seed = Math.max(1, state.seed - 1);
    applySeed(state.seed);
    updateSeedDisplay();
    syncSliders();
  });

  seedNext.addEventListener("click", () => {
    state.seed += 1;
    applySeed(state.seed);
    updateSeedDisplay();
    syncSliders();
  });

  seedRandom.addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * 100000) + 1;
    applySeed(state.seed);
    updateSeedDisplay();
    syncSliders();
  });

  seedGo.addEventListener("click", () => {
    const v = parseInt(seedInput.value, 10);
    if (!Number.isNaN(v)) {
      state.seed = Math.max(1, v);
      applySeed(state.seed);
      updateSeedDisplay();
      syncSliders();
    }
  });

  downloadPngBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `tracebit-caltrop-${state.seed}-${timestamp}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  });

  downloadSvgBtn.addEventListener("click", () => {
    const svg = buildCurrentSvg();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `tracebit-caltrop-${state.seed}-${timestamp}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  });

  function syncFullUI() {
    syncSliders();
    updateSeedDisplay();
    if (seedInput) seedInput.value = state.seed.toString();
    updateToggleButtons();
    if (bitColorInput) bitColorInput.value = state.bitColorHex;
    solidBackgroundColorInput.value = state.solidBackgroundColor;
    if (gradientRadialCanvasBackgroundInput) {
      gradientRadialCanvasBackgroundInput.value = state.gradientRadialCanvasBackground;
    }
    if (gradientRadial2ColorCountSelect) {
      gradientRadial2ColorCountSelect.value = String(state.gradientRadial2ColorCount);
    }
    gradientRadial2ColorInputs.forEach((el, i) => {
      if (el) el.value = state.gradientRadial2Colors[i];
    });
    gradientAlignAxisSelect.value = String(state.gradientAlignAxis);
    gradientColorCountSelect.value = String(state.gradientColorCount);
    gradientColorInputs.forEach((el, i) => {
      if (el) el.value = state.gradientColors[i];
    });
    updateGradientColorVisibility();
    updateRadial2Ui();
    syncBackgroundModeButtons();
    syncGradientTypeButtons();
    updateBitColorVisuals();
    updateGuideMaterialVisuals();
    syncHexFieldsFromColorPickers();
  }

  document.getElementById("shortcutDefault").addEventListener("click", () => {
    applyShortcutDefault();
    syncFullUI();
  });
  document.getElementById("shortcutAuto").addEventListener("click", () => {
    applyShortcutAuto();
    syncFullUI();
  });
  document.getElementById("shortcutVibes").addEventListener("click", () => {
    applyShortcutVibes();
    syncFullUI();
  });
  document.getElementById("shortcutRandom").addEventListener("click", () => {
    applyShortcutRandom();
    syncFullUI();
  });
  document.getElementById("shortcutFullRandom").addEventListener("click", () => {
    applyShortcutFullRandom();
    syncFullUI();
  });

  caltropGroup.rotation.set(0, 0, 0);
  resetCameraToDefault();
  syncFullUI();
}

// Simple deterministic PRNG (mulberry32)
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function applySeed(seed) {
  const rand = mulberry32(seed);
  const min = 0.3;
  const max = 1.8;
  state.lenX = min + (max - min) * rand();
  state.lenY = min + (max - min) * rand();
  state.lenZ = min + (max - min) * rand();
  if (state.showFourthArm) {
    state.lenDiag = min + (max - min) * rand();
  }
  caltropGroup.rotation.set(
    rand() * Math.PI * 2,
    rand() * Math.PI * 2,
    rand() * Math.PI * 2
  );
}

function resetCameraToDefault() {
  camera.position.set(DEFAULT_CAMERA_POSITION.x, DEFAULT_CAMERA_POSITION.y, DEFAULT_CAMERA_POSITION.z);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}

function randomHexColor() {
  return "#" + Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0");
}

/** Picks from the same hex list as the palette shortcut swatches under each color control. */
function randomPalettePresetColor() {
  return PALETTE_PRESET_HEX[Math.floor(Math.random() * PALETTE_PRESET_HEX.length)].toLowerCase();
}

function applyShortcutDefault() {
  state.seed = 1;
  state.backgroundMode = "solid";
  state.solidBackgroundColor = "#000000";
  state.gradientType = "linear";
  state.gradientRadialRadius = 0.55;
  state.gradientRadialWidth = 1;
  state.gradientRadialHeight = 1;
  state.gradientRadialOffsetX = 0;
  state.gradientRadialOffsetY = 0;
  state.gradientRadialCanvasBackground = "#000000";
  state.gradientRadial2Enabled = false;
  state.gradientRadial2Radius = 0.35;
  state.gradientRadial2Width = 1;
  state.gradientRadial2Height = 1;
  state.gradientRadial2OffsetX = 0.2;
  state.gradientRadial2OffsetY = -0.15;
  state.gradientRadial2ColorCount = 2;
  state.gradientRadial2Colors = [...DEFAULT_GRADIENT2_COLORS];
  state.gradientAlignAxis = 0;
  state.gradientColorCount = 3;
  state.gradientColors = [...DEFAULT_GRADIENT_COLORS];
  state.bitColorHex = "#ffffff";
  state.autoRotate = false;
  state.autoLength = false;
  state.showLaserGuides = false;
  state.showGridLines = false;
  state.thickness = DEFAULT_THICKNESS;
  state.filletRadius = DEFAULT_FILLET_RADIUS;
  state.laserGuideThickness = LASER_GUIDE_DEFAULT_THICKNESS;
  state.laserGuideOpacity = LASER_GUIDE_DEFAULT_OPACITY;
  state.lenX = DEFAULT_ARM_LENGTHS.lenX;
  state.lenY = DEFAULT_ARM_LENGTHS.lenY;
  state.lenZ = DEFAULT_ARM_LENGTHS.lenZ;
  state.lenDiag = DEFAULT_ARM_LENGTHS.lenDiag;
  state.showFourthArm = false;
  state.fourthArmAzimuthDeg = DEFAULT_FOURTH_ARM_AZIMUTH_DEG;
  state.fourthArmElevationDeg = DEFAULT_FOURTH_ARM_ELEVATION_DEG;
  caltropGroup.rotation.set(0, 0, 0);
  resetCameraToDefault();
}

function applyShortcutAuto() {
  state.seed = 1;
  state.backgroundMode = "solid";
  state.solidBackgroundColor = "#000000";
  state.gradientType = "linear";
  state.gradientRadialRadius = 0.55;
  state.gradientRadialWidth = 1;
  state.gradientRadialHeight = 1;
  state.gradientRadialOffsetX = 0;
  state.gradientRadialOffsetY = 0;
  state.gradientRadialCanvasBackground = "#000000";
  state.gradientRadial2Enabled = false;
  state.gradientRadial2Radius = 0.35;
  state.gradientRadial2Width = 1;
  state.gradientRadial2Height = 1;
  state.gradientRadial2OffsetX = 0.2;
  state.gradientRadial2OffsetY = -0.15;
  state.gradientRadial2ColorCount = 2;
  state.gradientRadial2Colors = [...DEFAULT_GRADIENT2_COLORS];
  state.gradientAlignAxis = 0;
  state.gradientColorCount = 3;
  state.gradientColors = [...DEFAULT_GRADIENT_COLORS];
  state.bitColorHex = "#ffffff";
  state.autoRotate = true;
  state.autoLength = true;
  state.showLaserGuides = true;
  state.showGridLines = false;
  state.thickness = DEFAULT_THICKNESS;
  state.filletRadius = DEFAULT_FILLET_RADIUS;
  state.laserGuideThickness = LASER_GUIDE_DEFAULT_THICKNESS;
  state.laserGuideOpacity = LASER_GUIDE_DEFAULT_OPACITY;
  state.showFourthArm = false;
  state.fourthArmAzimuthDeg = DEFAULT_FOURTH_ARM_AZIMUTH_DEG;
  state.fourthArmElevationDeg = DEFAULT_FOURTH_ARM_ELEVATION_DEG;
  applySeed(1);
  resetCameraToDefault();
}

function applyShortcutVibes() {
  state.lenX = 1.25;
  state.lenY = 1.0;
  state.lenZ = 1.5;
  state.lenDiag = 1.0;
  state.showFourthArm = false;
  state.fourthArmAzimuthDeg = 45;
  state.fourthArmElevationDeg = 35.5;
  state.thickness = 0.1;
  state.filletRadius = 0.025;
  state.autoRotate = true;
  state.autoLength = true;
  state.planeAngleLimitDeg = 8;

  state.bitColorHex = "#1c1c1c";
  state.solidBackgroundColor = "#000000";
  state.backgroundMode = "gradient";
  state.gradientType = "radial";
  state.gradientColorCount = 1;
  state.gradientColors = ["#8a9a8e", "#f5e6e8", "#c45c3e", "#2a1810"];
  state.gradientAlignAxis = 0;
  state.gradientRadialCanvasBackground = "#f5e6e8";
  state.gradientRadialRadius = 0.39;
  state.gradientRadialWidth = 1.35;
  state.gradientRadialHeight = 1.0;
  state.gradientRadialOffsetX = 0.125;
  state.gradientRadialOffsetY = 0.025;
  state.gradientRadial2Enabled = true;
  state.gradientRadial2Radius = 0.22;
  state.gradientRadial2Width = 1.54;
  state.gradientRadial2Height = 2.21;
  state.gradientRadial2OffsetX = 0.09;
  state.gradientRadial2OffsetY = -0.15;
  state.gradientRadial2ColorCount = 1;
  state.gradientRadial2Colors = ["#ffb2b5", "#1a1a1a", "#ba95bd", "#000000"];

  state.showLaserGuides = false;
  state.laserGuideThickness = 0.002;
  state.laserGuideOpacity = 1.0;

  state.showGridLines = true;
  state.gridCountX = 6;
  state.gridCountY = 4;
  state.gridCountZ = 2;
  state.gridSpacingX = 0.75;
  state.gridSpacingY = 1.0;
  state.gridSpacingZ = 1.25;

  state.seed = 1;
  applySeed(1);
  resetCameraToDefault();
  caltropGroup.rotation.set(
    THREE.MathUtils.degToRad(79.6),
    THREE.MathUtils.degToRad(59.4),
    THREE.MathUtils.degToRad(16.3)
  );
}

function applyShortcutRandomCore(pickColor = randomHexColor) {
  state.seed = Math.floor(Math.random() * 100000) + 1;
  applySeed(state.seed);
  state.bitColorHex = pickColor();
  state.backgroundMode = Math.random() < 0.5 ? "solid" : "gradient";
  if (state.backgroundMode === "solid") {
    state.solidBackgroundColor = pickColor();
  } else {
    state.gradientType = Math.random() < 0.5 ? "linear" : "radial";
    state.gradientRadialRadius = 0.2 + Math.random() * 0.75;
    state.gradientRadialWidth = 0.4 + Math.random() * 1.6;
    state.gradientRadialHeight = 0.4 + Math.random() * 1.6;
    state.gradientRadialOffsetX = (Math.random() - 0.5) * 0.6;
    state.gradientRadialOffsetY = (Math.random() - 0.5) * 0.6;
    state.gradientRadialCanvasBackground = pickColor();
    state.gradientColorCount = 1 + Math.floor(Math.random() * 4);
    state.gradientAlignAxis = Math.floor(Math.random() * 4);
    for (let i = 0; i < 4; i++) {
      state.gradientColors[i] = pickColor();
    }
    if (state.gradientType === "radial") {
      state.gradientRadial2Enabled = Math.random() < 0.4;
      if (state.gradientRadial2Enabled) {
        state.gradientRadial2Radius = 0.15 + Math.random() * 0.7;
        state.gradientRadial2Width = 0.4 + Math.random() * 1.6;
        state.gradientRadial2Height = 0.4 + Math.random() * 1.6;
        state.gradientRadial2OffsetX = (Math.random() - 0.5) * 0.7;
        state.gradientRadial2OffsetY = (Math.random() - 0.5) * 0.7;
        state.gradientRadial2ColorCount = 1 + Math.floor(Math.random() * 4);
        for (let i = 0; i < 4; i++) {
          state.gradientRadial2Colors[i] = pickColor();
        }
      }
    } else {
      state.gradientRadial2Enabled = false;
    }
  }
  state.autoRotate = Math.random() < 0.5;
  state.autoLength = Math.random() < 0.5;
  state.showLaserGuides = Math.random() < 0.5;
  state.laserGuideThickness = 0.002 + Math.random() * (0.04 - 0.002);
  state.laserGuideOpacity = 0.1 + Math.random() * 0.9;
  state.fourthArmAzimuthDeg = Math.random() * 360;
  state.fourthArmElevationDeg = -90 + Math.random() * 180;
  resetCameraToDefault();
}

function applyShortcutRandom() {
  applyShortcutRandomCore();
}

function applyShortcutFullRandom() {
  applyShortcutRandomCore(randomPalettePresetColor);
  state.thickness = 0.05 + Math.random() * (0.3 - 0.05);
  state.filletRadius = 0.05 + Math.random() * (0.35 - 0.05);
  state.showGridLines = Math.random() < 0.5;
  state.gridCountX = Math.floor(Math.random() * 25);
  state.gridCountY = Math.floor(Math.random() * 25);
  state.gridCountZ = Math.floor(Math.random() * 25);
  const gsMin = 0.005;
  const gsMax = 3;
  state.gridSpacingX = gsMin + Math.random() * (gsMax - gsMin);
  state.gridSpacingY = gsMin + Math.random() * (gsMax - gsMin);
  state.gridSpacingZ = gsMin + Math.random() * (gsMax - gsMin);
}

function buildSvgRadialStopsInnerXml(n, colors, canvasBgForOneStop, transparentOneColorOuter) {
  if (n === 1) {
    if (transparentOneColorOuter) {
      const c = colors[0];
      return `<stop offset="0" stop-color="${c}" stop-opacity="1"/><stop offset="1" stop-color="${c}" stop-opacity="0"/>`;
    }
    return `<stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${canvasBgForOneStop}"/>`;
  }
  let s = "";
  for (let i = 0; i < n; i++) {
    s += `<stop offset="${i / (n - 1)}" stop-color="${colors[i]}"/>`;
  }
  return s;
}

function buildSvgRadialGradientDef(id, half, size, radiusFrac, widthMul, heightMul, ox, oy, stopsInnerXml) {
  const halfDiag = half * Math.sqrt(2);
  const base = Math.max(1, halfDiag * Math.max(0.02, Math.min(3, radiusFrac)));
  const rx = base * Math.max(0.05, Math.min(8, widthMul));
  const ry = base * Math.max(0.05, Math.min(8, heightMul));
  const oox = Math.max(-0.5, Math.min(0.5, ox));
  const ooy = Math.max(-0.5, Math.min(0.5, oy));
  const rcx = half + oox * size;
  const rcy = half + ooy * size;
  const xf = `translate(${rcx} ${rcy}) scale(${rx} ${ry})`;
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="${xf}">${stopsInnerXml}</radialGradient>`;
}

function buildSvgBackgroundLayer(size, half, camRight, camUp, rotMatrix) {
  if (state.backgroundMode === "solid") {
    return `<rect width="${size}" height="${size}" fill="${state.solidBackgroundColor}"/>`;
  }
  const n = clampGradientColorCount(state.gradientColorCount);
  const stops = [];
  if (n === 1 && state.gradientType === "radial") {
    stops.push(`<stop offset="0" stop-color="${state.gradientColors[0]}"/>`);
    stops.push(`<stop offset="1" stop-color="${state.gradientRadialCanvasBackground}"/>`);
  } else if (n > 1) {
    for (let i = 0; i < n; i++) {
      stops.push(`<stop offset="${i / (n - 1)}" stop-color="${state.gradientColors[i]}"/>`);
    }
  }
  if (state.gradientType === "radial") {
    const inner1 = buildSvgRadialStopsInnerXml(
      n,
      state.gradientColors,
      state.gradientRadialCanvasBackground,
      false
    );
    const def1 = buildSvgRadialGradientDef(
      "bgGradient",
      half,
      size,
      state.gradientRadialRadius,
      state.gradientRadialWidth,
      state.gradientRadialHeight,
      state.gradientRadialOffsetX,
      state.gradientRadialOffsetY,
      inner1
    );
    const bg = state.gradientRadialCanvasBackground;
    let defs = `<defs>${def1}`;
    let rects = `<rect width="${size}" height="${size}" fill="${bg}"/><rect width="${size}" height="${size}" fill="url(#bgGradient)"/>`;
    if (state.gradientRadial2Enabled) {
      const n2 = clampGradientColorCount(state.gradientRadial2ColorCount);
      const inner2 = buildSvgRadialStopsInnerXml(n2, state.gradientRadial2Colors, "", n2 === 1);
      defs += buildSvgRadialGradientDef(
        "bgGradient2",
        half,
        size,
        state.gradientRadial2Radius,
        state.gradientRadial2Width,
        state.gradientRadial2Height,
        state.gradientRadial2OffsetX,
        state.gradientRadial2OffsetY,
        inner2
      );
      rects += `<rect width="${size}" height="${size}" fill="url(#bgGradient2)"/>`;
    }
    defs += `</defs>`;
    return defs + rects;
  }
  if (n === 1) {
    return `<rect width="${size}" height="${size}" fill="${state.gradientColors[0]}"/>`;
  }
  const axis = Math.max(0, Math.min(3, state.gradientAlignAxis | 0));
  const alignDir = axis === 3 ? getFourthArmLocalDir(fourthArmDirScratch) : ARM_LOCAL_DIRS[axis];
  const worldDir = alignDir.clone().applyMatrix4(rotMatrix);
  const gpx = worldDir.dot(camRight);
  const gpy = worldDir.dot(camUp);
  const gpf = Math.sqrt(gpx * gpx + gpy * gpy);
  let svgDirX = 1;
  let svgDirY = 0;
  if (gpf > LASER_GUIDE_EPS) {
    svgDirX = gpx / gpf;
    svgDirY = -gpy / gpf;
  }
  const L = half * Math.sqrt(2);
  const x1 = half - svgDirX * L;
  const y1 = half - svgDirY * L;
  const x2 = half + svgDirX * L;
  const y2 = half + svgDirY * L;
  return `<defs><linearGradient id="bgGradient" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.join("")}</linearGradient></defs><rect width="${size}" height="${size}" fill="url(#bgGradient)"/>`;
}

function worldPointToSvg(P, camRight, camUp, half, pxPerUnit) {
  const x = P.dot(camRight);
  const y = P.dot(camUp);
  const sx = half + x * pxPerUnit;
  const sy = half - y * pxPerUnit;
  return [sx, sy];
}

function buildSvgGridLayer(half, pxPerUnit, camRight, camUp, rotMatrix) {
  if (!state.showGridLines) return "";
  const halfW = (camera.right - camera.left) * 0.5;
  const halfH = (camera.top - camera.bottom) * 0.5;
  const extent = Math.max(halfW, halfH) * 5;
  const sx = Math.max(0.001, state.gridSpacingX);
  const sy = Math.max(0.001, state.gridSpacingY);
  const sz = Math.max(0.001, state.gridSpacingZ);
  const nx = Math.max(0, state.gridCountX | 0);
  const ny = Math.max(0, state.gridCountY | 0);
  const nz = Math.max(0, state.gridCountZ | 0);

  const wx = ARM_LOCAL_DIRS[0].clone().applyMatrix4(rotMatrix).normalize();
  const wy = ARM_LOCAL_DIRS[1].clone().applyMatrix4(rotMatrix).normalize();
  const wz = ARM_LOCAL_DIRS[2].clone().applyMatrix4(rotMatrix).normalize();
  const o = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const gridStroke = Math.max(0.35, Math.max(state.laserGuideThickness, 0.001) * pxPerUnit * 0.45);
  const gridOpacity = state.laserGuideOpacity * 0.45;
  const stroke = state.bitColorHex;
  let out = "";

  const pushSeg = (a, b) => {
    const [x1, y1] = worldPointToSvg(a, camRight, camUp, half, pxPerUnit);
    const [x2, y2] = worldPointToSvg(b, camRight, camUp, half, pxPerUnit);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-opacity="${gridOpacity}" stroke-width="${gridStroke}" stroke-linecap="butt" />`;
  };

  const seg = (origin, axis) => {
    p0.copy(origin).addScaledVector(axis, -extent);
    p1.copy(origin).addScaledVector(axis, extent);
    pushSeg(p0, p1);
  };

  if (!state.showLaserGuides) {
    o.set(0, 0, 0);
    [wx, wy, wz].forEach((axis) => {
      const t = worldAxisHalfLength(axis, camRight, camUp, halfW, halfH);
      if (t <= LASER_GUIDE_EPS) return;
      p0.copy(axis).multiplyScalar(-t);
      p1.copy(axis).multiplyScalar(t);
      pushSeg(p0, p1);
    });
  }

  for (let j = 1; j <= nx; j++) {
    o.copy(wy).multiplyScalar(j * sx);
    seg(o, wx);
    o.negate();
    seg(o, wx);
  }
  for (let i = 1; i <= ny; i++) {
    o.copy(wx).multiplyScalar(i * sy);
    seg(o, wy);
    o.negate();
    seg(o, wy);
  }
  for (let i = 1; i <= nz; i++) {
    o.copy(wx).multiplyScalar(i * sz);
    seg(o, wz);
    o.negate();
    seg(o, wz);
  }

  return out;
}

// SVG export uses the same projection math as the renderer.
function buildCurrentSvg() {
  const size = 1024;
  const half = size / 2;
  const pxPerUnit = 300;
  const guideStrokePx = Math.max(state.laserGuideThickness, 0.001) * pxPerUnit;

  camera.updateMatrixWorld();
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  camera.matrixWorld.extractBasis(camRight, camUp, camFwd);

  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(caltropGroup.rotation);

  const bgLayer = buildSvgBackgroundLayer(size, half, camRight, camUp, rotMatrix);
  const gridLayer = buildSvgGridLayer(half, pxPerUnit, camRight, camUp, rotMatrix);

  const armData = [
    { dir: ARM_LOCAL_DIRS[0], len: state.lenX },
    { dir: ARM_LOCAL_DIRS[1], len: state.lenY },
    { dir: ARM_LOCAL_DIRS[2], len: state.lenZ },
  ];
  if (state.showFourthArm) {
    armData.push({ dir: getFourthArmLocalDir(fourthArmDirScratch), len: state.lenDiag });
  }

  const thicknessPx = state.thickness * pxPerUnit;
  const halfWidth = half;
  const halfHeight = half;
  const bitFill = state.bitColorHex;

  // Build projected arm data (screen direction + length) for fillet computation
  const projectedArms = [];

  let guidesSvg = "";
  let armsSvg = "";
  armData.forEach(({ dir, len }) => {
    const worldDir = dir.clone().applyMatrix4(rotMatrix);
    const px = worldDir.dot(camRight);
    const py = worldDir.dot(camUp);
    const angle = Math.atan2(py, px);
    const projFactor = Math.sqrt(px * px + py * py);
    const projectedLen = projFactor * len * pxPerUnit;

    projectedArms.push({ px, py, projFactor, len });

    // SVG Y-axis points down, camera Y-axis points up — negate angle
    const rotateDeg = (-angle * 180) / Math.PI;
    const x = half - projectedLen / 2;
    const y = half - thicknessPx / 2;
    armsSvg += `<rect x="${x}" y="${y}" width="${projectedLen}" height="${thicknessPx}" fill="${bitFill}" transform="rotate(${rotateDeg} ${half} ${half})" />`;

    if (state.showLaserGuides && projFactor > LASER_GUIDE_EPS) {
      const dirX = px / projFactor;
      const dirY = py / projFactor;
      const svgDirX = dirX;
      const svgDirY = -dirY;
      const guideHalfLenPx = distanceToViewportEdge(svgDirX, svgDirY, halfWidth, halfHeight);
      const x1 = half - svgDirX * guideHalfLenPx;
      const y1 = half - svgDirY * guideHalfLenPx;
      const x2 = half + svgDirX * guideHalfLenPx;
      const y2 = half + svgDirY * guideHalfLenPx;
      guidesSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${bitFill}" stroke-opacity="${state.laserGuideOpacity}" stroke-width="${guideStrokePx}" stroke-linecap="butt" />`;
    }
  });

  // Inner fillets: additive arc patches at concave corners (mirrors updateFilletCircles).
  // Computed in world Y-up; flipped to SVG Y-down at emit time.
  let filletSvg = "";
  const hw = state.thickness / 2;
  const r = state.filletRadius;
  if (r > 0.0005) {
    const halves = [];
    for (const arm of projectedArms) {
      if (arm.projFactor < LASER_GUIDE_EPS) continue;
      const nx = arm.px / arm.projFactor;
      const ny = arm.py / arm.projFactor;
      const halfLen = (arm.projFactor * arm.len) / 2;
      if (halfLen <= hw) continue;
      halves.push({ nx, ny, halfLen, angle: Math.atan2(ny, nx) });
      halves.push({ nx: -nx, ny: -ny, halfLen, angle: Math.atan2(-ny, -nx) });
    }
    halves.sort((a, b) => a.angle - b.angle);

    const toSx = (x) => half + x * pxPerUnit;
    const toSy = (y) => half - y * pxPerUnit;

    const n = halves.length;
    for (let i = 0; i < n; i++) {
      const h = halves[i];
      const nxt = halves[(i + 1) % n];
      let gap = nxt.angle - h.angle;
      if (gap < 0) gap += Math.PI * 2;
      if (gap <= 0.02 || gap >= Math.PI - 0.02) continue;

      const C = lineIntersect2D(
        -h.ny * hw, h.nx * hw, h.nx, h.ny,
        nxt.ny * hw, -nxt.nx * hw, nxt.nx, nxt.ny
      );
      if (!C) continue;

      const maxArm = Math.max(h.halfLen, nxt.halfLen);
      const dC = Math.hypot(C[0], C[1]);
      const fadeStart = maxArm * 0.35;
      const fadeEnd = maxArm * 0.7;
      if (dC >= fadeEnd) continue;
      const fade = dC <= fadeStart ? 1 : 1 - (dC - fadeStart) / (fadeEnd - fadeStart);
      const radius = r * fade;
      if (radius <= 0.0005) continue;

      const gapHalf = gap / 2;
      const tanHalf = Math.tan(gapHalf);
      if (tanHalf <= 1e-6) continue;
      let tanLen = radius / tanHalf;

      const cDotH = C[0] * h.nx + C[1] * h.ny;
      const cDotN = C[0] * nxt.nx + C[1] * nxt.ny;
      const availMax = Math.min(h.halfLen - cDotH, nxt.halfLen - cDotN);
      if (availMax <= 1e-4) continue;
      if (tanLen > availMax) tanLen = availMax;

      const effR = tanLen * tanHalf;
      if (effR <= 1e-4) continue;

      const T1x = C[0] + h.nx * tanLen, T1y = C[1] + h.ny * tanLen;
      const T2x = C[0] + nxt.nx * tanLen, T2y = C[1] + nxt.ny * tanLen;

      const T1sx = toSx(T1x), T1sy = toSy(T1y);
      const T2sx = toSx(T2x), T2sy = toSy(T2y);
      const Csx = toSx(C[0]), Csy = toSy(C[1]);
      const effRpx = effR * pxPerUnit;

      // Arc bulges away from C — pick sweep-flag so the arc lies on the opposite
      // side of the T1→T2 chord from C (sign check via 2D cross in SVG space).
      const crossSvg = (T2sx - T1sx) * (Csy - T1sy) - (T2sy - T1sy) * (Csx - T1sx);
      const sweep = crossSvg < 0 ? 1 : 0;

      filletSvg += `<path d="M ${T1sx} ${T1sy} A ${effRpx} ${effRpx} 0 0 ${sweep} ${T2sx} ${T2sy} L ${Csx} ${Csy} Z" fill="${bitFill}" />`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${bgLayer}${gridLayer}${guidesSvg}${armsSvg}${filletSvg}</svg>`;
}

window.addEventListener("DOMContentLoaded", init);
