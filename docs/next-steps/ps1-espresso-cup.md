# PS1 Espresso Cup — 3D Asset Milestone

## Status: signed off — pending fixed camera angle

The owner signed off the asset artistically and it is on `main`. One item
remains: the camera must sit at **one fixed angle and position that the user
cannot adjust** — no orbit, zoom, or pan. Today `scene.js` creates
`OrbitControls` around `camera.position.set(1.2, 0.65, 1.8)`, so users can
still move it.

File: `apps/visualizer-3d/public/objects/espresso-cup.js` (camera:
`apps/visualizer-3d/public/scene.js`)

The deficiency sections below are the iteration history that led to sign-off.

---

## What is working (keep as-is)

| Area | Detail |
|---|---|
| Geometry budget | Current source uses 40 triangles / 32 vertices because the saucer is now two-piece. This is still low-poly, but it no longer matches the earlier 28-triangle note and needs owner approval. |
| `buildSquareFrustum` | Custom `BufferGeometry`: 8 verts / 12 tris, exact spec topology |
| Pixel texture | 16×16 `CanvasTexture`, `NearestFilter`, dither noise — strong PS1 block look |
| Flat shading | `MeshLambertMaterial` + `flatShading: true` — each face a distinct shade |
| Idle rotation | 0.005 rad/frame ≈ 20 s/revolution, `userData.idleRotate` flag, all parts rotate as unit |
| `ESPRESSO_CFG` | Single configurable dev entry point — all dimensions, no magic numbers |
| `ESPRESSO_PALETTE` | Five named colours from spec reference image |
| Saucer source shape | Source now uses a two-piece square rim plus raised platform. Browser approval still pending. |
| Disposal | `clearGroup` traverses sub-meshes and disposes geometry + texture + material |
| SSE / polling | Primary SSE path with polling fallback; cup renders offline via `FALLBACK_SCENE` in `fallback.js` |
| `metadata.color` | Per-item colour override — separates ceramic tone from item status |

---

## Known artistic deficiencies (iteration targets)

These are the open issues blocking artistic approval, ordered by visual impact:

### 0. Real BFF data may lose ceramic colour  *(certification blocker)*
Offline fallback sets `metadata.color` to the off-white ceramic palette value,
but real product items produced by `VisualizationService.fromProduct()` do not
currently include a ceramic colour override. In the live BFF-driven scene, drink
products may therefore render with status colours such as green or amber.

**Suggested fix:** keep status information in data, but provide a separate
ceramic base colour or visual role for drink products so Three.js can render the
cup as white/off-white ceramic and show item status as a tint, accent, or
nearby marker.

### 1. Cup colour — WHITE CERAMIC  *(browser approval pending)*
The cup should render as **white or off-white ceramic** by default.
The fallback item now uses `ESPRESSO_PALETTE.lightBeige` (`#F1ECDA`), but the
real BFF-driven scene and the default lighting still need browser approval.
Status-colour overrides (green/amber/red for item status) should be
applied as a **tint or accent**, not replace the base colour.

**Certification check:** compare standalone `:3002` fallback and live BFF data
through `/visualizer`. Both must read as ceramic.

### 2. Saucer form — ANGLED / STEPPED TOP SURFACE  *(browser approval pending)*
The source now uses two square frustums: a wide rim and a raised central
platform. This may solve the old "flat coaster" read, but it still needs browser
approval from the default camera and at small icon sizes.

**Certification check:** saucer depth must be readable at the 45-degree orbit
angle. If it still reads as a coaster, Claude Code should tune the two-frustum
profile or switch to a shallow tapered saucer.

### 3. Coffee content — VISIBLE DARK FILL  *(browser approval pending)*
The current source uses `coffeeShrink: 0.02` and places the dark plane just
inside the rim. It still needs visual approval from the default camera.

**Certification check:** the dark coffee square must be visible without orbiting
or zooming.

### 4. Model scale — SMALL LOW-POLY ICON READ  *(browser approval pending)*
The current source has already reduced the main dimensions from the earlier
prototype. It still needs browser approval for default framing and icon-size
readability.

**Certification check:** the model should not fill more than 30% of viewport
width at the default camera.

