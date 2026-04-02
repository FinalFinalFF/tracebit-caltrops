// Tracebit Caltrops — 2D stroke rendering with 3D-projected, camera-facing rectangles.
// Arms always appear as perfect 2D rectangles with 90° corners regardless of 3D rotation.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

let scene, camera, renderer, controls;
let caltropGroup; // rotation tracker only — no visible children
let centerDisc;
let armMeshX, armMeshY, armMeshZ, armMeshDiag;
let guideMeshX, guideMeshY, guideMeshZ, guideMeshDiag;

let bgCanvas;
let bgTexture;
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
const DEFAULT_ARM_LENGTHS = Object.freeze({ lenX: 1.0, lenY: 1.0, lenZ: 1.3, lenDiag: 1.0 });

const DEFAULT_THICKNESS = 0.075;
const DEFAULT_SPHERE_RADIUS = 0.1;

/** Default gradient stops (Shortcuts Default / Vibes). */
const DEFAULT_GRADIENT_COLORS = Object.freeze(["#8a9a8e", "#f5e6e8", "#c45c3e", "#2a1810"]);

const state = {
  lenX: DEFAULT_ARM_LENGTHS.lenX,
  lenY: DEFAULT_ARM_LENGTHS.lenY,
  lenZ: DEFAULT_ARM_LENGTHS.lenZ,
  lenDiag: DEFAULT_ARM_LENGTHS.lenDiag,
  showFourthArm: false,
  fourthArmAzimuthDeg: DEFAULT_FOURTH_ARM_AZIMUTH_DEG,
  fourthArmElevationDeg: DEFAULT_FOURTH_ARM_ELEVATION_DEG,
  thickness: DEFAULT_THICKNESS,
  sphereRadius: DEFAULT_SPHERE_RADIUS,
  autoRotate: false,
  autoLength: false,
  showLaserGuides: true,
  laserGuideThickness: LASER_GUIDE_DEFAULT_THICKNESS,
  laserGuideOpacity: LASER_GUIDE_DEFAULT_OPACITY,
  seed: 1,
  backgroundMode: "solid",
  solidBackgroundColor: "#000000",
  gradientAlignAxis: 0,
  gradientColorCount: 3,
  gradientColors: [...DEFAULT_GRADIENT_COLORS],
  bitColorHex: "#ffffff",
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
  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

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

  centerDisc = createCenterDisc();
  scene.add(centerDisc);

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

function createCenterDisc() {
  const geom = new THREE.CircleGeometry(1, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(geom, mat);
  return mesh;
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

function updateGuideMaterialVisuals() {
  [guideMeshX, guideMeshY, guideMeshZ, guideMeshDiag].forEach((guide) => {
    if (!guide || !guide.material) return;
    guide.material.opacity = state.laserGuideOpacity;
    guide.material.needsUpdate = true;
  });
}

function updateBitColorVisuals() {
  const c = new THREE.Color(state.bitColorHex);
  [armMeshX, armMeshY, armMeshZ, armMeshDiag].forEach((mesh) => {
    if (mesh && mesh.material) mesh.material.color.copy(c);
  });
  if (centerDisc && centerDisc.material) centerDisc.material.color.copy(c);
  [guideMeshX, guideMeshY, guideMeshZ, guideMeshDiag].forEach((guide) => {
    if (guide && guide.material) guide.material.color.copy(c);
  });
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

  if (centerDisc) {
    centerDisc.quaternion.copy(camera.quaternion);
    centerDisc.scale.setScalar(state.sphereRadius);
    centerDisc.position.set(0, 0, 0);
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
  resizeBackgroundCanvas();
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

function updateBackground() {
  if (!bgCanvas || !bgTexture || !scene) return;

  resizeBackgroundCanvas();

  if (state.backgroundMode === "solid") {
    scene.background = new THREE.Color(state.solidBackgroundColor);
    return;
  }

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

  const w = bgCanvas.width;
  const h = bgCanvas.height;
  const ctx = bgCanvas.getContext("2d");
  const cx = w * 0.5;
  const cy = h * 0.5;
  const L = Math.hypot(w, h) * 0.5;
  const x0 = cx - dx * L;
  const y0 = cy - dyC * L;
  const x1 = cx + dx * L;
  const y1 = cy + dyC * L;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const n = Math.max(2, Math.min(4, state.gradientColorCount | 0));
  for (let i = 0; i < n; i++) {
    g.addColorStop(i / (n - 1), state.gradientColors[i]);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  bgTexture.needsUpdate = true;
  scene.background = bgTexture;
}

function animate() {
  requestAnimationFrame(animate);

  if (state.autoRotate) {
    const t = performance.now() * 0.0003;
    caltropGroup.rotation.y = t;
    caltropGroup.rotation.x = t * 0.6;
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
      if (lenXValue) lenXValue.textContent = state.lenX.toFixed(2);
      if (lenYValue) lenYValue.textContent = state.lenY.toFixed(2);
      if (lenZValue) lenZValue.textContent = state.lenZ.toFixed(2);
      if (lenDiagValue && state.showFourthArm) lenDiagValue.textContent = state.lenDiag.toFixed(2);
    }
  }

  updateArmProjections();
  updateBackground();

  if (controls && typeof controls.update === "function") {
    controls.update();
  }
  renderer.render(scene, camera);
}

// --- UI / Seeds -------------------------------------------------------------

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
  const sphereRadiusInput = document.getElementById("sphereRadius");
  const laserGuideThicknessInput = document.getElementById("laserGuideThickness");
  const laserGuideOpacityInput = document.getElementById("laserGuideOpacity");
  const lenXValue = document.getElementById("lenX-value");
  const lenYValue = document.getElementById("lenY-value");
  const lenZValue = document.getElementById("lenZ-value");
  const lenDiagValue = document.getElementById("lenDiag-value");
  const fourthArmAzimuthValue = document.getElementById("fourthArmAzimuth-value");
  const fourthArmElevationValue = document.getElementById("fourthArmElevation-value");
  const thicknessValue = document.getElementById("thickness-value");
  const sphereRadiusValue = document.getElementById("sphereRadius-value");
  const laserGuideThicknessValue = document.getElementById("laserGuideThickness-value");
  const laserGuideOpacityValue = document.getElementById("laserGuideOpacity-value");

  const autoRotateToggle = document.getElementById("autoRotateToggle");
  const autoLengthToggle = document.getElementById("autoLengthToggle");
  const laserGuidesToggle = document.getElementById("laserGuidesToggle");
  const fourthArmToggle = document.getElementById("fourthArmToggle");
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
  const gradientColor2Wrap = document.getElementById("gradientColor2-wrap");
  const gradientColor3Wrap = document.getElementById("gradientColor3-wrap");

  state._ui = {
    lenXInput, lenYInput, lenZInput, lenDiagInput, fourthArmAzimuthInput, fourthArmElevationInput,
    thicknessInput, sphereRadiusInput,
    laserGuideThicknessInput, laserGuideOpacityInput,
    lenXValue, lenYValue, lenZValue, lenDiagValue, fourthArmAzimuthValue, fourthArmElevationValue,
    thicknessValue, sphereRadiusValue,
    laserGuideThicknessValue, laserGuideOpacityValue,
    fourthArmToggle,
  };

  function updateLengthDisplays() {
    lenXValue.textContent = state.lenX.toFixed(2);
    lenYValue.textContent = state.lenY.toFixed(2);
    lenZValue.textContent = state.lenZ.toFixed(2);
    if (lenDiagValue) lenDiagValue.textContent = state.lenDiag.toFixed(2);
    if (fourthArmAzimuthValue) fourthArmAzimuthValue.textContent = state.fourthArmAzimuthDeg.toFixed(0);
    if (fourthArmElevationValue) fourthArmElevationValue.textContent = state.fourthArmElevationDeg.toFixed(1);
    thicknessValue.textContent = state.thickness.toFixed(3);
    sphereRadiusValue.textContent = state.sphereRadius.toFixed(3);
    laserGuideThicknessValue.textContent = state.laserGuideThickness.toFixed(3);
    laserGuideOpacityValue.textContent = state.laserGuideOpacity.toFixed(2);
  }

  function syncSliders() {
    lenXInput.value = state.lenX.toString();
    lenYInput.value = state.lenY.toString();
    lenZInput.value = state.lenZ.toString();
    if (lenDiagInput) lenDiagInput.value = state.lenDiag.toString();
    if (fourthArmAzimuthInput) fourthArmAzimuthInput.value = state.fourthArmAzimuthDeg.toString();
    if (fourthArmElevationInput) fourthArmElevationInput.value = state.fourthArmElevationDeg.toString();
    thicknessInput.value = state.thickness.toString();
    sphereRadiusInput.value = state.sphereRadius.toString();
    laserGuideThicknessInput.value = state.laserGuideThickness.toString();
    laserGuideOpacityInput.value = state.laserGuideOpacity.toString();
    updateLengthDisplays();
  }

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
    if (lenDiagInput) lenDiagInput.disabled = !state.showFourthArm;
  }

  function syncBackgroundModeButtons() {
    const solid = state.backgroundMode === "solid";
    backgroundModeSolidBtn.classList.toggle("primary", solid);
    backgroundModeGradientBtn.classList.toggle("primary", !solid);
    solidBackgroundControls.style.display = solid ? "block" : "none";
    gradientBackgroundControls.style.display = solid ? "none" : "block";
  }

  function updateGradientColorVisibility() {
    const n = state.gradientColorCount;
    if (gradientColor2Wrap) gradientColor2Wrap.style.display = n >= 3 ? "block" : "none";
    if (gradientColor3Wrap) gradientColor3Wrap.style.display = n >= 4 ? "block" : "none";
  }

  function readGradientColorsFromInputs() {
    gradientColorInputs.forEach((el, i) => {
      if (el) state.gradientColors[i] = el.value;
    });
  }

  solidBackgroundColorInput.value = state.solidBackgroundColor;
  gradientAlignAxisSelect.value = String(state.gradientAlignAxis);
  gradientColorCountSelect.value = String(state.gradientColorCount);
  gradientColorInputs.forEach((el, i) => {
    if (el) el.value = state.gradientColors[i];
  });

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
    state.gradientColorCount = parseInt(gradientColorCountSelect.value, 10) || 3;
    updateGradientColorVisibility();
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

  sphereRadiusInput.addEventListener("input", () => {
    state.sphereRadius = parseFloat(sphereRadiusInput.value);
    updateLengthDisplays();
  });

  laserGuideThicknessInput.addEventListener("input", () => {
    state.laserGuideThickness = parseFloat(laserGuideThicknessInput.value);
    updateLengthDisplays();
  });

  laserGuideOpacityInput.addEventListener("input", () => {
    state.laserGuideOpacity = parseFloat(laserGuideOpacityInput.value);
    updateGuideMaterialVisuals();
    updateLengthDisplays();
  });

  autoRotateToggle.addEventListener("click", () => {
    state.autoRotate = !state.autoRotate;
    updateToggleButtons();
  });

  autoLengthToggle.addEventListener("click", () => {
    state.autoLength = !state.autoLength;
    updateToggleButtons();
  });

  laserGuidesToggle.addEventListener("click", () => {
    state.showLaserGuides = !state.showLaserGuides;
    updateToggleButtons();
  });

  poseResetBtn.addEventListener("click", () => {
    caltropGroup.rotation.set(0, 0, 0);
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    state.autoRotate = false;
    updateToggleButtons();
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
    gradientAlignAxisSelect.value = String(state.gradientAlignAxis);
    gradientColorCountSelect.value = String(state.gradientColorCount);
    gradientColorInputs.forEach((el, i) => {
      if (el) el.value = state.gradientColors[i];
    });
    updateGradientColorVisibility();
    syncBackgroundModeButtons();
    updateBitColorVisuals();
    updateGuideMaterialVisuals();
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
  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}

function randomHexColor() {
  return "#" + Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0");
}

function applyShortcutDefault() {
  state.seed = 1;
  state.backgroundMode = "solid";
  state.solidBackgroundColor = "#000000";
  state.gradientAlignAxis = 0;
  state.gradientColorCount = 3;
  state.gradientColors = [...DEFAULT_GRADIENT_COLORS];
  state.bitColorHex = "#ffffff";
  state.autoRotate = false;
  state.autoLength = false;
  state.showLaserGuides = true;
  state.thickness = DEFAULT_THICKNESS;
  state.sphereRadius = DEFAULT_SPHERE_RADIUS;
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
  state.gradientAlignAxis = 0;
  state.gradientColorCount = 3;
  state.gradientColors = [...DEFAULT_GRADIENT_COLORS];
  state.bitColorHex = "#ffffff";
  state.autoRotate = true;
  state.autoLength = true;
  state.showLaserGuides = true;
  state.thickness = DEFAULT_THICKNESS;
  state.sphereRadius = DEFAULT_SPHERE_RADIUS;
  state.laserGuideThickness = LASER_GUIDE_DEFAULT_THICKNESS;
  state.laserGuideOpacity = LASER_GUIDE_DEFAULT_OPACITY;
  state.showFourthArm = false;
  state.fourthArmAzimuthDeg = DEFAULT_FOURTH_ARM_AZIMUTH_DEG;
  state.fourthArmElevationDeg = DEFAULT_FOURTH_ARM_ELEVATION_DEG;
  applySeed(1);
  resetCameraToDefault();
}

function applyShortcutVibes() {
  state.backgroundMode = "gradient";
  state.gradientAlignAxis = Math.floor(Math.random() * 4);
  state.gradientColorCount = 3;
  state.gradientColors = [...DEFAULT_GRADIENT_COLORS];
  state.bitColorHex = "#000000";
  state.autoRotate = false;
  state.autoLength = false;
  state.thickness = DEFAULT_THICKNESS;
  state.sphereRadius = DEFAULT_SPHERE_RADIUS;
  state.showLaserGuides = true;
  state.laserGuideThickness = LASER_GUIDE_DEFAULT_THICKNESS;
  state.laserGuideOpacity = LASER_GUIDE_DEFAULT_OPACITY;
  state.seed = Math.floor(Math.random() * 100000) + 1;
  applySeed(state.seed);
  resetCameraToDefault();
}

function applyShortcutRandomCore() {
  state.seed = Math.floor(Math.random() * 100000) + 1;
  applySeed(state.seed);
  state.bitColorHex = randomHexColor();
  state.backgroundMode = Math.random() < 0.5 ? "solid" : "gradient";
  if (state.backgroundMode === "solid") {
    state.solidBackgroundColor = randomHexColor();
  } else {
    state.gradientColorCount = 2 + Math.floor(Math.random() * 3);
    state.gradientAlignAxis = Math.floor(Math.random() * 4);
    for (let i = 0; i < 4; i++) {
      state.gradientColors[i] = randomHexColor();
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
  applyShortcutRandomCore();
  state.thickness = 0.05 + Math.random() * (0.3 - 0.05);
  state.sphereRadius = 0.05 + Math.random() * (0.35 - 0.05);
}

function buildSvgBackgroundLayer(size, half, camRight, camUp, rotMatrix) {
  if (state.backgroundMode === "solid") {
    return `<rect width="${size}" height="${size}" fill="${state.solidBackgroundColor}"/>`;
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
  const n = Math.max(2, Math.min(4, state.gradientColorCount | 0));
  const stops = [];
  for (let i = 0; i < n; i++) {
    stops.push(`<stop offset="${i / (n - 1)}" stop-color="${state.gradientColors[i]}"/>`);
  }
  return `<defs><linearGradient id="bgGradient" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.join("")}</linearGradient></defs><rect width="${size}" height="${size}" fill="url(#bgGradient)"/>`;
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

  const armData = [
    { dir: ARM_LOCAL_DIRS[0], len: state.lenX },
    { dir: ARM_LOCAL_DIRS[1], len: state.lenY },
    { dir: ARM_LOCAL_DIRS[2], len: state.lenZ },
  ];
  if (state.showFourthArm) {
    armData.push({ dir: getFourthArmLocalDir(fourthArmDirScratch), len: state.lenDiag });
  }

  const thicknessPx = state.thickness * pxPerUnit;
  const radiusPx = state.sphereRadius * pxPerUnit;
  const halfWidth = half;
  const halfHeight = half;
  const bitFill = state.bitColorHex;

  let guidesSvg = "";
  let armsSvg = "";
  armData.forEach(({ dir, len }) => {
    const worldDir = dir.clone().applyMatrix4(rotMatrix);
    const px = worldDir.dot(camRight);
    const py = worldDir.dot(camUp);
    const angle = Math.atan2(py, px);
    const projFactor = Math.sqrt(px * px + py * py);
    const projectedLen = projFactor * len * pxPerUnit;

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

  const circleSvg = `<circle cx="${half}" cy="${half}" r="${radiusPx}" fill="${bitFill}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${bgLayer}${guidesSvg}${armsSvg}${circleSvg}</svg>`;
}

window.addEventListener("DOMContentLoaded", init);
