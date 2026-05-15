// Hello Room — first iteration of the mini-commerce 3D visualizer.
//
// Scope (intentional, minimal):
//   - White room: floor, ceiling, four walls (simple primitives only).
//   - Ambient + directional lighting.
//   - Simple orbit camera (the official three OrbitControls addon).
//   - Placeholder objects (cube / sphere / cone) fed by /visualization-data.
//   - Falls back to a small inline mock set if the BFF is unreachable so the
//     scene is still informative without the full stack running.
//
// Non-goals: textures, model loaders, shaders, post-processing, animation
// systems, state management. Keep this file readable on one screen.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// The BFF address is configured at container start via a small runtime shim
// (window.__VIZ_CONFIG__) injected by nginx; see the Dockerfile entrypoint.
// In dev or when the shim is missing, default to the host BFF port.
const API_BASE =
  (typeof window !== "undefined" && window.__VIZ_CONFIG__?.apiBaseUrl) ||
  "http://localhost:3001";

const STATUS_COLORS = {
  ok: 0x4caf50,
  warn: 0xf2a200,
  error: 0xd64545,
  idle: 0x9aa0a6,
};

const ROOM = {
  width: 6,
  depth: 6,
  height: 3,
};

const stage = document.getElementById("stage");
const statusEl = document.getElementById("status");
const reloadBtn = document.getElementById("reload");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(
  55,
  stage.clientWidth / stage.clientHeight,
  0.1,
  100,
);
camera.position.set(4.5, 3, 5);
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.minDistance = 2;
controls.maxDistance = 12;

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);

buildRoom(scene, ROOM);

// Group all data-driven objects so reloads can clear and rebuild cleanly.
const dataGroup = new THREE.Group();
scene.add(dataGroup);

reloadBtn.addEventListener("click", () => {
  void loadAndRender();
});

window.addEventListener("resize", onResize);
onResize();

void loadAndRender();
animate();

// ---------------------------------------------------------------------------

function buildRoom(scene, { width, depth, height }) {
  // Materials kept off-white-ish so the room reads as 3D against the white
  // background. BackSide on walls so we look into the room from the camera.
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    side: THREE.DoubleSide,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xfafafa,
    side: THREE.BackSide,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    ceilingMat,
  );
  ceiling.position.y = height;
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);

  // Four walls as a single inverted box — cheaper than four planes and
  // guarantees the corners line up.
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    wallMat,
  );
  walls.position.y = height / 2;
  scene.add(walls);

  // Soft floor grid so depth is readable even on a white background.
  const grid = new THREE.GridHelper(width, 12, 0xdddddd, 0xeeeeee);
  grid.position.y = 0.001;
  scene.add(grid);
}

function buildItemMesh(item) {
  const color = STATUS_COLORS[item.status] ?? STATUS_COLORS.idle;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.05,
  });

  let geometry;
  switch (item.type) {
    case "sphere":
      geometry = new THREE.SphereGeometry(0.35, 24, 16);
      break;
    case "marker":
      geometry = new THREE.ConeGeometry(0.3, 0.7, 16);
      break;
    case "cube":
    default:
      geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      break;
  }

  const mesh = new THREE.Mesh(geometry, material);
  const hint = item.positionHint ?? { x: 0, y: 0.3, z: 0 };
  mesh.position.set(
    clamp(hint.x, -ROOM.width / 2 + 0.5, ROOM.width / 2 - 0.5),
    Math.max(0.3, hint.y),
    clamp(hint.z, -ROOM.depth / 2 + 0.5, ROOM.depth / 2 - 0.5),
  );
  mesh.userData = { id: item.id, label: item.label };
  return mesh;
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  }
}

async function loadAndRender() {
  setStatus("loading…");
  const items = await fetchItems().catch(() => null);

  clearGroup(dataGroup);
  const source = items ?? FALLBACK_ITEMS;
  for (const item of source) {
    dataGroup.add(buildItemMesh(item));
  }

  if (items) {
    setStatus(`live · ${items.length} item${items.length === 1 ? "" : "s"}`);
  } else {
    setStatus(`offline · ${FALLBACK_ITEMS.length} mock items`);
  }
}

async function fetchItems() {
  const res = await fetch(`${API_BASE}/visualization-data`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.items)) throw new Error("malformed response");
  return body.items;
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function onResize() {
  const { clientWidth, clientHeight } = stage;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Local fallback so the scene renders even when the BFF is unreachable.
// Kept small on purpose — production data ALWAYS comes from the API.
const FALLBACK_ITEMS = [
  {
    id: "fallback_1",
    label: "demo cube",
    type: "cube",
    value: 1,
    status: "idle",
    positionHint: { x: -1, y: 0.4, z: 0 },
  },
  {
    id: "fallback_2",
    label: "demo sphere",
    type: "sphere",
    value: 1,
    status: "idle",
    positionHint: { x: 1, y: 0.5, z: 0 },
  },
];
