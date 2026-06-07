import * as THREE from "three";

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
export function buildSquareFrustum(topW, botW, h) {
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
// Open-top frustum — cup body variant of buildSquareFrustum.
//
// Identical topology and UVs, but the top face (indices 0-5) is omitted so
// the cup opening is transparent and the coffee fill plane inside is visible
// from above and from the default camera.  8 verts / 10 tris.
//
// Do NOT modify buildSquareFrustum — this is a companion, not a replacement.
// =============================================================================
export function buildOpenFrustum(topW, botW, h) {
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
