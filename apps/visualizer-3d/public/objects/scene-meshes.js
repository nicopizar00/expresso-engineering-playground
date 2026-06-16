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

export function buildOrderMesh(order, isHero) {
  const baseColor = STATUS_COLORS[order.vizStatus] ?? STATUS_COLORS.idle;
  const color = isHero ? baseColor : desaturateHex(baseColor, 0.55);
  const tex = makePsxTexture(color, ESPRESSO_CFG.texSize);
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  // Thin slab — reads as a "ticket" on the counter.
  return new THREE.Mesh(buildSquareFrustum(0.28, 0.28, 0.10), mat);
}

export function buildAggregateMesh() {
  const color = desaturateHex(STATUS_COLORS.idle, 0.4);
  const tex = makePsxTexture(color, ESPRESSO_CFG.texSize);
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const group = new THREE.Group();
  // Three stacked thin slabs to suggest "many older orders".
  for (let i = 0; i < 3; i++) {
    const slab = new THREE.Mesh(buildSquareFrustum(0.40, 0.40, 0.07), mat);
    slab.position.y = i * 0.08;
    group.add(slab);
  }
  return group;
}

export function buildCartMesh(cart, isHero) {
  const baseColor = ESPRESSO_PALETTE.lightBeige;
  const color = isHero ? baseColor : desaturateHex(baseColor, 0.55);
  const cfg = cart.assetConfig ? { ...ESPRESSO_CFG, ...cart.assetConfig } : ESPRESSO_CFG;
  return buildEspressoGroup(color, cfg);
}
