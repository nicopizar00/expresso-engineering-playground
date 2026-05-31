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
// Polygon budget per the design spec:
//   Cup body         : 6 quads / 12 triangles / 8 vertices  (square frustum)
//   Saucer rim       : 6 quads / 12 triangles / 8 vertices  (flat box)
//   Saucer platform  : 6 quads / 12 triangles / 8 vertices  (raised square)
//   Handle           : 1 quad  /  2 triangles / 4 vertices  (flat vertical plane)
//   Coffee           : 1 quad  /  2 triangles / 4 vertices  (flat horizontal plane)
//   TOTAL            : 40 triangles / 32 vertices
// =============================================================================
const ESPRESSO_CFG = {
  // ── Cup body (square frustum: wider at base = classic taper) ──────────────
  bodyTopW: 0.26,   // top opening side length  (square, 4 edges)
  bodyBotW: 0.33,   // base side length         (wider = taper)
  bodyH:    0.34,   // cup height

  // ── Saucer (two-piece: wide flat rim + raised centre platform) ────────────
  saucerW:         0.56,   // outer rim side length (square, wider than cup base)
  saucerRimH:      0.02,   // flat base rim thickness
  saucerPlatformW: 0.36,   // raised centre platform side length
  saucerPlatformH: 0.037,  // platform height (cup rests on this)

  // ── Air gap between saucer platform top and cup base ─────────────────────
  gap:      0.04,   // increase for more "floating" cup look

  // ── Handle (single flat quad, DoubleSide, no extrusion) ──────────────────
  handleW:   0.08,  // quad width
  handleH:   0.20,  // quad height  (~60 % of cup body height)
  handleGap: 0.02,  // air gap between cup right wall and handle left edge

  // ── Coffee fill (flat dark quad flush with cup rim) ───────────────────────
  coffeeShrink: 0.02, // inset from cup top opening on each side

  // ── PS1 texture ──────────────────────────────────────────────────────────
  // 16 → large visible blocks (strong PS1)   32 → finer but still pixelated
  // Change to 8 for extreme PS1 crunch.
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

function buildItemMesh(item) {
  // metadata.color lets individual items override the status palette.
  // BFF items without metadata.color fall back to STATUS_COLORS[status].
  const color = item.metadata?.color ?? STATUS_COLORS[item.status] ?? STATUS_COLORS.idle;

  // << EXTEND: add more category dispatches here as the domain catalogue grows.
  //    Pattern: if (item.metadata?.category === "snack") return buildSnackGroup(color);
  if (item.metadata?.category === "drink") {
    const hint = item.positionHint ?? { x: 0, y: 0, z: 0 };
    const group = buildEspressoGroup(color);
    group.position.set(
      clamp(hint.x, -ROOM.width / 2 + 0.5, ROOM.width / 2 - 0.5),
      Math.max(0.002, hint.y),  // saucer pivot = its own bottom face; 2 mm clearance
      clamp(hint.z, -ROOM.depth / 2 + 0.5, ROOM.depth / 2 - 0.5),
    );
    group.userData = {
      id: item.id,
      label: item.label,
      type: item.type,
      status: item.status,
      baseY: Math.max(0.002, hint.y),
      phase: Math.random() * Math.PI * 2, // staggered start angle when multiple cups shown
      baseScale: 1,
      idleRotate: true, // drives the slow Y-axis spin in animate()
    };
    return group;
  }

  // Generic fallback geometry for non-domain items (spheres, cubes, cones).
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
  let geometry;
  switch (item.type) {
    case "sphere": geometry = new THREE.SphereGeometry(0.35, 24, 16); break;
    case "marker": geometry = new THREE.ConeGeometry(0.3, 0.7, 16);   break;
    case "cube":
    default:       geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);   break;
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
// Classic Espresso — PS1 low-poly cup group
//
// Topology matches the design spec exactly:
//   Saucer rim    : buildSquareFrustum(W, W, rimH)      →  8 verts / 12 tris
//   Saucer platform: buildSquareFrustum(W, W, platH)   →  8 verts / 12 tris
//   Cup body      : buildSquareFrustum(topW, botW, H)  →  8 verts / 12 tris
//   Handle        : PlaneGeometry(W, H)                →  4 verts /  2 tris
//   Coffee        : PlaneGeometry(W, W)                →  4 verts /  2 tris
//   ─────────────────────────────────────────────────────────────────────────
//   TOTAL                                                 32 verts / 40 tris
//
// Group pivot = bottom of saucer (y = 0 in group space).
// Place the group at world y ≈ 0 to sit the saucer flush on the floor.
//
// Y-position derivation (all in group-local space):
//   saucer bottom   y = 0
//   saucer top      y = saucerH
//   gap             y = saucerH  →  saucerH + gap
//   cup bottom      y = saucerH + gap
//   cup top         y = saucerH + gap + bodyH
//   coffee fill     y ≈ cup top  (just inside rim)
//   handle centre   y = saucerH + gap + bodyH / 2
//
// << EXTEND: add new drink variants (latte glass, americano mug) by
//    calling buildSquareFrustum with different topW / botW / bodyH values
//    and routing via a second category flag in metadata.
// =============================================================================
function buildEspressoGroup(color) {
  const {
    bodyTopW, bodyBotW, bodyH,
    saucerW, saucerRimH, saucerPlatformW, saucerPlatformH, gap,
    handleW, handleH, handleGap,
    coffeeShrink, texSize,
  } = ESPRESSO_CFG;

  const tex    = makePsxTexture(color, texSize);
  // Each mesh gets its own material instance so clearGroup can dispose them
  // independently without double-freeing a shared reference.
  const mkMat  = () => new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const group  = new THREE.Group();

  // ── Saucer — two-piece: flat outer rim + raised centre platform ──────────
  // Rim: wide flat base sitting at group y = 0 (floor contact).
  // Platform: narrower raised square centred on the rim; cup rests on top.
  const saucerRim = new THREE.Mesh(
    buildSquareFrustum(saucerW, saucerW, saucerRimH),
    mkMat(),
  );
  group.add(saucerRim);
  const saucerPlatform = new THREE.Mesh(
    buildSquareFrustum(saucerPlatformW, saucerPlatformW, saucerPlatformH),
    mkMat(),
  );
  saucerPlatform.position.y = saucerRimH;
  group.add(saucerPlatform);

  // ── Cup body ─────────────────────────────────────────────────────────────
  // Tapered square frustum: top opening smaller than base (classic cup shape).
  const cupBotY = saucerRimH + saucerPlatformH + gap;
  const cup     = new THREE.Mesh(buildSquareFrustum(bodyTopW, bodyBotW, bodyH), mkMat());
  cup.position.y = cupBotY;
  group.add(cup);

  // ── Coffee fill ───────────────────────────────────────────────────────────
  // Flat unlit dark quad, horizontal, flush with the cup rim.
  // PlaneGeometry lies in XY; rotate −90° around X to make it horizontal.
  const coffeeW = bodyTopW - coffeeShrink;
  const coffee  = new THREE.Mesh(
    new THREE.PlaneGeometry(coffeeW, coffeeW),
    new THREE.MeshBasicMaterial({ color: ESPRESSO_PALETTE.coffee }),
  );
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = cupBotY + bodyH - 0.002; // just inside the cup rim
  group.add(coffee);

  // ── Handle ────────────────────────────────────────────────────────────────
  // Single flat vertical quad (DoubleSide so it renders on both orbit passes).
  // Positioned to the right of the cup with a small visible air gap.
  // PlaneGeometry in the XY plane faces ±Z by default — visible from the front.
  const handleX = bodyBotW / 2 + handleGap + handleW / 2;
  const handleY = cupBotY + bodyH / 2; // vertically centred on the cup body
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
      if (!Array.isArray(body?.items)) throw new Error("malformed");
      clearGroup(dataGroup);
      for (const item of body.items) dataGroup.add(buildItemMesh(item));
      setStatus(`live (sse) · ${body.items.length} item${body.items.length === 1 ? "" : "s"}`);
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
    let items = null;
    try {
      items = await fetchItems();
    } catch (err) {
      if (dataGroup.children.length > 0) { setStatus(`error · ${err.message}`); return; }
    }
    clearGroup(dataGroup);
    const source = items ?? FALLBACK_ITEMS;
    for (const item of source) dataGroup.add(buildItemMesh(item));
    setStatus(
      items
        ? `live · ${items.length} item${items.length === 1 ? "" : "s"}`
        : `offline · ${FALLBACK_ITEMS.length} mock item${FALLBACK_ITEMS.length === 1 ? "" : "s"}`,
    );
  } finally {
    inflight = false;
  }
}

async function fetchItems() {
  const res  = await fetch(`${API_BASE}/visualization-data`, { headers: { accept: "application/json" } });
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

// Main render loop.
// idleRotate speed: 0.005 rad/frame ≈ one full rotation every ~20 s at 60 fps.
// << EXTEND: replace the += with clock-delta maths for frame-rate independence.
function animate() {
  controls.update();
  for (const child of dataGroup.children) {
    if (child.userData.idleRotate) child.rotation.y += 0.005;
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
// metadata.color overrides STATUS_COLORS for this item so the showcase cup
// renders in the spec's beige palette rather than the green "ok" status colour.
//
// << EXTEND: add more domain items here to populate the offline showcase.
//    Convention: metadata.category drives the builder in buildItemMesh();
//                metadata.color  sets the PS1 texture base colour directly.
// =============================================================================
const FALLBACK_ITEMS = [
  {
    id: "espresso_classic",
    label: "Classic Espresso",
    type: "cube",
    value: 45,
    status: "ok",
    positionHint: { x: 0, y: 0, z: 0 },
    metadata: {
      category: "drink",
      inventory: 45,
      source: "catalog",
      color: ESPRESSO_PALETTE.lightBeige, // 0xF1ECDA — white ceramic
    },
  },
];
