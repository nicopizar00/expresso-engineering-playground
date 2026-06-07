// Mini-commerce 3D visualizer — Classic Espresso showcase.
//
// Scope:
//   - White room with floor grid as stage.
//   - Ambient + directional lighting.
//   - OrbitControls for free camera navigation.
//   - Domain items fed by /visualization-data via SSE (polling fallback).
//   - PS1-era exact-spec espresso cup for "drink" category items.
//   - Canvas pixel textures with NearestFilter for retro block aesthetics.
//   - Offline fallback renders the showcase cup without any backend.
//
// Non-goals: model loaders, shaders, post-processing, state management.
// Extension points are called out with // << EXTEND comments.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clamp } from "./utils.js";
import {
  ESPRESSO_PALETTE,
  STATUS_COLORS,
  desaturateHex,
  makePsxTexture,
} from "./materials.js";
import { buildSquareFrustum, buildOpenFrustum } from "./geometry/frustum.js";
import { FALLBACK_SCENE } from "./fallback.js";

// =============================================================================
// DEV ENTRY POINT — Classic Expresso geometry & texture configuration.
//
// All dimensions are in Three.js world units (arbitrary; 1 ≈ "one cup height").
// Edit these constants to tune proportions without touching buildEspressoGroup.
// After saving, hard-reload the visualizer page to see the change.
//
// Polygon budget (certified iteration 4):
//   Cup body    : 5 quads / 10 triangles / 8 vertices  (open-top frustum — no top face)
//   Saucer      : 6 quads / 12 triangles / 8 vertices  (tapered dish frustum)
//   Handle      : 1 quad  /  2 triangles / 4 vertices  (flat vertical plane)
//   Coffee      : 1 quad  /  2 triangles / 4 vertices  (flat horizontal plane)
//   TOTAL       : 26 triangles / 28 vertices            (Standard tier ≤ 28 ✓)
// =============================================================================
const ESPRESSO_CFG = {
  // ── Cup body (open-top, slight taper: squat PS1 silhouette) ──────────────
  bodyTopW: 0.25,   // top opening side length
  bodyBotW: 0.30,   // base side length (83 % taper — matches v2 Blender geometry)
  bodyH:    0.28,   // cup height (squat: nearly 1:1 width:height)

  // ── Saucer (single tapered piece: wide at top, narrow at foot) ───────────
  saucerTopW: 0.48,  // rim width (1.6 × cup base — compact dish)
  saucerBotW: 0.32,  // foot width (steeper slope for legibility at small sizes)
  saucerH:    0.06,  // height tall enough to read from the side

  // ── Air gap between saucer top and cup base ───────────────────────────────
  gap:      0.04,

  // ── Handle (single flat quad, DoubleSide, sprite-thin — PS1 style) ────────
  handleW:   0.16,  // quad width
  handleH:   0.22,  // quad height
  handleGap: 0.03,  // air gap between cup right wall and handle left edge

  // ── Coffee fill (inside the open cup, near the rim) ───────────────────────
  coffeeShrink: 0.01, // inset from cup top opening on each side

  // ── PS1 texture ──────────────────────────────────────────────────────────
  texSize: 16,
};

// =============================================================================
// Runtime config — URLs, polling, SSE
// =============================================================================

// Resolves the BFF base URL so the same scene.js works in both access modes:
//   • Direct  (http://localhost:3002) : window.__VIZ_CONFIG__ shim or port fallback
//   • Proxied (/viz/*)               : same-origin /api/bff rewrite
const API_BASE = (() => {
  if (typeof window === "undefined") return "http://localhost:3001";
  if (window.location.pathname.startsWith("/viz")) return "/api/bff";
  return window.__VIZ_CONFIG__?.apiBaseUrl || "http://localhost:3001";
})();

const ROOM = { width: 6, depth: 6, height: 3 };

