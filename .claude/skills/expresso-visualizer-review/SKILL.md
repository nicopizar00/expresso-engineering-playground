---
name: expresso-visualizer-review
description: Use to review Three.js scene changes under apps/visualizer-3d/public/ against the PS1 art direction and the Expresso Order Counter scene direction. Enforces material/geometry/texture/budget rules and the SSE/polling boundary.
---

# Expresso — Visualizer Review

## When to use

- Any change to `apps/visualizer-3d/public/scene.js`,
  `apps/visualizer-3d/public/index.html`, or new files in `public/`.
- Any change to the BFF `visualization` module or contracts that flow into
  the scene.
- Promoting a domain asset from WIP to certified.

## Read first

- `docs/visualizer/art-direction.md` — PS1 art rules: palette, polygon
  budget, texture, material, geometry, scale.
- `docs/next-steps/expresso-order-counter.md` — the active scene direction.
- `docs/next-steps/ps1-espresso-cup.md` — Classic Espresso cup acceptance
  criteria.
- `apps/visualizer-3d/public/scene.js` — single source of scene code.
- `apps/visualizer-3d/README.md` — runtime contract (SSE, polling).
- The BFF visualization module under `apps/bff/src/modules/visualization/`.

## Hard rule (load-bearing)

Edits to `scene.js` touch **only** `ESPRESSO_CFG` and `buildEspressoGroup`
(and the analogous `<asset>_CFG` / `build<Asset>Group` blocks for new
domain assets). The following are off-limits without a separate ADR:

- `buildSquareFrustum`
- `makePsxTexture`
- `clearGroup`
- The SSE / polling / reconnect plumbing
- Camera, light, and scene root setup

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
- [ ] BFF still emits **meaning**, not final mesh names. Existing `cube` /
      `sphere` / `marker` entries are kept only for backward compatibility.
- [ ] `FALLBACK_ITEMS` includes a deterministic entry for every new asset so
      offline mode is renderable.
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

- Do not approve changes outside the hard-rule allow-list without an ADR.
- Do not require backend mesh-name contracts; keep representation in the
  scene.
- Do not approve glossy / PBR / smooth-shaded materials for domain assets.
