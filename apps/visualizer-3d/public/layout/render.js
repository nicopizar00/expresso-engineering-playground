import { clearGroup } from "../objects/disposal.js";
import { buildProductMesh } from "../objects/scene-meshes.js";

// Foreground state belongs to this browser's own interactive selection
// (posted in from the Web App via scene.js's postMessage bridge), not to
// the newest global cart/order event — that's what let other sessions'
// (including k6's) cart traffic leak into the hero slot before. The domain
// feed (renderScene) still supplies live product asset/category/status
// data; it no longer picks what's on stage.
export const HERO_SCALE        = 1.45;
export const HERO_FLOOR_Y      = 0.002;
export const SELECTED_Z        = 0;
export const ORDERED_Z         = 0.95;
export const SPAWN_DURATION_MS = 700;

export function createRenderer({ dataGroup }) {
  let currentScene = null;
  let selection = null;
  let assetKey = null;

  function renderSelection() {
    const product = selection && (
      currentScene?.products?.find((item) => item.productId === selection.productId)
      ?? selection.product
    );

    if (!product) {
      clearGroup(dataGroup);
      assetKey = null;
      return;
    }

    // Repeated SSE snapshots must not reset the spin, spawn animation, or
    // depth easing. Rebuild only when the selected asset actually changes.
    const nextKey = JSON.stringify([
      product.productId, product.category, product.status, product.assetConfig,
    ]);
    const targetZ = selection.phase === "ordered" ? ORDERED_Z : SELECTED_Z;
    if (assetKey !== nextKey) {
      const previous = dataGroup.children[0];
      const sameProduct = previous?.userData.productId === product.productId;
      const rotationY = sameProduct ? previous.rotation.y : 0;
      const positionZ = sameProduct ? previous.position.z : targetZ;
      const mesh = buildProductMesh(product, true);
      clearGroup(dataGroup);
      mesh.position.set(0, HERO_FLOOR_Y, positionZ);
      mesh.rotation.y = rotationY;
      mesh.scale.setScalar(HERO_SCALE);
      mesh.userData = {
        id: `product:${product.productId}`,
        productId: product.productId,
        label: product.name,
        baseScale: HERO_SCALE,
        idleRotate: true,
        isHero: true,
        spawnedAt: sameProduct ? -Infinity : performance.now(),
      };
      dataGroup.add(mesh);
      assetKey = nextKey;
    }
    Object.assign(dataGroup.children[0].userData, {
      phase: selection.phase,
      orderId: selection.orderId,
      targetZ,
    });
  }

  function renderScene(scene) {
    currentScene = scene;
    renderSelection();
  }

  // scene.js re-checks message origin/type before calling this, but the
  // shape itself is re-validated here too — this is the boundary a
  // malformed postMessage payload would actually corrupt render state
  // through.
  function setSelection(next) {
    if (next !== null && (
      !next || typeof next.productId !== "string" || !next.productId ||
      !["selected", "ordered"].includes(next.phase) ||
      (next.product && next.product.productId !== next.productId)
    )) return;
    selection = next;
    renderSelection();
  }

  return {
    renderScene,
    setSelection,
    sceneObjectCount: () => dataGroup.children.length,
  };
}

// Hero keeps its idle spin and spawn burst, and eases toward the checkout
// foreground depth (ORDERED_Z) once Place Order succeeds.
export function createAnimator({ scene, camera, renderer, controls, dataGroup }) {
  function frame() {
    controls.update();
    const now = performance.now();
    for (const child of dataGroup.children) {
      const ud = child.userData;
      if (ud.idleRotate) child.rotation.y += ud.isHero ? 0.008 : 0.0;

      if (ud.targetZ !== undefined) {
        child.position.z += (ud.targetZ - child.position.z) * 0.1;
      }

      if (ud.spawnedAt !== undefined && ud.spawnedAt > 0) {
        const t = (now - ud.spawnedAt) / SPAWN_DURATION_MS;
        if (t < 1) {
          // Ease-out cubic + small overshoot so the new hero "pops" into place.
          const ease      = 1 - Math.pow(1 - t, 3);
          const overshoot = 0.18 * Math.sin(t * Math.PI);
          child.scale.setScalar(ud.baseScale * (ease + overshoot));
        } else {
          child.scale.setScalar(ud.baseScale);
          ud.spawnedAt = -Infinity; // freeze; subsequent frames skip the math.
        }
      }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  return {
    start() { requestAnimationFrame(frame); },
  };
}