// Hero-vs-history visual language.
// The latest cart/order event becomes the HERO: scaled up, pulled to
// centre-stage, brightened, and given a brief spawn-burst animation.
// All other items recede: smaller scale, desaturated palette, no rotation.
// This keeps the stage about the LATEST user action, with history present
// but quiet.
const HERO_SCALE        = 1.45;
const HISTORY_SCALE     = 0.55;
const HERO_FLOOR_Y      = 0.002;
const SPAWN_DURATION_MS = 700;

const stage    = document.getElementById("stage");
const statusEl = document.getElementById("status");
const reloadBtn = document.getElementById("reload");

const POLL_INTERVAL_MS = 2000;
let inflight    = false;
let pollHandle  = null;

const SSE_RETRY_MS = 5000;
let sseSource      = null;
let sseRetryHandle = null;

// =============================================================================
// Three.js scene bootstrap
// =============================================================================

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

reloadBtn.addEventListener("click", () => connectSse());
window.addEventListener("resize", onResize);
onResize();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
    if (sseSource) { sseSource.close(); sseSource = null; }
    clearTimeout(sseRetryHandle);
    sseRetryHandle = null;
  } else {
    connectSse();
  }
});

connectSse();
animate();

// =============================================================================
// Room
// =============================================================================

function buildRoom(scene, { width, depth, height }) {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide });
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0xfafafa, side: THREE.BackSide });
  const ceilMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilMat);
  ceiling.position.y = height;
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
  walls.position.y = height / 2;
  scene.add(walls);

  const grid = new THREE.GridHelper(width, 12, 0xdddddd, 0xeeeeee);
  grid.position.y = 0.001;
  scene.add(grid);
}

// =============================================================================
// Classic Espresso — PS1 low-poly cup group  (certified iteration 4)
//
// Topology:
//   Saucer  : buildSquareFrustum(topW, botW, H)  →  8 verts / 12 tris
//             topW > botW → wide-at-top dish silhouette from all angles
//   Cup body: buildOpenFrustum(topW, botW, H)    →  8 verts / 10 tris
//             open top lets coffee fill read through the rim
//   Coffee  : PlaneGeometry(W, W)                →  4 verts /  2 tris
//   Handle  : PlaneGeometry(W, H)                →  4 verts /  2 tris
//   ─────────────────────────────────────────────────────────────────────────
//   TOTAL                                          28 verts / 26 tris
//
// Group pivot = saucer bottom = y = 0 (world floor).
//
// << EXTEND: add new drink variants (latte glass, americano mug) by
//    calling buildOpenFrustum with different topW / botW / bodyH values
//    and routing via a second category flag in metadata.
// =============================================================================
function buildEspressoGroup(color, cfg = ESPRESSO_CFG) {
  const {
    bodyTopW, bodyBotW, bodyH,
    saucerTopW, saucerBotW, saucerH, gap,
    handleW, handleH, handleGap,
    coffeeShrink, texSize,
  } = cfg;

  const tex   = makePsxTexture(color, texSize);
  const mkMat = () => new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const group = new THREE.Group();

  // ── Saucer — single tapered piece: wide at top, narrow at foot ───────────
  // saucerTopW > saucerBotW → four sloped side faces read as a dish from any
  // angle, replacing the old two-piece flat coaster.
  const saucer = new THREE.Mesh(
    buildSquareFrustum(saucerTopW, saucerBotW, saucerH),
    mkMat(),
  );
  group.add(saucer);

  // ── Cup body — open-top so the coffee fill is visible through the rim ─────
  const cupBotY = saucerH + gap;
  const cup     = new THREE.Mesh(buildOpenFrustum(bodyTopW, bodyBotW, bodyH), mkMat());
  cup.position.y = cupBotY;
  group.add(cup);

  // ── Coffee fill ───────────────────────────────────────────────────────────
  const coffeeW = bodyTopW - coffeeShrink;
  const coffee  = new THREE.Mesh(
    new THREE.PlaneGeometry(coffeeW, coffeeW),
    new THREE.MeshBasicMaterial({ color: ESPRESSO_PALETTE.coffee }),
  );
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = cupBotY + bodyH - 0.01; // inside the open cup, near the rim
  group.add(coffee);

  // ── Handle ────────────────────────────────────────────────────────────────
  const handleX = bodyBotW / 2 + handleGap + handleW / 2;
  const handleY = cupBotY + bodyH / 2;
  const handle  = new THREE.Mesh(
    new THREE.PlaneGeometry(handleW, handleH),
    new THREE.MeshLambertMaterial({ map: tex, flatShading: true, side: THREE.DoubleSide }),
  );
  handle.position.set(handleX, handleY, 0);
  group.add(handle);

  return group;
}

