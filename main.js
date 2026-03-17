// Tracebit Caltrops 3D Visualizer — Three.js from local vendor/ (github.com/mrdoob/three.js)
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { SVGRenderer } from "./vendor/SVGRenderer.js";

let scene, camera, renderer, controls;
let caltrop;

const state = {
  lenX: 1.5,
  lenY: 1.09,
  lenZ: 1.09,
  thickness: 0.08,
  sphereRadius: 0.12,
  autoRotate: true,
  autoLength: true,
  endCaps: "flat", // flat | rounded
  seed: 1,
  rotSeed: 1,
  rotSpeed: 1.0,
  rotTilt: 0.6
};

function init() {
  const container = document.getElementById("canvas-container");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const aspect = width && height ? width / height : 1;
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

  caltrop = createCaltrop();
  scene.add(caltrop);

  window.addEventListener("resize", onWindowResize);

  initUI();
  applyStateToCaltrop();

  animate();
}

function createCaltrop() {
  const group = new THREE.Group();

  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const armThickness = state.thickness;
  const armLengthBase = 1.0;

  const geomX = new THREE.BoxGeometry(armLengthBase, armThickness, armThickness);
  const meshX = new THREE.Mesh(geomX, material);
  meshX.name = "armX";

  const geomY = new THREE.BoxGeometry(armThickness, armLengthBase, armThickness);
  const meshY = new THREE.Mesh(geomY, material);
  meshY.name = "armY";

  const geomZ = new THREE.BoxGeometry(armThickness, armThickness, armLengthBase);
  const meshZ = new THREE.Mesh(geomZ, material);
  meshZ.name = "armZ";

  group.add(meshX);
  group.add(meshY);
  group.add(meshZ);

  const sphereRadius = 0.17;
  const sphereGeom = new THREE.SphereGeometry(sphereRadius, 32, 16);
  const sphere = new THREE.Mesh(sphereGeom, material);
  sphere.name = "weldSphere";
  group.add(sphere);

  group.userData = {
    armLengthBase,
    armThicknessBase: armThickness
  };

  updateEndCaps(group);

  return group;
}

function applyStateToCaltrop() {
  const armX = caltrop.getObjectByName("armX");
  const armY = caltrop.getObjectByName("armY");
  const armZ = caltrop.getObjectByName("armZ");
  const weldSphere = caltrop.getObjectByName("weldSphere");

  if (armX && armY && armZ) {
    const baseThickness = caltrop.userData.armThicknessBase || 0.12;

    const thicknessScale = state.thickness / baseThickness;

    armX.scale.set(state.lenX, thicknessScale, thicknessScale);
    armY.scale.set(thicknessScale, state.lenY, thicknessScale);
    armZ.scale.set(thicknessScale, thicknessScale, state.lenZ);
  }

  updateEndCaps(caltrop);

  if (weldSphere) {
    const baseRadius = 0.17;
    const radiusScale = state.sphereRadius / baseRadius;
    weldSphere.scale.set(radiusScale, radiusScale, radiusScale);
  }
}

