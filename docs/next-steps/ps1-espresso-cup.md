# PS1 Espresso Cup — 3D Asset Milestone

## Status: WIP / Beta — pending artistic approval

The geometry foundation is solid and the technical implementation is correct.
The model has **not yet passed artistic review**. A human visual sign-off is
required before this asset is promoted to the default scene render.

Branch: `feature/ps1-espresso-cup`
File: `apps/visualizer-3d/public/scene.js`

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
| SSE / polling | Primary SSE path with polling fallback; cup renders offline via `FALLBACK_ITEMS` |
| `metadata.color` | Per-item colour override — separates ceramic tone from inventory status |

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
cup as white/off-white ceramic and show inventory health as a tint, accent, or
nearby marker.

### 1. Cup colour — WHITE CERAMIC  *(browser approval pending)*
The cup should render as **white or off-white ceramic** by default.
The fallback item now uses `ESPRESSO_PALETTE.lightBeige` (`#F1ECDA`), but the
real BFF-driven scene and the default lighting still need browser approval.
Status-colour overrides (green/amber/red for inventory health) should be
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

- [ ] Cup reads as **white or off-white ceramic** — not beige, not green
- [ ] Saucer **has visible depth** — the stepped or sloped saucer profile is
      readable from the 45° orbit angle
- [ ] Coffee **is clearly dark** and visibly set into the cup opening
- [ ] Handle **reads as a distinct element** separated from the cup body by a
      visible gap
- [ ] At **16×16 icon size**, all four elements (saucer, body, handle, coffee)
      are independently recognisable
- [ ] Model feels **small and contained** — not filling more than 30% of
      viewport width at default camera

---

## Geometry reference (current implementation)

```
Group pivot = saucer bottom = y=0 (world floor)

Part          Primitive                   Verts  Tris  Y (group-local)
────────────  ──────────────────────────  ─────  ────  ──────────────
Saucer rim    buildSquareFrustum(W,W,H)    8     12    0 → saucerRimH
Platform      buildSquareFrustum(W,W,H)    8     12    saucerRimH → +platformH
Cup           buildSquareFrustum(t,b,H)    8     12    rim+platform+gap → +bodyH
Coffee fill   PlaneGeometry(W,W) rot -X    4      2    cup top − 0.002
Handle        PlaneGeometry(W,H) DoubleSide 4     2    cup centre Y
──────────────────────────────────────────────────────────────────────
TOTAL                                      32    40
```

## Dev entry point

All geometry constants live in `ESPRESSO_CFG` at the top of `scene.js`.
No magic numbers inside `buildEspressoGroup`. To iterate:

1. Edit `ESPRESSO_CFG` constants
2. Hard-reload `http://localhost:3002` (or the preview server)
3. Orbit with mouse to evaluate silhouette from multiple angles
4. Check icon readability by resizing the browser to ~200px wide

---

## AI tool prompts for next iteration

### Claude Code (this tool)
```
Using docs/next-steps/ps1-espresso-cup.md as the reference,
iterate on the Classic Espresso cup in apps/visualizer-3d/public/scene.js.
Focus on artistic deficiency #N from the known-issues list.
Do not redesign the asset from scratch. For asset-shape/color issues, prefer
small changes to ESPRESSO_CFG and buildEspressoGroup. For deficiency #0, inspect
the visualization data contract before changing scene code. Verify in the
browser preview before reporting done.
```

### Codex certification
```
Use docs/ai/codex/artistic-certification-prompt.md or the
visualizer-artistic-certification skill. Certify the current visualizer in the
browser at http://localhost:3002 and http://localhost:3000/visualizer. Report
PASS / FAIL / DRIFT / SKIP and leave implementation to Claude Code.
```

### v0.app
```
Design a PS1-era espresso cup icon for a retro e-commerce visualizer.
Reference palette: #F1ECDA (light beige / ceramic), #CBBE9A (mid),
#A29272 (shadow), #5B3A1E (coffee), #2E251C (deep shadow).
Style: flat shading, square openings, no round edges, visible pixel blocks,
800x600 era 3D graphics. Asset must read clearly at 16x16 pixels.
Show: saucer with sloped rim, tapered square cup body, flat handle, dark coffee fill.
```

---

## Next iteration tasks

- [ ] Resolve real BFF-driven ceramic colour for drink products
- [ ] Browser-certify white/off-white ceramic colour (`lightBeige` or `0xF8F4EE`)
- [ ] Browser-certify saucer depth from the default and 45-degree camera
- [ ] Browser-certify coffee fill visibility
- [ ] Browser-certify model scale and default framing
- [ ] Decide whether the 40-triangle two-piece saucer is approved
- [ ] Evaluate at 16×16, 32×32, 64×64 icon sizes
- [ ] Artistic sign-off from project owner
- [ ] Merge to `main` after approval

## Extension: future domain assets

The `buildSquareFrustum` primitive and `ESPRESSO_CFG` pattern are the
foundation for the full product catalogue. Follow this convention for each
new asset:

```javascript
// In buildItemMesh:
if (item.metadata?.category === "snack") return buildSnackGroup(color);
if (item.metadata?.category === "merch") return buildMerchGroup(color);

// Each builder follows the same pattern:
function buildSnackGroup(color) {
  const { ...cfg } = SNACK_CFG;          // own config constant
  const tex = makePsxTexture(color, cfg.texSize);
  const mkMat = () => new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const group = new THREE.Group();
  // ... primitives using buildSquareFrustum or PlaneGeometry
  return group;
}
```

Each new asset type should have its own `*_CFG` constant block and its own
entry in `docs/next-steps/` before implementation begins.