// =============================================================================
// Scene lifecycle helpers
// =============================================================================

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    child.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose(); // release canvas GPU texture
        obj.material.dispose();
      }
    });
  }
}

// =============================================================================
// renderScene — EOC-2 semantic dispatch.
//
// Consumes the typed `VisualizationScene` shape (products, recentOrders,
// orderAggregates, cart) and chooses meshes locally. The BFF stays out of
// representation decisions; the visualizer owns mesh/color/position.
//
// Layout (this iteration — minimal, EOC-5 will turn it into a real counter):
//   • Hero       — cart > newest recent order > first product, centre stage.
//   • Products   — back-left grid (excluding the hero if a product was picked).
//   • Orders     — right column, newest at the front.
//   • Aggregate  — single low-poly stack in the back-right corner when
//                  orderAggregates.olderCount > 0.
// =============================================================================

function buildProductMesh(product, isHero) {
  const isDrink = product.category === "drink";
  const baseColor = isDrink
    ? ESPRESSO_PALETTE.lightBeige
    : STATUS_COLORS[product.status] ?? STATUS_COLORS.idle;
  const color = isHero ? baseColor : desaturateHex(baseColor, 0.55);
  if (isDrink) {
    const cfg = product.assetConfig ? { ...ESPRESSO_CFG, ...product.assetConfig } : ESPRESSO_CFG;
    return buildEspressoGroup(color, cfg);
  }
  // Non-drink products: small low-poly cube via the shared frustum primitive.
  const tex = makePsxTexture(color, ESPRESSO_CFG.texSize);
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  return new THREE.Mesh(buildSquareFrustum(0.45, 0.45, 0.45), mat);
}

function buildOrderMesh(order, isHero) {
  const baseColor = STATUS_COLORS[order.vizStatus] ?? STATUS_COLORS.idle;
  const color = isHero ? baseColor : desaturateHex(baseColor, 0.55);
  const tex = makePsxTexture(color, ESPRESSO_CFG.texSize);
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  // Thin slab — reads as a "ticket" on the counter.
  return new THREE.Mesh(buildSquareFrustum(0.28, 0.28, 0.10), mat);
}

function buildAggregateMesh() {
  const color = desaturateHex(STATUS_COLORS.idle, 0.4);
  const tex = makePsxTexture(color, ESPRESSO_CFG.texSize);
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const group = new THREE.Group();
  // Three stacked thin slabs to suggest "many older orders".
  for (let i = 0; i < 3; i++) {
    const slab = new THREE.Mesh(buildSquareFrustum(0.40, 0.40, 0.07), mat);
    slab.position.y = i * 0.08;
    group.add(slab);
  }
  return group;
}

function buildCartMesh(cart, isHero) {
  const baseColor = ESPRESSO_PALETTE.lightBeige;
  const color = isHero ? baseColor : desaturateHex(baseColor, 0.55);
  const cfg = cart.assetConfig ? { ...ESPRESSO_CFG, ...cart.assetConfig } : ESPRESSO_CFG;
  return buildEspressoGroup(color, cfg);
}

// EOC-2 hero priority: cart wins, else newest recent order, else first product.
function pickSceneHero(scene) {
  if (scene?.cart) return { kind: "cart" };
  if (scene?.recentOrders?.length > 0) return { kind: "order", id: scene.recentOrders[0].orderId };
  if (scene?.products?.length > 0) return { kind: "product", id: scene.products[0].productId };
  return null;
}

