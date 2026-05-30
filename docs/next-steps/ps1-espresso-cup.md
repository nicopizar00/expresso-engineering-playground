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
| Polygon budget | 28 triangles / 24 vertices — matches design spec |
| `buildSquareFrustum` | Custom `BufferGeometry`: 8 verts / 12 tris, exact spec topology |
| Pixel texture | 16×16 `CanvasTexture`, `NearestFilter`, dither noise — strong PS1 block look |
| Flat shading | `MeshLambertMaterial` + `flatShading: true` — each face a distinct shade |
| Idle rotation | 0.005 rad/frame ≈ 20 s/revolution, `userData.idleRotate` flag, all parts rotate as unit |
| `ESPRESSO_CFG` | Single configurable dev entry point — all dimensions, no magic numbers |
| `ESPRESSO_PALETTE` | Five named colours from spec reference image |
| Disposal | `clearGroup` traverses sub-meshes and disposes geometry + texture + material |
| SSE / polling | Primary SSE path with polling fallback; cup renders offline via `FALLBACK_ITEMS` |
| `metadata.color` | Per-item colour override — separates ceramic tone from inventory status |

---

## Known artistic deficiencies (iteration targets)

These are the open issues blocking artistic approval, ordered by visual impact:

### 1. Cup colour — WHITE CERAMIC  *(high impact)*
The cup should render as **white or off-white ceramic** by default.
The current `ESPRESSO_PALETTE.midBeige` (`#CBBE9A`) is a usable placeholder
but the reference spec calls for a brighter, cleaner white (`#F1ECDA` or
pure `0xFFFFFF`). Status-colour overrides (green/amber/red for inventory
health) should be applied as a **tint or accent**, not replace the base colour.

**Suggested fix:** change `FALLBACK_ITEMS[0].metadata.color` to
`ESPRESSO_PALETTE.lightBeige` (`0xF1ECDA`) and test. The final value needs
visual approval against the PS1 camera / lighting setup.

### 2. Saucer form — ANGLED TOP SURFACE  *(high impact)*
The saucer is currently a flat box (`buildSquareFrustum(W, W, H)` with no taper).
A real espresso saucer has a **shallow concave or domed top** — the surface
rises from the outer rim up to a raised central platform where the cup sits.

The current model reads as a coaster, not a saucer. The silhouette is too
flat and rectangular at any orbit angle other than directly above.

**Suggested geometry:** replace the single saucer box with two frustums:
- Outer ring: wide + very thin, outer radius `saucerW/2`, inner logic handled by
  position
- Inner platform: narrower + slightly taller, sitting in the centre

Or: a single frustum that tapers inward from the rim (`topW < botW` for the
saucer) to create the classic saucer slope.

### 3. Coffee content — VISIBLE DARK FILL  *(medium impact)*
The coffee `PlaneGeometry` is positioned correctly at the cup rim but is barely
visible from the default camera angle. The cup opening is small relative to the
camera distance, so the dark square is hard to read.

**Suggested fix:**
- Increase the coffee plane to fill more of the cup opening
  (`coffeeShrink` → `0.02` instead of `0.05`)
- Optionally add a very slight downward offset (2–3 mm below rim) so the dark
  square is recessed and creates a visible shadow contrast

### 4. Model scale — TOO LARGE FOR LOW-POLY ICON  *(medium impact)*
At the current dimensions the cup fills ~40% of the viewport from the default
camera. For a low-poly asset that should "feel like 800×600 PS1", the model
should be slightly smaller so that the polygon facets and pixel blocks read as
the dominant texture rather than the shape.

**Suggested fix:** reduce all `ESPRESSO_CFG` dimensions by ~20–25%:
```
bodyTopW: 0.26  (was 0.34)
bodyBotW: 0.32  (was 0.42)
bodyH:    0.34  (was 0.44)
saucerW:  0.56  (was 0.72)
saucerH:  0.055 (was 0.07)
```
Then adjust `camera.position` and `controls.target` to re-frame.

### 5. Polygon count — 30% FURTHER REDUCTION  *(low impact)*
The spec image reference shows only 26 triangles (13 quads). Current model is
28 triangles. The coffee `PlaneGeometry` adds 2 extra triangles over the spec.
If the coffee surface can be represented as a vertex colour or material colour
on the cup top face (no extra geometry), the budget would drop to 26 triangles
exactly.

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
Saucer        buildSquareFrustum(W,W,H)    8     12    0 → saucerH
Cup           buildSquareFrustum(t,b,H)    8     12    saucerH+gap → +bodyH
Coffee fill   PlaneGeometry(W,W) rot -X    4      2    cup top − 0.002
Handle        PlaneGeometry(W,H) DoubleSide 4     2    cup centre Y
──────────────────────────────────────────────────────────────────────
TOTAL                                      24    28
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
Do not redesign the asset from scratch. Only modify ESPRESSO_CFG values
and buildEspressoGroup. Verify in the browser preview before reporting done.
```

### GitHub Copilot / Codex
```
File: apps/visualizer-3d/public/scene.js
Task: Improve the Classic Espresso 3D cup model.
Context: see docs/next-steps/ps1-espresso-cup.md and
         docs/visualizer/art-direction.md
Constraints:
- Keep buildSquareFrustum unchanged
- Keep polygon budget ≤ 28 triangles
- Keep flatShading: true on MeshLambertMaterial
- Keep NearestFilter on all textures
- Only modify ESPRESSO_CFG and buildEspressoGroup
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

- [ ] Apply white/off-white ceramic colour (`lightBeige` or `0xF8F4EE`)
- [ ] Redesign saucer with angled top surface (two-frustum approach)
- [ ] Increase coffee fill visibility (reduce `coffeeShrink` to 0.02)
- [ ] Scale down model 20–25% and re-frame camera
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