### 5. Geometry budget drift  *(owner decision)*
The current source is 40 triangles because the saucer was split into rim and
platform. This is probably acceptable for readability, but it no longer matches
the earlier 28-triangle target. Owner approval should decide whether the saucer
depth is worth the extra 12 triangles.

---

## Artistic approval checklist

Before merging to `main`, the model must pass **all** of these at the default
camera position (`(1.5, 0.8, 2.0)` → lookAt `(0, 0.30, 0)`):

- [x] Cup reads as **white or off-white ceramic** — not beige, not green
- [x] Saucer **has visible depth** — single tapered-dish frustum (wide-at-top)
      readable from the 45° orbit angle and the side
- [x] Coffee **is clearly dark** and visibly set into the cup opening
      (open-top cup exposes the fill through the rim)
- [x] Handle **reads as a distinct element** separated from the cup body by a
      visible gap (sprite-thin flat plane, PS1 style)
- [x] At **16×16 icon size**, all four elements (saucer, body, handle, coffee)
      are independently recognisable
- [x] Model feels **small and contained** — not filling more than 30% of
      viewport width at default camera

---

## Geometry reference (current implementation)

```
Group pivot = saucer bottom = y=0 (world floor)

Part          Primitive                     Verts  Tris  Y (group-local)
────────────  ────────────────────────────  ─────  ────  ─────────────────────────
Saucer        buildSquareFrustum(top,bot,H)  8     12    0 → saucerH
              (topW > botW = dish slope)
Cup           buildOpenFrustum(t,b,H)        8     10    saucerH+gap → +bodyH
              (no top face = coffee visible)
Coffee fill   PlaneGeometry(W,W) rot -X      4      2    cup top − 0.01
Handle        PlaneGeometry(W,H) DoubleSide  4      2    cup centre Y
──────────────────────────────────────────────────────────────────────────────────
TOTAL                                        24    26     (Standard tier ≤ 28 ✓)
```

## Dev entry point

All geometry constants live in `ESPRESSO_CFG` at the top of
`apps/visualizer-3d/public/objects/espresso-cup.js`.
No magic numbers inside `buildEspressoGroup`. To iterate:

1. Edit `ESPRESSO_CFG` constants
2. Hard-reload `http://localhost:3002` (or the preview server)
3. Orbit with mouse to evaluate silhouette from multiple angles
4. Check icon readability by resizing the browser to ~200px wide

---

## Next iteration tasks

- [x] Resolve real BFF-driven ceramic colour for drink products
- [x] Browser-certify white/off-white ceramic colour (`lightBeige`)
- [x] Browser-certify saucer depth — redesigned as single tapered-dish frustum
- [x] Browser-certify coffee fill visibility — open-top cup exposes fill
- [x] Browser-certify model scale and default framing
- [x] Triangle budget resolved: 26 tris, Standard tier (≤ 28) — two-piece saucer removed
- [x] Evaluate at 64×64 icon size — owner approved
- [x] Artistic sign-off from project owner
- [x] Merge to `main` after approval
- [ ] Fix the camera: one fixed angle and position; remove user camera controls

## Extension: future domain assets

The `buildSquareFrustum` primitive and `ESPRESSO_CFG` pattern are the
foundation for the full product catalogue. Each new asset gets its own
module under `apps/visualizer-3d/public/objects/<asset>.js`:

```javascript
// apps/visualizer-3d/public/objects/snack.js
import * as THREE from "three";
import { makePsxTexture } from "../materials.js";
import { buildSquareFrustum } from "../geometry/frustum.js";

export const SNACK_CFG = { /* own config constant */ };

export function buildSnackGroup(color, cfg = SNACK_CFG) {
  const tex = makePsxTexture(color, cfg.texSize);
  const mkMat = () => new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const group = new THREE.Group();
  // ... primitives using buildSquareFrustum or PlaneGeometry
  return group;
}
```

Dispatch from a per-role factory in `objects/scene-meshes.js`:

```javascript
// In buildProductMesh (or a new per-role factory):
if (product.category === "snack") return buildSnackGroup(color, cfg);
```

Each new asset type should have its own `*_CFG` constant block, its own
module file, and its own entry in `docs/next-steps/` before implementation
begins.