function sceneHeroKey(hero) {
  if (!hero) return null;
  if (hero.kind === "cart") return "cart";
  return `${hero.kind}:${hero.id}`;
}

function placeMesh(mesh, position, isHero, userData) {
  const baseScale = isHero ? HERO_SCALE : HISTORY_SCALE;
  mesh.position.set(position.x, position.y, position.z);
  mesh.scale.setScalar(baseScale);
  mesh.userData = { ...userData, baseScale, idleRotate: isHero, isHero };
  return mesh;
}

function renderScene(scene) {
  const hero = pickSceneHero(scene);
  const heroKey = sceneHeroKey(hero);
  const heroChanged = heroKey !== null && heroKey !== dataGroup.userData.heroKey;

  clearGroup(dataGroup);

  // Cart — when present, takes the centre stage as hero.
  if (scene.cart) {
    const isHero = hero?.kind === "cart";
    const mesh = buildCartMesh(scene.cart, isHero);
    const pos = isHero
      ? { x: 0, y: HERO_FLOOR_Y, z: 0 }
      : { x: 0, y: 0.35, z: 1.0 };
    placeMesh(mesh, pos, isHero, { id: "cart", label: `Cart · ${scene.cart.itemCount}` });
    if (isHero && heroChanged) mesh.userData.spawnedAt = performance.now();
    dataGroup.add(mesh);
  }

  // Recent orders — newest at front of the right column.
  for (let i = 0; i < scene.recentOrders.length; i++) {
    const order = scene.recentOrders[i];
    const isHero = hero?.kind === "order" && hero.id === order.orderId;
    const mesh = buildOrderMesh(order, isHero);
    const pos = isHero
      ? { x: 0, y: HERO_FLOOR_Y, z: 0 }
      : { x: clamp(1.6, -ROOM.width / 2 + 0.5, ROOM.width / 2 - 0.5),
          y: 0.05,
          z: clamp(-2.0 + i * 0.5, -ROOM.depth / 2 + 0.5, ROOM.depth / 2 - 0.5) };
    placeMesh(mesh, pos, isHero, { id: `order:${order.orderId}`, label: order.orderId });
    if (isHero && heroChanged) mesh.userData.spawnedAt = performance.now();
    dataGroup.add(mesh);
  }

  // Aggregate stack — at most one mesh; signals "older history exists".
  if (scene.orderAggregates && scene.orderAggregates.olderCount > 0) {
    const mesh = buildAggregateMesh();
    const pos = { x: clamp(2.0, -ROOM.width / 2 + 0.5, ROOM.width / 2 - 0.5),
                  y: 0.05,
                  z: clamp(1.5, -ROOM.depth / 2 + 0.5, ROOM.depth / 2 - 0.5) };
    placeMesh(mesh, pos, false, {
      id: "aggregate",
      label: `+${scene.orderAggregates.olderCount} older`,
    });
    dataGroup.add(mesh);
  }

  // Products — back-left grid.
  for (let i = 0; i < scene.products.length; i++) {
    const product = scene.products[i];
    const isHero = hero?.kind === "product" && hero.id === product.productId;
    const mesh = buildProductMesh(product, isHero);
    const pos = isHero
      ? { x: 0, y: HERO_FLOOR_Y, z: 0 }
      : { x: clamp(-2.0 + (i % 3) * 1.2, -ROOM.width / 2 + 0.5, ROOM.width / 2 - 0.5),
          y: 0.05,
          z: clamp(-2.2 + Math.floor(i / 3) * 1.2, -ROOM.depth / 2 + 0.5, ROOM.depth / 2 - 0.5) };
    placeMesh(mesh, pos, isHero, { id: `product:${product.productId}`, label: product.name });
    if (isHero && heroChanged) mesh.userData.spawnedAt = performance.now();
    dataGroup.add(mesh);
  }

  dataGroup.userData.heroKey = heroKey;
}