function updateEndCaps(group) {
  // Remove existing rounded caps
  const toRemove = [];
  group.traverse((child) => {
    if (child.userData && child.userData.isEndCap) {
      toRemove.push(child);
    }
  });
  toRemove.forEach((m) => group.remove(m));

  if (state.endCaps !== "rounded") {
    return;
  }

  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const baseThickness = group.userData.armThicknessBase || 0.12;
  // Much smaller than the bar thickness so it reads as a softening of the
  // corner rather than a hemispherical cap.
  const radius = state.thickness * 0.2;

  const sphereGeom = new THREE.SphereGeometry(radius, 24, 12);

  const armX = group.getObjectByName("armX");
  const armY = group.getObjectByName("armY");
  const armZ = group.getObjectByName("armZ");

  const arms = [
    { arm: armX, axis: "x" },
    { arm: armY, axis: "y" },
    { arm: armZ, axis: "z" }
  ];

  const armLengthBase = group.userData.armLengthBase || 1.0;

  arms.forEach(({ arm, axis }) => {
    if (!arm) return;
    const lengthScale =
      axis === "x" ? state.lenX : axis === "y" ? state.lenY : state.lenZ;
    const halfLength = (armLengthBase * lengthScale) / 2;

    ["positive", "negative"].forEach((dir) => {
      const cap = new THREE.Mesh(sphereGeom, material);
      cap.userData.isEndCap = true;

      cap.position.set(0, 0, 0);
      // Sink almost the entire sphere into the bar so only a slight rounding
      // is visible beyond the flat end.
      const signedHalf = dir === "positive" ? halfLength : -halfLength;
      const sign = signedHalf >= 0 ? 1 : -1;
      const offset = signedHalf - sign * radius * 0.95;
      if (axis === "x") cap.position.x = offset;
      if (axis === "y") cap.position.y = offset;
      if (axis === "z") cap.position.z = offset;

      group.add(cap);
    });
  });
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

  if (state.autoRotate && caltrop) {
    const t = performance.now() * 0.0003 * state.rotSpeed;
    caltrop.rotation.y = t;
    caltrop.rotation.x = t * state.rotTilt;
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

    applyStateToCaltrop();

    // Keep UI sliders and numeric labels in sync with animated lengths
    if (state._ui) {
      const {
        lenXInput,
        lenYInput,
        lenZInput,
        thicknessInput,
        sphereRadiusInput,
        lenXValue,
        lenYValue,
        lenZValue,
        thicknessValue,
        sphereRadiusValue
      } = state._ui;

      if (lenXInput) lenXInput.value = state.lenX.toString();
      if (lenYInput) lenYInput.value = state.lenY.toString();
      if (lenZInput) lenZInput.value = state.lenZ.toString();
      if (thicknessInput) thicknessInput.value = state.thickness.toString();
      if (sphereRadiusInput) sphereRadiusInput.value = state.sphereRadius.toString();

      if (lenXValue) lenXValue.textContent = state.lenX.toFixed(2);
      if (lenYValue) lenYValue.textContent = state.lenY.toFixed(2);
      if (lenZValue) lenZValue.textContent = state.lenZ.toFixed(2);
      if (thicknessValue) thicknessValue.textContent = state.thickness.toFixed(3);
      if (sphereRadiusValue) sphereRadiusValue.textContent = state.sphereRadius.toFixed(3);
    }
  }

  if (controls && typeof controls.update === "function") {
    controls.update();
  }
  renderer.render(scene, camera);
}

// --- UI / Variation ---

