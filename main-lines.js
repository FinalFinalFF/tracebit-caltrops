// Tracebit Caltrops — 2D stroke rendering with 3D-projected, camera-facing rectangles.
// Arms always appear as perfect 2D rectangles with 90° corners regardless of 3D rotation.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

let scene, camera, renderer, controls;
let caltropGroup; // rotation tracker only — no visible children
let centerDisc;
let armMeshX, armMeshY, armMeshZ;
let guideMeshX, guideMeshY, guideMeshZ;

const ARM_LOCAL_DIRS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];

const LASER_GUIDE_COLOR = 0xffffff;
const LASER_GUIDE_DEFAULT_THICKNESS = 0.01;
const LASER_GUIDE_DEFAULT_OPACITY = 0.95;
const LASER_GUIDE_EPS = 1e-6;

const state = {
  lenX: 1.5,
  lenY: 1.09,
  lenZ: 1.09,
  thickness: 0.08,
  sphereRadius: 0.12,
  autoRotate: true,
  autoLength: true,
  showLaserGuides: false,
  laserGuideThickness: LASER_GUIDE_DEFAULT_THICKNESS,
  laserGuideOpacity: LASER_GUIDE_DEFAULT_OPACITY,
  seed: 1,
  rotSeed: 1
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
  guideMeshX = createGuideRect();
  guideMeshY = createGuideRect();
  guideMeshZ = createGuideRect();
  guideMeshX.visible = false;
  guideMeshY.visible = false;
  guideMeshZ.visible = false;
  scene.add(guideMeshX);
  scene.add(guideMeshY);
  scene.add(guideMeshZ);
  scene.add(armMeshX);
  scene.add(armMeshY);
  scene.add(armMeshZ);

  centerDisc = createCenterDisc();
  scene.add(centerDisc);

  window.addEventListener("resize", onWindowResize);

  initUI();
  applyRotationSeed(state.rotSeed);

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
    color: LASER_GUIDE_COLOR,
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
  [guideMeshX, guideMeshY, guideMeshZ].forEach((guide) => {
    if (!guide || !guide.material) return;
    guide.material.opacity = state.laserGuideOpacity;
    guide.material.needsUpdate = true;
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

  const arms = [
    { mesh: armMeshX, guide: guideMeshX, dir: ARM_LOCAL_DIRS[0], len: state.lenX },
    { mesh: armMeshY, guide: guideMeshY, dir: ARM_LOCAL_DIRS[1], len: state.lenY },
    { mesh: armMeshZ, guide: guideMeshZ, dir: ARM_LOCAL_DIRS[2], len: state.lenZ },
  ];

  arms.forEach(({ mesh, guide, dir, len }) => {
    const worldDir = dir.clone().applyMatrix4(rotMatrix);

    const px = worldDir.dot(camRight);
    const py = worldDir.dot(camUp);

    const angle = Math.atan2(py, px);
    const projFactor = Math.sqrt(px * px + py * py);
    const projectedLen = Math.max(projFactor * len, 0.001);

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
    const baseX = 1.24;
    const baseY = 1.09;
    const baseZ = 1.09;
    const amp = 0.35;

    state.lenX = baseX + Math.sin(t * 1.0) * amp;
    state.lenY = baseY + Math.sin(t * 1.7 + 1.2) * amp;
    state.lenZ = baseZ + Math.sin(t * 2.3 + 2.4) * amp;

    if (state._ui) {
      const { lenXInput, lenYInput, lenZInput, lenXValue, lenYValue, lenZValue } = state._ui;
      if (lenXInput) lenXInput.value = state.lenX.toString();
      if (lenYInput) lenYInput.value = state.lenY.toString();
      if (lenZInput) lenZInput.value = state.lenZ.toString();
      if (lenXValue) lenXValue.textContent = state.lenX.toFixed(2);
      if (lenYValue) lenYValue.textContent = state.lenY.toFixed(2);
      if (lenZValue) lenZValue.textContent = state.lenZ.toFixed(2);
    }
  }

  updateArmProjections();

  if (controls && typeof controls.update === "function") {
    controls.update();
  }
  renderer.render(scene, camera);
}

// --- UI / Seeds -------------------------------------------------------------

function initUI() {
  const lenXInput = document.getElementById("lenX");
  const lenYInput = document.getElementById("lenY");
  const lenZInput = document.getElementById("lenZ");
  const thicknessInput = document.getElementById("thickness");
  const sphereRadiusInput = document.getElementById("sphereRadius");
  const laserGuideThicknessInput = document.getElementById("laserGuideThickness");
  const laserGuideOpacityInput = document.getElementById("laserGuideOpacity");
  const lenXValue = document.getElementById("lenX-value");
  const lenYValue = document.getElementById("lenY-value");
  const lenZValue = document.getElementById("lenZ-value");
  const thicknessValue = document.getElementById("thickness-value");
  const sphereRadiusValue = document.getElementById("sphereRadius-value");
  const laserGuideThicknessValue = document.getElementById("laserGuideThickness-value");
  const laserGuideOpacityValue = document.getElementById("laserGuideOpacity-value");

  const autoRotateToggle = document.getElementById("autoRotateToggle");
  const autoLengthToggle = document.getElementById("autoLengthToggle");
  const laserGuidesToggle = document.getElementById("laserGuidesToggle");
  const resetPoseBtn = document.getElementById("resetPose");
  const isoPoseBtn = document.getElementById("isometricPose");

  const seedDisplay = document.getElementById("seed-display");
  const seedPrev = document.getElementById("seedPrev");
  const seedNext = document.getElementById("seedNext");
  const seedRandom = document.getElementById("seedRandom");
  const seedInput = document.getElementById("seedInput");
  const seedGo = document.getElementById("seedGo");

  const rotSeedDisplay = document.getElementById("rotSeed-display");
  const rotSeedRandom = document.getElementById("rotSeedRandom");

  const downloadPngBtn = document.getElementById("downloadPng");
  const downloadSvgBtn = document.getElementById("downloadSvg");

  state._ui = {
    lenXInput, lenYInput, lenZInput, thicknessInput, sphereRadiusInput,
    laserGuideThicknessInput, laserGuideOpacityInput,
    lenXValue, lenYValue, lenZValue, thicknessValue, sphereRadiusValue,
    laserGuideThicknessValue, laserGuideOpacityValue
  };

  function updateLengthDisplays() {
    lenXValue.textContent = state.lenX.toFixed(2);
    lenYValue.textContent = state.lenY.toFixed(2);
    lenZValue.textContent = state.lenZ.toFixed(2);
    thicknessValue.textContent = state.thickness.toFixed(3);
    sphereRadiusValue.textContent = state.sphereRadius.toFixed(3);
    laserGuideThicknessValue.textContent = state.laserGuideThickness.toFixed(3);
    laserGuideOpacityValue.textContent = state.laserGuideOpacity.toFixed(2);
  }

  function syncSliders() {
    lenXInput.value = state.lenX.toString();
    lenYInput.value = state.lenY.toString();
    lenZInput.value = state.lenZ.toString();
    thicknessInput.value = state.thickness.toString();
    sphereRadiusInput.value = state.sphereRadius.toString();
    laserGuideThicknessInput.value = state.laserGuideThickness.toString();
    laserGuideOpacityInput.value = state.laserGuideOpacity.toString();
    updateLengthDisplays();
  }

  function updateSeedDisplay() {
    seedDisplay.textContent = state.seed.toString();
  }

  function updateRotSeedDisplay() {
    rotSeedDisplay.textContent = state.rotSeed.toString();
  }

  function updateToggleButtons() {
    autoRotateToggle.textContent = state.autoRotate ? "On" : "Off";
    autoLengthToggle.textContent = state.autoLength ? "On" : "Off";
    laserGuidesToggle.textContent = state.showLaserGuides ? "On" : "Off";
    laserGuidesToggle.classList.toggle("primary", state.showLaserGuides);
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

  resetPoseBtn.addEventListener("click", () => {
    caltropGroup.rotation.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  isoPoseBtn.addEventListener("click", () => {
    caltropGroup.rotation.set(0, 0, 0);
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
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

  rotSeedRandom.addEventListener("click", () => {
    state.rotSeed = Math.floor(Math.random() * 100000) + 1;
    applyRotationSeed(state.rotSeed);
    updateRotSeedDisplay();
  });

  downloadPngBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `tracebit-caltrop-lines-${state.seed}-${timestamp}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  });

  downloadSvgBtn.addEventListener("click", () => {
    const svg = buildCurrentSvg();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `tracebit-caltrop-lines-${state.seed}-${timestamp}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  });

  updateSeedDisplay();
  updateRotSeedDisplay();
  updateToggleButtons();
  updateGuideMaterialVisuals();
  syncSliders();
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
}

function applyRotationSeed(seed) {
  const rand = mulberry32(seed);
  caltropGroup.rotation.set(
    rand() * Math.PI * 2,
    rand() * Math.PI * 2,
    rand() * Math.PI * 2
  );
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

  const armData = [
    { dir: ARM_LOCAL_DIRS[0], len: state.lenX },
    { dir: ARM_LOCAL_DIRS[1], len: state.lenY },
    { dir: ARM_LOCAL_DIRS[2], len: state.lenZ },
  ];

  const thicknessPx = state.thickness * pxPerUnit;
  const radiusPx = state.sphereRadius * pxPerUnit;
  const halfWidth = half;
  const halfHeight = half;

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
    armsSvg += `<rect x="${x}" y="${y}" width="${projectedLen}" height="${thicknessPx}" fill="white" transform="rotate(${rotateDeg} ${half} ${half})" />`;

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
      guidesSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-opacity="${state.laserGuideOpacity}" stroke-width="${guideStrokePx}" stroke-linecap="butt" />`;
    }
  });

  const circleSvg = `<circle cx="${half}" cy="${half}" r="${radiusPx}" fill="white" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${guidesSvg}${armsSvg}${circleSvg}</svg>`;
}

window.addEventListener("DOMContentLoaded", init);