// SSE — primary data path. Connects to /visualization-updates and renders each
// pushed snapshot directly. Falls back to polling on error.
function connectSse() {
  if (typeof EventSource === "undefined") { startPolling(); return; }

  if (sseSource) { sseSource.close(); sseSource = null; }
  clearTimeout(sseRetryHandle);
  sseRetryHandle = null;

  sseSource = new EventSource(`${API_BASE}/visualization-updates`);

  sseSource.addEventListener("open", () => {
    stopPolling();
    clearTimeout(sseRetryHandle);
    sseRetryHandle = null;
  });

  sseSource.addEventListener("message", (event) => {
    try {
      const body = JSON.parse(event.data);
      if (!body || typeof body.scene !== "object" || body.scene === null) {
        throw new Error("malformed");
      }
      renderScene(body.scene);
      const count = sceneObjectCount(body.scene);
      setStatus(`live (sse) · ${count} object${count === 1 ? "" : "s"}`);
    } catch {
      void loadAndRender();
    }
  });

  sseSource.addEventListener("error", () => {
    if (sseSource) { sseSource.close(); sseSource = null; }
    startPolling();
    sseRetryHandle = setTimeout(() => connectSse(), SSE_RETRY_MS);
  });
}

function startPolling() {
  stopPolling();
  void loadAndRender();
  pollHandle = setInterval(() => void loadAndRender(), POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollHandle !== null) { clearInterval(pollHandle); pollHandle = null; }
}

async function loadAndRender() {
  if (inflight) return;
  inflight = true;
  setStatus("polling…");
  try {
    let payload = null;
    try {
      payload = await fetchPayload();
    } catch (err) {
      if (dataGroup.children.length > 0) { setStatus(`error · ${err.message}`); return; }
    }
    if (payload && typeof payload.scene === "object" && payload.scene !== null) {
      renderScene(payload.scene);
      const count = sceneObjectCount(payload.scene);
      setStatus(`live · ${count} object${count === 1 ? "" : "s"}`);
      return;
    }
    // Offline: render the typed fallback scene so the showcase exercises the
    // same dispatcher as a live BFF.
    renderScene(FALLBACK_SCENE);
    const count = sceneObjectCount(FALLBACK_SCENE);
    setStatus(`offline · ${count} mock object${count === 1 ? "" : "s"}`);
  } finally {
    inflight = false;
  }
}

async function fetchPayload() {
  const res  = await fetch(`${API_BASE}/visualization-data`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body || typeof body !== "object" || typeof body.scene !== "object" || body.scene === null) {
    throw new Error("malformed response");
  }
  return body;
}

function sceneObjectCount(scene) {
  return (scene.products?.length ?? 0)
    + (scene.recentOrders?.length ?? 0)
    + (scene.cart ? 1 : 0)
    + (scene.orderAggregates?.olderCount > 0 ? 1 : 0);
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

// Main render loop.
// Hero spins faster than history (which doesn't spin at all). On hero promotion
// a brief scale-burst plays: ease-out cubic toward baseScale with a sinusoidal
// overshoot so the new item visibly "lands" on the stage.
// << EXTEND: replace the += with clock-delta maths for frame-rate independence.
function animate() {
  controls.update();
  const now = performance.now();
  for (const child of dataGroup.children) {
    const ud = child.userData;
    if (ud.idleRotate) child.rotation.y += ud.isHero ? 0.008 : 0.0;

    if (ud.spawnedAt !== undefined && ud.spawnedAt > 0) {
      const t = (now - ud.spawnedAt) / SPAWN_DURATION_MS;
      if (t < 1) {
        // Ease-out cubic + small overshoot so the new hero "pops" into place.
        const ease      = 1 - Math.pow(1 - t, 3);
        const overshoot = 0.18 * Math.sin(t * Math.PI);
        child.scale.setScalar(ud.baseScale * (ease + overshoot));
      } else {
        child.scale.setScalar(ud.baseScale);
        ud.spawnedAt = -Infinity; // freeze; subsequent frames skip the math.
      }
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

