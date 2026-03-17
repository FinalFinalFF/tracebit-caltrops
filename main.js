// Tracebit Caltrops 3D Visualizer
// Three axis-aligned arms with flat graphic rendering.

// THREE and OrbitControls are loaded globally via script tags in index.html
const OrbitControls = THREE.OrbitControls;

let scene, camera, renderer, controls;
let caltrop;

const state = {
  lenX: 1.0,
  lenY: 1.0,
  lenZ: 1.0,
  thickness: 0.12,
  sphereRadius: 0.17,
  autoRotate: false,
  endCaps: "flat", // flat | rounded
  seed: 1
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
    const t = performance.now() * 0.0003;
    caltrop.rotation.y = t;
    caltrop.rotation.x = t * 0.6;
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

  const downloadPngBtn = document.getElementById("downloadPng");

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
    autoRotateToggle.textContent = state.autoRotate ? "On" : "Off";
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

  downloadPngBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `tracebit-caltrop-${state.seed}-${timestamp}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  });

  applySeed(state.seed);
  updateSeedDisplay();
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

window.addEventListener("DOMContentLoaded", init);

