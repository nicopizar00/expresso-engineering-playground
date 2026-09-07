import * as THREE from "three";
import { ESPRESSO_PALETTE, makePsxTexture } from "../materials.js";
import { buildSquareFrustum, buildOpenFrustum } from "../geometry/frustum.js";

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
export const ESPRESSO_CFG = {
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
export function buildEspressoGroup(color, cfg = ESPRESSO_CFG) {
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
