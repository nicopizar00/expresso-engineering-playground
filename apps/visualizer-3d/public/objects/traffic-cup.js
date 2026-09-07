// apps/visualizer-3d/public/objects/traffic-cup.js
//
// Workflow-traffic falling cups — additive concern, independent of the
// domain-state Classic Espresso cup (objects/espresso-cup.js). Reuses
// buildSquareFrustum + makePsxTexture per the module-discipline convention.
// Standard tier: 12 triangles (one buildSquareFrustum call), well under the
// 28-triangle budget.
import * as THREE from "three";
import { buildSquareFrustum } from "../geometry/frustum.js";
import { makePsxTexture, STATUS_COLORS, TRAFFIC_COLORS } from "../materials.js";

const TRAFFIC_CUP_CFG = {
  topW: 0.14,
  botW: 0.11,
  height: 0.14,
  texSize: 16,
  spawnY: 3.0,
  laneBaseX: -1.8,
  laneSpacingX: 0.6,
};

// Mirrors use-cases/catalog.json's `visual.lane` / `visual.label` for the
// three adapters this MVP wires up (commerce.catalog-browse,
// commerce.order-lookup, commerce.purchase). A live fetch would remove this
// duplication; deferred until more adapters are added — see
// docs/specs/live-workflow-traffic-and-falling-cups.md.
const TRAFFIC_USE_CASE_META = {
  "commerce.catalog-browse": { lane: 0, label: "Catalog browse" },
  "commerce.order-lookup":   { lane: 3, label: "Order lookup" },
  "commerce.purchase":       { lane: 2, label: "Purchase" },
};

export function trafficVisualFor(useCaseId) {
  const meta = TRAFFIC_USE_CASE_META[useCaseId] ?? { lane: 0, label: useCaseId };
  return {
    label: meta.label,
    laneX: TRAFFIC_CUP_CFG.laneBaseX + meta.lane * TRAFFIC_CUP_CFG.laneSpacingX,
    spawnY: TRAFFIC_CUP_CFG.spawnY,
  };
}

export function buildTrafficCupGroup(useCaseId) {
  const colorInt = TRAFFIC_COLORS[useCaseId] ?? STATUS_COLORS.idle;
  const tex = makePsxTexture(colorInt, TRAFFIC_CUP_CFG.texSize);
  const mat = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
  const geo = buildSquareFrustum(TRAFFIC_CUP_CFG.topW, TRAFFIC_CUP_CFG.botW, TRAFFIC_CUP_CFG.height);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  return group;
}
