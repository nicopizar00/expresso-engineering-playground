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

// PS1 colour palette — extracted from the design spec reference image.
// All domain-object colours should draw from here.
// << EXTEND: add accent, highlight, or seasonal tones as the catalogue grows.
const ESPRESSO_PALETTE = {
  lightBeige: 0xF1ECDA,  // brightest surface / top faces
  midBeige:   0xCBBE9A,  // default cup/saucer body colour
  darkBeige:  0xA29272,  // shadow / underside faces
  coffee:     0x5B3A1E,  // espresso fill colour
  shadow:     0x2E251C,  // deepest shadow
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

// Inventory-status → mesh colour. Items that carry metadata.color bypass this.
// << EXTEND: add "featured", "new", "lowStock" etc. as the UI evolves.
const STATUS_COLORS = {
  ok:   0x4caf50,
  warn: 0xf2a200,
  error: 0xd64545,
  idle: 0x9aa0a6,
};

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
// Asset builder dispatch
// =============================================================================

// Pull RGB channels toward grey by `mix` ∈ [0,1]. mix=0 → original, mix=1 → grey.
// Used to recede history items so the hero keeps the visual weight.
function desaturateHex(hex, mix) {
  const r    = (hex >> 16) & 255;
  const g    = (hex >>  8) & 255;
  const b    =  hex        & 255;
  const grey = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
  const nr   = (r * (1 - mix) + grey * mix) | 0;
  const ng   = (g * (1 - mix) + grey * mix) | 0;
  const nb   = (b * (1 - mix) + grey * mix) | 0;
  return (nr << 16) | (ng << 8) | nb;
}

// =============================================================================
// Geometry primitive — square frustum
//
// Builds a box or tapered box with EXACTLY 8 vertices and 12 triangles,
// matching the design-spec polygon budget for both the cup and the saucer.
//
//   topW === botW  →  standard box (use for saucer)
//   topW  <  botW  →  tapered frustum (use for cup body)
//
// Pivot: bottom face sits at local y = 0; top face at local y = h.
// This means placing the mesh at y = 0 (in the group) puts its base on the
// group floor — group root = saucer bottom = world floor.
//
// UV notes: each corner vertex carries ONE UV shared across all adjacent faces.
// This produces the characteristic PS1 texture-distortion at corners (no
// perspective-correct texture mapping), which is an intentional retro artefact.
//
// Winding: all faces wound CCW when viewed from outside (right-hand outward normal).
// =============================================================================
function buildSquareFrustum(topW, botW, h) {
  const t = topW / 2;  // half-width top
  const b = botW / 2;  // half-width bottom

  // 8 unique vertex positions
  //   top ring (y = h):  v0 front-left, v1 front-right, v2 back-right, v3 back-left
  //   bot ring (y = 0):  v4 front-left, v5 front-right, v6 back-right, v7 back-left
  const pos = new Float32Array([
    -t, h, -t,   // 0  top  front-left   (-X, +Y, -Z)
     t, h, -t,   // 1  top  front-right  (+X, +Y, -Z)
     t, h,  t,   // 2  top  back-right   (+X, +Y, +Z)
    -t, h,  t,   // 3  top  back-left    (-X, +Y, +Z)
    -b, 0, -b,   // 4  bot  front-left   (-X,  0, -Z)
     b, 0, -b,   // 5  bot  front-right  (+X,  0, -Z)
     b, 0,  b,   // 6  bot  back-right   (+X,  0, +Z)
    -b, 0,  b,   // 7  bot  back-left    (-X,  0, +Z)
  ]);

  // UV: one coordinate per vertex, shared across faces.
  // Top ring maps to [0-1, 0-1]; bottom ring mirrors it.
  // Corner-shared UVs cause the deliberate PS1 per-face stretch artefact.
  const uv = new Float32Array([
    0, 1,  1, 1,  1, 0,  0, 0,   // verts 0-3 (top)
    0, 0,  1, 0,  1, 1,  0, 1,   // verts 4-7 (bottom)
  ]);

  // 12 triangles = 6 faces × 2 triangles per quad.
  // Each triple is one triangle; pairs share a face.
  // Normal direction verified for each face (see comment → direction):
  const idx = new Uint16Array([
    0, 2, 1,   0, 3, 2,   // top    → +Y
    4, 5, 6,   4, 6, 7,   // bottom → −Y
    0, 1, 5,   0, 5, 4,   // front  → −Z  (tapered: also +Y lean)
    1, 2, 6,   1, 6, 5,   // right  → +X  (tapered: also +Y lean)
    2, 3, 7,   2, 7, 6,   // back   → +Z  (tapered: also +Y lean)
    3, 0, 4,   3, 4, 7,   // left   → −X  (tapered: also +Y lean)
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv",       new THREE.BufferAttribute(uv,  2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals(); // used by Lambert for Gouraud; flatShading overrides in shader
  return geo;
}

// =============================================================================
// PS1 pixel texture factory
//
// Paints a tiny canvas (ESPRESSO_CFG.texSize × texSize, default 16×16) with
// the base colour and scatters dither-noise pixels at ~35 % density.
// NearestFilter + no mipmaps = zero interpolation → sharp visible blocks.
//
// Each call returns a NEW CanvasTexture so callers can share or dispose
// independently. The canvas element is GC'd once all references drop.
//
// << EXTEND: pass a patternFn(ctx, r, g, b, size) to stamp different surface
//    treatments (wood grain, metal scratches, label text) without changing
//    the filter setup.
// =============================================================================
function makePsxTexture(hexColor, size = 16) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = (hexColor >> 16) & 255;
  const g = (hexColor >>  8) & 255;
  const b =  hexColor        & 255;

  // Solid base fill
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  // Dither noise — scatters ~35 % of pixels with ±20 brightness jitter.
  // This recreates the quantisation noise visible on PS1 VRAM textures.
  const count = (size * size * 0.35) | 0;
  for (let i = 0; i < count; i++) {
    const v = ((Math.random() * 40 - 20) | 0);
    ctx.fillStyle = `rgb(${clamp(r+v,0,255)},${clamp(g+v,0,255)},${clamp(b+v,0,255)})`;
    ctx.fillRect((Math.random() * size) | 0, (Math.random() * size) | 0, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter       = THREE.NearestFilter;  // no interpolation → pixel blocks
  tex.minFilter       = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// =============================================================================
// Open-top frustum — cup body variant of buildSquareFrustum.
//
// Identical topology and UVs, but the top face (indices 0-5) is omitted so
// the cup opening is transparent and the coffee fill plane inside is visible
// from above and from the default camera.  8 verts / 10 tris.
//
// Do NOT modify buildSquareFrustum — this is a companion, not a replacement.
// =============================================================================
function buildOpenFrustum(topW, botW, h) {
  const t = topW / 2;
  const b = botW / 2;
  const pos = new Float32Array([
    -t, h, -t,   t, h, -t,   t, h,  t,  -t, h,  t,   // top ring  (verts 0-3)
    -b, 0, -b,   b, 0, -b,   b, 0,  b,  -b, 0,  b,   // bot ring  (verts 4-7)
  ]);
  const uv = new Float32Array([
    0, 1,  1, 1,  1, 0,  0, 0,
    0, 0,  1, 0,  1, 1,  0, 1,
  ]);
  const idx = new Uint16Array([
    // top face intentionally absent — cup is open
    4, 5, 6,   4, 6, 7,   // bottom → −Y
    0, 1, 5,   0, 5, 4,   // front  → −Z
    1, 2, 6,   1, 6, 5,   // right  → +X
    2, 3, 7,   2, 7, 6,   // back   → +Z
    3, 0, 4,   3, 4, 7,   // left   → −X
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uv,  2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// =============================================================================
// Fallback data — offline showcase, no backend required.
//
// Typed scene with a single non-empty cart → ceramic cup rendered as hero;
// exercises the same dispatcher as a live BFF.
// =============================================================================
const FALLBACK_SCENE = {
  products: [],
  recentOrders: [],
  orderAggregates: {
    totalCount: 0,
    olderCount: 0,
    statusCounts: { pending: 0, preparing: 0, prepared: 0, cancelled: 0 },
  },
  cart: {
    itemCount: 1,
    total: { amountMinor: 180, currency: "EUR" },
    updatedAt: Date.now(),
  },
  latestActivityAt: Date.now(),
};
