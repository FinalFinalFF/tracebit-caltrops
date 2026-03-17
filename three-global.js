// Bridge module: import modern Three.js and OrbitControls
// from the local clone and expose them on window as a global
// THREE namespace so existing code can use it.

import * as THREE from "./three.js/build/three.module.js";
import { OrbitControls } from "./three.js/examples/jsm/controls/OrbitControls.js";

window.THREE = THREE;
window.THREE.OrbitControls = OrbitControls;

