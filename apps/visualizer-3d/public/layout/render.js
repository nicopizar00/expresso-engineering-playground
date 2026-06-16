import { clamp } from "../utils.js";
import { ROOM } from "../objects/room.js";
import { clearGroup } from "../objects/disposal.js";
import {
  buildProductMesh,
  buildOrderMesh,
  buildAggregateMesh,
  buildCartMesh,
} from "../objects/scene-meshes.js";

// Hero-vs-history visual language.
// The latest cart/order event becomes the HERO: scaled up, pulled to
// centre-stage, brightened, and given a brief spawn-burst animation.
// All other items recede: smaller scale, desaturated palette, no rotation.
// This keeps the stage about the LATEST user action, with history present
// but quiet.
export const HERO_SCALE        = 1.45;
export const HISTORY_SCALE     = 0.55;
export const HERO_FLOOR_Y      = 0.002;
export const SPAWN_DURATION_MS = 700;

// Hero priority: cart wins, else newest recent order, else first product.
function pickSceneHero(scene) {
  if (scene?.cart) return { kind: "cart" };
  if (scene?.recentOrders?.length > 0) return { kind: "order", id: scene.recentOrders[0].orderId };
  if (scene?.products?.length > 0) return { kind: "product", id: scene.products[0].productId };
  return null;
}

function sceneHeroKey(hero) {
  if (!hero) return null;
  if (hero.kind === "cart") return "cart";
  return `${hero.kind}:${hero.id}`;
}

function placeMesh(mesh, position, isHero, userData) {
  const baseScale = isHero ? HERO_SCALE : HISTORY_SCALE;
  mesh.position.set(position.x, position.y, position.z);
  mesh.scale.setScalar(baseScale);
  mesh.userData = { ...userData, baseScale, idleRotate: isHero, isHero };
  return mesh;
}

export function sceneObjectCount(scene) {
  return (scene.products?.length ?? 0)
    + (scene.recentOrders?.length ?? 0)
    + (scene.cart ? 1 : 0)
    + (scene.orderAggregates?.olderCount > 0 ? 1 : 0);
}

// =============================================================================
// createRenderer — closes over dataGroup so transport can fire renderScene
// without re-passing the group every call.
//
// Layout (this iteration — minimal, EOC-5 will turn it into a real counter):
//   • Hero       — cart > newest recent order > first product, centre stage.
//   • Products   — back-left grid (excluding the hero if a product was picked).
//   • Orders     — right column, newest at the front.
//   • Aggregate  — single low-poly stack in the back-right corner when
//                  orderAggregates.olderCount > 0.
// =============================================================================
export function createRenderer({ dataGroup }) {
  function renderScene(scene) {
    const hero = pickSceneHero(scene);
    const heroKey = sceneHeroKey(hero);
    const heroChanged = heroKey !== null && heroKey !== dataGroup.userData.heroKey;

    clearGroup(dataGroup);

    // Cart — when present, takes the centre stage as hero.
    if (scene.cart) {
      const isHero = hero?.kind === "cart";
      const mesh = buildCartMesh(scene.cart, isHero);
      const pos = isHero
        ? { x: 0, y: HERO_FLOOR_Y, z: 0 }
        : { x: 0, y: 0.35, z: 1.0 };
      placeMesh(mesh, pos, isHero, { id: "cart", label: `Cart · ${scene.cart.itemCount}` });
      if (isHero && heroChanged) mesh.userData.spawnedAt = performance.now();
      dataGroup.add(mesh);
    }

    // Recent orders — newest at front of the right column.
    for (let i = 0; i < scene.recentOrders.length; i++) {
      const order = scene.recentOrders[i];
      const isHero = hero?.kind === "order" && hero.id === order.orderId;
      const mesh = buildOrderMesh(order, isHero);
      const pos = isHero
        ? { x: 0, y: HERO_FLOOR_Y, z: 0 }
        : { x: clamp(1.6, -ROOM.width / 2 + 0.5, ROOM.width / 2 - 0.5),
            y: 0.05,
            z: clamp(-2.0 + i * 0.5, -ROOM.depth / 2 + 0.5, ROOM.depth / 2 - 0.5) };
      placeMesh(mesh, pos, isHero, { id: `order:${order.orderId}`, label: order.orderId });
      if (isHero && heroChanged) mesh.userData.spawnedAt = performance.now();
      dataGroup.add(mesh);
    }

    // Aggregate stack — at most one mesh; signals "older history exists".
    if (scene.orderAggregates && scene.orderAggregates.olderCount > 0) {
      const mesh = buildAggregateMesh();
      const pos = { x: clamp(2.0, -ROOM.width / 2 + 0.5, ROOM.width / 2 - 0.5),
                    y: 0.05,
                    z: clamp(1.5, -ROOM.depth / 2 + 0.5, ROOM.depth / 2 - 0.5) };
      placeMesh(mesh, pos, false, {
        id: "aggregate",
        label: `+${scene.orderAggregates.olderCount} older`,
      });
      dataGroup.add(mesh);
    }

    // Products — back-left grid.
    for (let i = 0; i < scene.products.length; i++) {
      const product = scene.products[i];
      const isHero = hero?.kind === "product" && hero.id === product.productId;
      const mesh = buildProductMesh(product, isHero);
      const pos = isHero
        ? { x: 0, y: HERO_FLOOR_Y, z: 0 }
        : { x: clamp(-2.0 + (i % 3) * 1.2, -ROOM.width / 2 + 0.5, ROOM.width / 2 - 0.5),
            y: 0.05,
            z: clamp(-2.2 + Math.floor(i / 3) * 1.2, -ROOM.depth / 2 + 0.5, ROOM.depth / 2 - 0.5) };
      placeMesh(mesh, pos, isHero, { id: `product:${product.productId}`, label: product.name });
      if (isHero && heroChanged) mesh.userData.spawnedAt = performance.now();
      dataGroup.add(mesh);
    }

    dataGroup.userData.heroKey = heroKey;
  }

  return { renderScene, sceneObjectCount };
}

// =============================================================================
// createAnimator — owns the requestAnimationFrame loop.
//
// Hero spins faster than history (which doesn't spin at all). On hero promotion
// a brief scale-burst plays: ease-out cubic toward baseScale with a sinusoidal
// overshoot so the new item visibly "lands" on the stage.
// << EXTEND: replace the += with clock-delta maths for frame-rate independence.
// =============================================================================
export function createAnimator({ scene, camera, renderer, controls, dataGroup }) {
  function frame() {
    controls.update();
    const now = performance.now();
    for (const child of dataGroup.children) {
      const ud = child.userData;
      if (ud.idleRotate) child.rotation.y += ud.isHero ? 0.008 : 0.0;

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
