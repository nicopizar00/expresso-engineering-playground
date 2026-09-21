import * as THREE from "three";
import {
  ESPRESSO_PALETTE,
  STATUS_COLORS,
  desaturateHex,
  makePsxTexture,
} from "../materials.js";
import { buildSquareFrustum } from "../geometry/frustum.js";
import { ESPRESSO_CFG, buildEspressoGroup } from "./espresso-cup.js";

// Per-role mesh factories for the typed `VisualizationScene` shape.
// All meshes are colourised once at build time; renderer placement and scale
// belong to layout/render.js.

export function buildProductMesh(product, isHero) {
  const isDrink = product.category === "drink";
  const baseColor = isDrink
    ? ESPRESSO_PALETTE.lightBeige
    : STATUS_COLORS[product.status] ?? STATUS_COLORS.idle;
  const color = isHero ? baseColor : desaturateHex(baseColor, 0.55);
  if (isDrink) {
    const cfg = product.assetConfig ? { ...ESPRESSO_CFG, ...product.assetConfig } : ESPRESSO_CFG;
    return buildEspressoGroup(color, cfg);
  }
  // Non-drink products: small low-poly cube via the shared frustum primitive.
  const tex = makePsxTexture(color, ESPRESSO_CFG.texSize);
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  return new THREE.Mesh(buildSquareFrustum(0.45, 0.45, 0.45), mat);
}
