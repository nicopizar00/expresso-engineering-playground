---
name: expresso-visualizer-review
description: Use to review Three.js scene changes under apps/visualizer-3d/public/ against the PS1 art direction and the Expresso Order Counter scene direction. Enforces material/geometry/texture/budget rules and the SSE/polling boundary.
---

# Expresso — Visualizer Review

## When to use

- Any change under `apps/visualizer-3d/public/` (scene.js, materials.js,
  geometry/, objects/, layout/, transport.js, fallback.js, index.html, or a
  new file).
- Any change to the BFF `visualization` module or contracts that flow into
  the scene.
- Promoting a domain asset from WIP to certified.

## Read first

- `docs/visualizer/art-direction.md` — PS1 art rules: palette, polygon
  budget, texture, material, geometry, scale.
- `docs/next-steps/expresso-order-counter.md` — the active scene direction.
- `docs/next-steps/ps1-espresso-cup.md` — Classic Espresso cup acceptance
  criteria.
- `apps/visualizer-3d/public/` — the ESM module graph (entry: `scene.js`).
- `apps/visualizer-3d/README.md` — runtime contract (SSE, polling) and
  module layout.
- The BFF visualization module under `apps/bff/src/modules/visualization/`.

## Module discipline

The visualizer is one concern per file. A change should touch the smallest
module that owns the concern:

| Concern | Module |
|---|---|
| Palette / status colours / PS1 texture | `materials.js` |
| Frustum primitives | `geometry/frustum.js` |
| Room / floor grid | `objects/room.js` |
| Classic Espresso cup (config + builder) | `objects/espresso-cup.js` |
| Per-role scene meshes (product / order / aggregate / cart) | `objects/scene-meshes.js` |
| Disposal traversal | `objects/disposal.js` |
| Hero pick + scene placement + animate loop | `layout/render.js` |
| SSE primary + polling fallback | `transport.js` |
| Offline showcase | `fallback.js` |
| DOM + Three.js bootstrap + factory wiring | `scene.js` |

**Boundary violations to flag as `blocker`:**

- Network / SSE / fetch code outside `transport.js`.
- Mesh / geometry / material construction inside `transport.js` or `scene.js`.
- New hex literals outside `materials.js` (must come from `ESPRESSO_PALETTE`
  or `STATUS_COLORS`).
- New `*_CFG` constant block outside its asset module (`objects/<asset>.js`).
- `scene.js` growing render or transport logic instead of importing factories.

## Review checklist

### Art compliance
- [ ] Palette values are sourced from `ESPRESSO_PALETTE` (no new hex codes).
- [ ] `MeshLambertMaterial` with `flatShading: true` for domain assets.
      `MeshBasicMaterial` only for unlit fill (coffee, interior shadow).
- [ ] Textures use `NearestFilter` for `mag`/`min`, `generateMipmaps: false`,
      16×16 or 32×32 canvas.
- [ ] No `SphereGeometry`, no chamfers/bevels, no booleans, no extrusions.
- [ ] Polygon count within the documented tier (Standard ≤ 28 for primary
      domain objects).

### Boundary compliance
- [ ] The scene reads only `GET /visualization-data` and
      `GET /visualization-updates`. No new direct calls to the BFF or DB.
- [ ] BFF emits the typed `scene` shape (no `items[]` regression).
- [ ] `FALLBACK_SCENE` covers any new domain object so offline mode is
      renderable.
- [ ] `clearGroup` traversal will dispose new geometry / textures (each mesh
      owns its own material instance).

### Scene-direction compliance
- [ ] The change moves toward the Expresso Order Counter direction; nothing
      regresses toward the old "Hello Room" generic scene.
- [ ] Historical orders do not produce unbounded per-row geometry — they are
      aggregated.
- [ ] Asset is readable at icon scale (silhouette test from 4 angles).

## Output

- Findings tagged `blocker` / `should-fix` / `nit`, each with a code anchor.
- Confirmation of the silhouette test (default, top, side, icon scale).
- Confirmation of the SSE repaint after a cart/checkout/manage mutation if
  the change affects the data path.
- A note on which `docs/next-steps/<topic>.md` covers this change.

## Don'ts

- Do not approve module-boundary violations without an explicit owner
  decision.
- Do not require backend mesh-name contracts; keep representation in the
  scene.
- Do not approve glossy / PBR / smooth-shaded materials for domain assets.