function initUI() {
  const lenXInput = document.getElementById("lenX");
  const lenYInput = document.getElementById("lenY");
  const lenZInput = document.getElementById("lenZ");
  const thicknessInput = document.getElementById("thickness");
  const sphereRadiusInput = document.getElementById("sphereRadius");
  const lenXValue = document.getElementById("lenX-value");
  const lenYValue = document.getElementById("lenY-value");
  const lenZValue = document.getElementById("lenZ-value");
  const thicknessValue = document.getElementById("thickness-value");
  const sphereRadiusValue = document.getElementById("sphereRadius-value");

  const autoRotateToggle = document.getElementById("autoRotateToggle");
  const autoLengthToggle = document.getElementById("autoLengthToggle");
  const resetPoseBtn = document.getElementById("resetPose");
  const isoPoseBtn = document.getElementById("isometricPose");

  const capsFlatBtn = document.getElementById("capsFlat");
  const capsRoundedBtn = document.getElementById("capsRounded");

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

  // Cache UI elements on state so animation can keep sliders in sync
  state._ui = {
    lenXInput,
    lenYInput,
    lenZInput,
    thicknessInput,
    sphereRadiusInput,
    lenXValue,
    lenYValue,
    lenZValue,
    thicknessValue,
    sphereRadiusValue
  };
  function updateAutoButtons() {
    autoRotateToggle.textContent = state.autoRotate ? "On" : "Off";
    autoLengthToggle.textContent = state.autoLength ? "On" : "Off";
  }

  function updateLengthDisplays() {
    lenXValue.textContent = state.lenX.toFixed(2);
    lenYValue.textContent = state.lenY.toFixed(2);
    lenZValue.textContent = state.lenZ.toFixed(2);
    thicknessValue.textContent = state.thickness.toFixed(3);
    sphereRadiusValue.textContent = state.sphereRadius.toFixed(3);
  }

  function syncSliders() {
    lenXInput.value = state.lenX.toString();
    lenYInput.value = state.lenY.toString();
    lenZInput.value = state.lenZ.toString();
    thicknessInput.value = state.thickness.toString();
    sphereRadiusInput.value = state.sphereRadius.toString();
    updateLengthDisplays();
  }

  function updateSeedDisplay() {
    seedDisplay.textContent = state.seed.toString();
  }

  function updateRotSeedDisplay() {
    rotSeedDisplay.textContent = state.rotSeed.toString();
  }

  lenXInput.addEventListener("input", () => {
    state.lenX = parseFloat(lenXInput.value);
    updateLengthDisplays();
    applyStateToCaltrop();
  });
  lenYInput.addEventListener("input", () => {
    state.lenY = parseFloat(lenYInput.value);
    updateLengthDisplays();
    applyStateToCaltrop();
  });
  lenZInput.addEventListener("input", () => {
    state.lenZ = parseFloat(lenZInput.value);
    updateLengthDisplays();
    applyStateToCaltrop();
  });

  thicknessInput.addEventListener("input", () => {
    state.thickness = parseFloat(thicknessInput.value);
    updateLengthDisplays();
    applyStateToCaltrop();
  });

  sphereRadiusInput.addEventListener("input", () => {
    state.sphereRadius = parseFloat(sphereRadiusInput.value);
    updateLengthDisplays();
    applyStateToCaltrop();
  });

  autoRotateToggle.addEventListener("click", () => {
    state.autoRotate = !state.autoRotate;
    updateAutoButtons();
  });

  autoLengthToggle.addEventListener("click", () => {
    state.autoLength = !state.autoLength;
    updateAutoButtons();
  });

  resetPoseBtn.addEventListener("click", () => {
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    caltrop.rotation.set(0, 0, 0);
    controls.update();
  });

  isoPoseBtn.addEventListener("click", () => {
    camera.position.set(3.5, 3.5, 3.5);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    caltrop.rotation.set(0, 0, 0);
    controls.update();
  });

  function updateCapsButtons() {
    if (state.endCaps === "rounded") {
      capsRoundedBtn.classList.add("primary");
      capsFlatBtn.classList.remove("primary");
    } else {
      capsFlatBtn.classList.add("primary");
      capsRoundedBtn.classList.remove("primary");
    }
  }

  capsFlatBtn.addEventListener("click", () => {
    state.endCaps = "flat";
    updateEndCaps(caltrop);
    updateCapsButtons();
  });

  capsRoundedBtn.addEventListener("click", () => {
    state.endCaps = "rounded";
    updateEndCaps(caltrop);
    updateCapsButtons();
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
    const randomSeed = Math.floor(Math.random() * 100000) + 1;
    state.seed = randomSeed;
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
    const randomSeed = Math.floor(Math.random() * 100000) + 1;
    state.rotSeed = randomSeed;
    applyRotationSeed(state.rotSeed);
    updateRotSeedDisplay();
  });

  downloadPngBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `tracebit-caltrop-${state.seed}-${timestamp}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  });

  downloadSvgBtn.addEventListener("click", () => {
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;

    const svgRenderer = new SVGRenderer();
    svgRenderer.setSize(width, height);
    svgRenderer.setClearColor(0x000000, 1);
    svgRenderer.render(scene, camera);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgRenderer.domElement);

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `tracebit-caltrop-${state.seed}-${timestamp}.svg`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
  });

  updateSeedDisplay();
  updateRotSeedDisplay();
  updateAutoButtons();
  syncSliders();
  updateCapsButtons();
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

  applyStateToCaltrop();
}

function applyRotationSeed(seed) {
  const rand = mulberry32(seed);

  // Random but controlled static pose so seeds are reproducible
  const ax = (rand() - 0.5) * Math.PI * 1.2;
  const ay = (rand() - 0.5) * Math.PI * 2.0;
  const az = (rand() - 0.5) * Math.PI * 0.4;

  if (caltrop) {
    caltrop.rotation.set(ax, ay, az);
  }
}

window.addEventListener("DOMContentLoaded", init);
