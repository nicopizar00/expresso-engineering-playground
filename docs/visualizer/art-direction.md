# 3D Visualizer — PS1 Art Direction

This document governs the visual language for all 3D assets in
`apps/visualizer-3d`. Every asset added to the scene must comply with the
aesthetic rules below. Read this before writing any geometry code.

---

## Design philosophy

The visualizer renders domain objects in the style of **early PlayStation 1
(1994–1998) graphics**: extremely low polygon counts, flat shading, visible
pixel-block textures, and sharp geometry. Think *Jumping Flash*, *Armored
Core*, *Alundra* — not modern indie "lo-fi 3D".

The goal is **not maximum polygon reduction**. The goal is the aesthetic
**sweet spot** where an object is:

- Instantly recognisable as its real-world counterpart
- Clearly angular and faceted (no smooth curves or subdivisions)
- Readable at icon sizes (16×16 to 64×64 px)
- Visually charming rather than merely utilitarian

---

## Colour palette

All domain assets draw colours exclusively from this palette. No other
hex values should appear in asset builders.

| Name | Hex | Usage |
|---|---|---|
| `lightBeige` | `#F1ECDA` | Brightest surface, top faces, ceramic white |
| `midBeige` | `#CBBE9A` | Default body colour, status-neutral base |
| `darkBeige` | `#A29272` | Shadow faces, undersides |
| `coffee` | `#5B3A1E` | Espresso fill, dark surfaces |
| `shadow` | `#2E251C` | Deepest shadow, contour lines |

Inventory-status colours (`STATUS_COLORS`) are used for **non-drink** items
(spheres, cubes, cones) that represent generic catalogue entries. When an item
has `metadata.color`, that value overrides `STATUS_COLORS`.

---

## Polygon budget

| Complexity tier | Max triangles | When to use |
|---|---|---|
| Micro (icon only) | ≤ 8 | Simple tokens, markers |
| Standard | ≤ 28 | Primary domain objects (espresso cup) |
| Feature | ≤ 60 | Complex objects with multiple sub-parts |
| Scene prop | ≤ 120 | Background / environment decoration |

The Classic Espresso cup sits at the **Standard** tier (28 triangles).

---

## Texture rules

| Parameter | Value | Reason |
|---|---|---|
| Canvas resolution | 16×16 or 32×32 px | PS1 VRAM tile sizes |
| `magFilter` | `NearestFilter` | No interpolation → sharp pixel blocks |
| `minFilter` | `NearestFilter` | Consistent at all distances |
| `generateMipmaps` | `false` | Nearest + mipmaps = inconsistent blur |
| Noise density | ~35% of pixels at ±20 brightness | Simulates PS1 dither compression |

Never use `LinearFilter`, `MipMapLinearFilter`, or any smoothing on domain
asset textures.

---

## Material rules

- **Use `MeshLambertMaterial`** (Gouraud, per-vertex) with `flatShading: true`.
  This gives each polygon face a uniform shade — the dominant PS1 visual.
- Never use `MeshStandardMaterial` or `MeshPhysicalMaterial` for domain assets.
  PBR (roughness, metalness) is incompatible with the PS1 aesthetic.
- `MeshBasicMaterial` (unlit) is allowed **only** for fill surfaces like coffee
  or interior shadows that must stay dark regardless of lighting angle.
- Each mesh must own its **own material instance** for clean disposal.
  Shared material instances cause double-dispose corruption.

---

## Geometry rules

1. **Square / n-gon openings only** — No circles. Minimum 4 edges per opening.
   The Classic Espresso cup uses 4-edge openings (square cross-section).
2. **No `CylinderGeometry` with > 10 segments** for primary domain parts.
3. **No `SphereGeometry`** in domain assets (too smooth, too many polygons).
4. **No `TorusGeometry` with > 8 total segments** (3 radial × 6 tubular is the max).
5. **No booleans / CSG** — no holes cut into meshes.
6. **No extrusions** — handles are flat planes (`PlaneGeometry`, `DoubleSide`).
7. **All angles are 90°** — no chamfers, no bevels, no fillet edges.
8. **Use `buildSquareFrustum(topW, botW, h)`** as the default building block
   for any box or tapered box shape.

---

## Scale reference

The scene floor is at `y = 0`. One world unit = approximately one cup height.

```
World scale guide
─────────────────────────────────────
Floor          y = 0
Saucer top     y ≈ 0.07–0.10
Cup base       y ≈ 0.12–0.16  (after gap)
Cup top        y ≈ 0.50–0.60
Camera         (1.5, 0.8, 2.0) → lookAt (0, 0.30, 0)
```

At the default camera: a 0.45-unit-tall object fills roughly 25–30% of the
viewport height. Aim for objects in the **0.35–0.55 unit** total height range.

---

## Silhouette test

Before committing an asset, verify its silhouette from these four angles:

1. **Default camera** `(1.5, 0.8, 2.0)` → standard product-showcase view
2. **Top-down** (orbit straight above) → shape must be recognisable
3. **Side** (orbit 90° around Y) → depth and handle must read correctly
4. **Icon scale** (resize browser to ~200px wide) → asset must still be
   identifiable with all key elements present

---

## Adding a new asset

1. Create a new `*_CFG` constant block adjacent to `ESPRESSO_CFG`
2. Add the corresponding entry in `docs/next-steps/` **before** coding
3. Implement `buildXxxGroup(color)` following the `buildEspressoGroup` pattern
4. Add a dispatch in `buildItemMesh` via `metadata.category`
5. Add an offline fallback entry in `FALLBACK_ITEMS`
6. Run the silhouette test above
7. Verify `clearGroup` traversal disposes all geometry and textures

---

## Governance

Any change to this document requires explicit sign-off from the project owner.
Changes to `ESPRESSO_PALETTE` or the polygon budget table affect every existing
and future asset and must be reviewed as a breaking change.
