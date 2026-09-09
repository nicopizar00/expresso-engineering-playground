// apps/visualizer-3d/public/layout/rain-render.js
//
// Owns rain-cup placement, fall/land/disposal for placed orders — the rain
// equivalent of layout/render.js's hero-placement + animate concern, kept in
// its own file so layout/render.js is never touched. Spawns one falling cup
// per newly-observed `orderId` in the domain-state scene snapshot (CUP-006
// in docs/specs/synchronized-single-cup-order-visualizer-and-live-rain.md).
// Unlike the retired workflow-traffic cups there is no "started" phase and
// no failure treatment: an order only appears in `recentOrders` once it has
// been successfully, atomically placed.
import { ESPRESSO_PALETTE } from "../materials.js";
import { buildEspressoGroup } from "../objects/espresso-cup.js";

const FALL_SPEED    = 0.9;  // world units / second
const FLOOR_Y        = 0.02;
const SETTLE_MS      = 900; // time visible on the floor before despawn
const MAX_CONCURRENT = 40;  // hard cap safety net — no indefinite accumulation
const MAX_SEEN       = 500; // bound on the "already rained" orderId memory
const RAIN_SCALE     = 0.5; // smaller than the foreground hero (HERO_SCALE in
                             // layout/render.js) so rain is never mistaken
                             // for the interactive cup
const SPAWN_Y        = 3.0;
const SPAWN_Z        = 0.6;
const SPAWN_STAGGER_MS = 150; // minimum gap between successive spawns, so a
                               // burst of newly-observed orders in one
                               // snapshot doesn't land as coincident cups
const SPAWN_X_SPREAD   = 0.6; // horizontal jitter band
const SPAWN_Z_SPREAD   = 0.25; // depth jitter band

export function createRainRenderer({ rainGroup }) {
  const seenOrderIds = new Set();
  let hasBaseline = false;
  let lastFrameAt = null;
  const pendingOrderIds = [];
  let lastSpawnAt = -Infinity;

  function rememberSeen(orderId) {
    seenOrderIds.add(orderId);
    if (seenOrderIds.size > MAX_SEEN) {
      seenOrderIds.delete(seenOrderIds.values().next().value);
    }
  }

  function disposeCup(group) {
    rainGroup.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }

  function spawnCup(orderId) {
    if (rainGroup.children.length >= MAX_CONCURRENT) {
      disposeCup(rainGroup.children[0]);
    }
    const group = buildEspressoGroup(ESPRESSO_PALETTE.midBeige);
    group.scale.setScalar(RAIN_SCALE);
    const x = (Math.random() - 0.5) * SPAWN_X_SPREAD;
    const z = SPAWN_Z + (Math.random() - 0.5) * SPAWN_Z_SPREAD;
    group.position.set(x, SPAWN_Y, z);
    group.userData = { orderId, state: "falling", landedAt: null };
    rainGroup.add(group);
  }

  // The first snapshot after connect (or reconnect) seeds the "already
  // seen" set without spawning cups — otherwise every page load or SSE
  // reconnect would rain the entire recentOrders history at once instead
  // of only newly placed orders. Reconnect dedup falls out of this for
  // free: seenOrderIds already holds prior ids, so a repeated snapshot
  // spawns nothing new.
  function handleScene(scene) {
    const orders = scene?.recentOrders ?? [];
    if (!hasBaseline) {
      for (const order of orders) rememberSeen(order.orderId);
      hasBaseline = true;
      return;
    }
    for (const order of orders) {
      if (seenOrderIds.has(order.orderId)) continue;
      rememberSeen(order.orderId);
      pendingOrderIds.push(order.orderId);
    }
  }

  function tick(now) {
    if (pendingOrderIds.length > 0 && now - lastSpawnAt >= SPAWN_STAGGER_MS) {
      lastSpawnAt = now;
      spawnCup(pendingOrderIds.shift());
    }
    const dt = lastFrameAt === null ? 1 / 60 : Math.min((now - lastFrameAt) / 1000, 0.1);
    lastFrameAt = now;
    for (let i = rainGroup.children.length - 1; i >= 0; i--) {
      const cupGroup = rainGroup.children[i];
      const ud = cupGroup.userData;
      if (ud.state === "falling") {
        cupGroup.position.y -= FALL_SPEED * dt;
        if (cupGroup.position.y <= FLOOR_Y) {
          cupGroup.position.y = FLOOR_Y;
          ud.state = "landed";
          ud.landedAt = now;
        }
      } else if (ud.state === "landed" && now - ud.landedAt > SETTLE_MS) {
        disposeCup(cupGroup);
      }
    }
  }

  return { handleScene, tick };
}
