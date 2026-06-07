// Mini-commerce 3D visualizer — entry shim.
//
// Wires the DOM, the Three.js bootstrap, and the per-concern modules.
// Per-concern code lives in:
//   • materials.js          — palette, status colours, PS1 texture factory
//   • geometry/frustum.js   — buildSquareFrustum, buildOpenFrustum
//   • objects/room.js       — room and floor grid
//   • objects/espresso-cup.js — Classic Espresso (ESPRESSO_CFG dev entry)
//   • objects/scene-meshes.js — typed scene per-role meshes
//   • objects/disposal.js   — clearGroup (canvas-texture-aware)
//   • layout/render.js      — renderScene + animator factories
//   • transport.js          — SSE primary + polling fallback
//   • fallback.js           — offline typed scene

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FALLBACK_SCENE } from "./fallback.js";
import { ROOM, buildRoom } from "./objects/room.js";
import { createRenderer, createAnimator } from "./layout/render.js";
import { initTransport } from "./transport.js";

// DOM refs
const stage     = document.getElementById("stage");
const statusEl  = document.getElementById("status");
const reloadBtn = document.getElementById("reload");

// Three.js scene bootstrap
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(
  55,
  stage.clientWidth / stage.clientHeight,
  0.1,
  100,
);
// Positioned to frame a single centred product: close enough to read the PS1
// polygon facets, high enough to see the saucer sitting on the floor.
// Orbit controls let the user freely navigate after load.
camera.position.set(1.2, 0.65, 1.8);
camera.lookAt(0, 0.22, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.22, 0);
controls.minDistance = 0.5;
controls.maxDistance = 12;

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);

buildRoom(scene, ROOM);

// All data-driven objects live here so SSE rebuilds can clear/replace cleanly.
const dataGroup = new THREE.Group();
scene.add(dataGroup);

// Factories: renderer + animator both close over dataGroup so transport can
// fire renderScene without re-passing it. Same dataGroup instance flows into
// transport for the "previous scene stays on error" guard.
const { renderScene, sceneObjectCount } = createRenderer({ dataGroup });
const animator = createAnimator({ scene, camera, renderer, controls, dataGroup });
const transport = initTransport({
  onScene: renderScene,
  sceneObjectCount,
  statusEl,
  dataGroup,
  fallbackScene: FALLBACK_SCENE,
});

reloadBtn.addEventListener("click", () => transport.connect());
window.addEventListener("resize", onResize);
onResize();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) transport.pauseForHidden();
  else transport.connect();
});

transport.connect();
animator.start();

function onResize() {
  const { clientWidth, clientHeight } = stage;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}
