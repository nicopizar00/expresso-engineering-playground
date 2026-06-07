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
import { FALLBACK_SCENE } from "./fallback.js";
import { ROOM, buildRoom } from "./objects/room.js";
import { createRenderer, createAnimator } from "./layout/render.js";

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

const { renderScene, sceneObjectCount } = createRenderer({ dataGroup });
const animator = createAnimator({ scene, camera, renderer, controls, dataGroup });

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
animator.start();

// =============================================================================
// Transport — SSE primary, polling fallback (extracted to transport.js in Commit 5)
// =============================================================================

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

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function onResize() {
  const { clientWidth, clientHeight } = stage;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

