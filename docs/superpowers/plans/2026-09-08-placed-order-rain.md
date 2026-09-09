# Placed-Order Rain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one falling coffee cup rain into the 3D Visualizer for every newly placed order, sourced from the existing domain-state SSE snapshot, and retire the old k6-iteration-driven workflow-traffic cups it replaces.

**Architecture:** The BFF's `/visualization-updates` SSE already snapshot-pushes `recentOrders: SceneOrder[]` (with `orderId`, `placedAt`) on every domain mutation — no new BFF endpoint or projection field is needed. A new visualizer module (`layout/rain-render.js`) diffs each incoming snapshot's `recentOrders` against a locally-tracked set of order ids it has already rained, spawning one falling cup (reusing `buildEspressoGroup`) per newly-observed id. The old workflow-traffic path (BFF module + ingest/SSE, and the visualizer's `traffic-transport.js` / `objects/traffic-cup.js` / `layout/traffic-render.js`) is deleted outright, since it visualized k6 iterations rather than placed orders and the new spec forbids that coupling.

**Tech Stack:** NestJS (BFF), vanilla ES modules + Three.js (visualizer-3d, no build step, no test runner), Vitest (BFF tests).

**Spec:** [`docs/specs/synchronized-single-cup-order-visualizer-and-live-rain.md`](../../specs/synchronized-single-cup-order-visualizer-and-live-rain.md) — this plan implements CUP-006 (always-on placed-order rain) and the workflow-traffic-removal half of CUP-008 (product/performance separation). It explicitly does not implement CUP-003/CUP-004/CUP-005 (interactive-selection contract, full projection rewrite, foreground hero) or CUP-009 (reducing k6 to the single `single-cup-order` scenario) — those stay on the backlog per the spec's own P1/P2 split.

## Global Constraints

- No AI attribution in commits, PR descriptions, or generated docs (repo-wide `CLAUDE.md` rule).
- English for all committed content.
- No real names, URLs, IPs, or credentials in committed content.
- Visualizer module-discipline rule (per `.claude/skills/expresso-visualizer-review/SKILL.md` and CLAUDE.md): hex color literals live only in `materials.js`; `scene.js` stays a thin wiring point (no mesh/geometry/material construction); `transport.js` and `layout/render.js` are not modified by this work.
- New Three.js geometry must stay within the "Standard tier" polygon budget (≤ 28 triangles) — satisfied automatically here since the rain cup reuses `buildEspressoGroup`'s existing 26-triangle geometry rather than adding new geometry.
- A workflow-traffic ingest failure (e.g. the k6 campaign scenario's now-orphaned POST) must not raise unhandled exceptions or fail anything — this is achieved by deletion, not by keeping the endpoint alive to swallow errors.

---

## Task 1: Delete the BFF workflow-traffic module

**Files:**
- Delete: `apps/bff/src/modules/workflow-traffic/workflow-traffic.controller.ts`
- Delete: `apps/bff/src/modules/workflow-traffic/workflow-traffic.controller.spec.ts`
- Delete: `apps/bff/src/modules/workflow-traffic/workflow-traffic.service.ts`
- Delete: `apps/bff/src/modules/workflow-traffic/workflow-traffic.service.spec.ts`
- Delete: `apps/bff/src/modules/workflow-traffic/workflow-traffic.module.ts`
- Delete: `apps/bff/src/modules/workflow-traffic/workflow-traffic.types.ts`
- Modify: `apps/bff/src/app.module.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on — this task's only effect other tasks care about is that `POST /workflow-traffic/events` and `GET /workflow-traffic-updates` no longer exist on the BFF. Task 3 (visualizer) stops calling them independently of this task's ordering.

- [ ] **Step 1: Delete the module directory**

```bash
git rm -r apps/bff/src/modules/workflow-traffic
```

- [ ] **Step 2: Remove the module's registration from `app.module.ts`**

Current content of `apps/bff/src/app.module.ts`:

```ts
// Root composition for the modular monolith.
//
// Inter-module rule (will be lint-enforced later): modules MUST depend only
// on other modules' public exports (services exported via `exports: [...]`),
// never on their internal classes. This is what keeps Phase 3 extraction
// mechanical instead of structural.
//
// Not yet wired here: CustomersModule, NotificationsModule (placeholders only).

import { Module } from "@nestjs/common";
import { AssetsModule } from "./modules/assets/assets.module";
import { CartModule } from "./modules/cart/cart.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CheckoutModule } from "./modules/checkout/checkout.module";
import { HealthModule } from "./modules/health/health.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { VisualizationModule } from "./modules/visualization/visualization.module";
import { WorkflowTrafficModule } from "./modules/workflow-traffic/workflow-traffic.module";
import { PrismaModule } from "./prisma.module";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    AssetsModule,
    VisualizationModule,
    WorkflowTrafficModule,
  ],
})
export class AppModule {}
```

Replace it with:

```ts
// Root composition for the modular monolith.
//
// Inter-module rule (will be lint-enforced later): modules MUST depend only
// on other modules' public exports (services exported via `exports: [...]`),
// never on their internal classes. This is what keeps Phase 3 extraction
// mechanical instead of structural.
//
// Not yet wired here: CustomersModule, NotificationsModule (placeholders only).

import { Module } from "@nestjs/common";
import { AssetsModule } from "./modules/assets/assets.module";
import { CartModule } from "./modules/cart/cart.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CheckoutModule } from "./modules/checkout/checkout.module";
import { HealthModule } from "./modules/health/health.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { VisualizationModule } from "./modules/visualization/visualization.module";
import { PrismaModule } from "./prisma.module";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    AssetsModule,
    VisualizationModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Run the BFF test suite and typecheck to confirm nothing else referenced the module**

Run: `pnpm --filter @mini-commerce/bff test && pnpm --filter @mini-commerce/bff typecheck`
Expected: PASS, with the workflow-traffic spec files gone from the run (fewer test files than before, no failures).

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/app.module.ts
git commit -m "fix(bff): retire the workflow-traffic ingest/SSE module"
```

---

## Task 2: Retire the visualizer's workflow-traffic cup path

**Files:**
- Delete: `apps/visualizer-3d/public/traffic-transport.js`
- Delete: `apps/visualizer-3d/public/objects/traffic-cup.js`
- Delete: `apps/visualizer-3d/public/layout/traffic-render.js`
- Modify: `apps/visualizer-3d/public/materials.js`
- Modify: `apps/visualizer-3d/public/index.html`
- Modify: `apps/visualizer-3d/public/style.css`

**Interfaces:**
- Consumes: nothing from other tasks — this only removes code.
- Produces: a `materials.js` with no `TRAFFIC_COLORS` export, and an `index.html`/`style.css` with no `traffic-hud` markup, that Task 3's `scene.js` edit assumes are already gone (so it doesn't have to touch them itself).

- [ ] **Step 1: Delete the three workflow-traffic-only files**

```bash
git rm apps/visualizer-3d/public/traffic-transport.js
git rm apps/visualizer-3d/public/objects/traffic-cup.js
git rm apps/visualizer-3d/public/layout/traffic-render.js
```

- [ ] **Step 2: Remove the now-unused `TRAFFIC_COLORS` export from `materials.js`**

At the end of `apps/visualizer-3d/public/materials.js`, delete this block (it has no remaining importer once Step 1 lands):

```js

// Workflow-traffic cup colours, keyed by catalog use-case id (values copied
// from use-cases/catalog.json's `visual.color`). Kept here per the
// module-discipline rule: no hex literals outside this file.
export const TRAFFIC_COLORS = {
  "commerce.catalog-browse": 0x8B5E3C,
  "commerce.order-lookup":   0x1976D2,
  "commerce.purchase":       0x2E7D32,
};
```

- [ ] **Step 3: Remove the workflow-traffic HUD markup from `index.html`**

In `apps/visualizer-3d/public/index.html`, replace:

```html
        <span id="status" class="status">starting…</span>
        <div id="traffic-hud" class="traffic-hud" hidden>
          <span id="traffic-run-id"></span>
          <span id="traffic-use-cases" class="traffic-legend"></span>
          <span id="traffic-counts"></span>
        </div>
        <button id="reload" type="button">Reload data</button>
```

with:

```html
        <span id="status" class="status">starting…</span>
        <button id="reload" type="button">Reload data</button>
```

- [ ] **Step 4: Remove the workflow-traffic HUD CSS from `style.css`**

In `apps/visualizer-3d/public/style.css`, delete this block:

```css

/* Workflow-traffic HUD — sits next to .status in .hud-controls and matches
   its type scale and colour, so a running campaign reads as an extension of
   the status line rather than as a separate widget. Hidden entirely when no
   campaign is streaming (the `hidden` attribute on #traffic-hud). */
.traffic-hud {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
  padding-left: 10px;
  border-left: 1px solid var(--border);
}

.traffic-hud[hidden] {
  display: none;
}

.traffic-legend {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.traffic-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.traffic-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--muted);
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/visualizer-3d/public/materials.js apps/visualizer-3d/public/index.html apps/visualizer-3d/public/style.css
git commit -m "fix(visualizer): remove the workflow-traffic HUD and colour table"
```

(The `git rm` deletions from Step 1 are already staged; they'll ride in the same commit as the modifications above since nothing depends on committing them separately.)

---

## Task 3: Add the placed-order rain renderer and wire it into `scene.js`

**Files:**
- Create: `apps/visualizer-3d/public/layout/rain-render.js`
- Modify: `apps/visualizer-3d/public/scene.js`

**Interfaces:**
- Consumes: `buildEspressoGroup(color, cfg?)` from `objects/espresso-cup.js` (returns a `THREE.Group` pivoted with its base at local `y = 0`); `ESPRESSO_PALETTE` from `materials.js`; the existing `VisualizationScene` snapshot shape's `recentOrders: { orderId: string; placedAt: string; ... }[]` field, delivered to `scene.js` via `transport.js`'s `onScene(scene)` callback (unchanged, per `apps/visualizer-3d/public/transport.js:25-132` — not modified by this task).
- Produces: `createRainRenderer({ rainGroup: THREE.Group }) → { handleScene(scene), tick(now) }`. `handleScene` is called once per snapshot (initial load, each SSE message, each poll tick) and is idempotent per `orderId`. `tick` is called once per animation frame with a `DOMHighResTimeStamp` and mutates the cups already added to `rainGroup`; it never calls `renderer.render()`.

- [ ] **Step 1: Create `layout/rain-render.js`**

```js
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

export function createRainRenderer({ rainGroup }) {
  const seenOrderIds = new Set();
  let hasBaseline = false;
  let lastFrameAt = null;

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
    group.position.set(0, SPAWN_Y, SPAWN_Z);
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
      spawnCup(order.orderId);
    }
  }

  function tick(now) {
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
```

- [ ] **Step 2: Wire it into `scene.js`**

In `apps/visualizer-3d/public/scene.js`, replace the import block:

```js
import { initTransport } from "./transport.js";
import { createTrafficRenderer } from "./layout/traffic-render.js";
import { initTrafficTransport } from "./traffic-transport.js";
```

with:

```js
import { initTransport } from "./transport.js";
import { createRainRenderer } from "./layout/rain-render.js";
```

Then replace this block (the transport wiring plus the whole workflow-traffic section):

```js
const { renderScene, sceneObjectCount } = createRenderer({ dataGroup });
const animator = createAnimator({ scene, camera, renderer, controls, dataGroup });
const transport = initTransport({
  onScene: renderScene,
  sceneObjectCount,
  statusEl,
  dataGroup,
  fallbackScene: FALLBACK_SCENE,
});

// Workflow-traffic falling cups — separate group, separate transport, and a
// separate tick loop from the domain-state animator above. trafficGroup is
// part of `scene`, so the existing animator's renderer.render(scene, camera)
// already paints it; this loop only advances cup state, it never renders.
const trafficGroup = new THREE.Group();
scene.add(trafficGroup);

const trafficRenderer = createTrafficRenderer({ trafficGroup });
const trafficTransport = initTrafficTransport({
  onEvent: trafficRenderer.handleEvent,
  hudEls: {
    root: document.getElementById("traffic-hud"),
    runId: document.getElementById("traffic-run-id"),
    useCases: document.getElementById("traffic-use-cases"),
    counts: document.getElementById("traffic-counts"),
  },
});

function tickTraffic() {
  trafficRenderer.tick(performance.now());
  requestAnimationFrame(tickTraffic);
}
```

with:

```js
const { renderScene, sceneObjectCount } = createRenderer({ dataGroup });
const animator = createAnimator({ scene, camera, renderer, controls, dataGroup });

// Placed-order rain — separate group and a separate tick loop from the
// domain-state animator above, but fed by the same domain-state snapshot
// (no second transport). rainGroup is part of `scene`, so the existing
// animator's renderer.render(scene, camera) already paints it; this loop
// only advances cup state, it never renders.
const rainGroup = new THREE.Group();
scene.add(rainGroup);
const rainRenderer = createRainRenderer({ rainGroup });

const transport = initTransport({
  onScene(sceneData) {
    renderScene(sceneData);
    rainRenderer.handleScene(sceneData);
  },
  sceneObjectCount,
  statusEl,
  dataGroup,
  fallbackScene: FALLBACK_SCENE,
});

function tickRain() {
  rainRenderer.tick(performance.now());
  requestAnimationFrame(tickRain);
}
```

Finally, replace:

```js
transport.connect();
animator.start();
trafficTransport.connect();
requestAnimationFrame(tickTraffic);
```

with:

```js
transport.connect();
animator.start();
requestAnimationFrame(tickRain);
```

- [ ] **Step 3: Update the module map comment at the top of `scene.js`**

Replace:

```js
// Mini-commerce 3D visualizer — entry shim.
//
// Wires the DOM, the Three.js bootstrap, and the per-concern modules.
// Per-concern code lives in:
//   • materials.js          — palette, status colours, PS1 texture factory
//   • geometry/frustum.js   — buildSquareFrustum, buildOpenFrustum
//   • objects/room.js       — room and floor grid
//   • objects/espresso-cup.js — Classic Espresso (ESPRESSO_CFG dev entry)
//   • objects/scene-meshes.js — typed scene per-role meshes
//   • objects/disposal.js   — clearGroup (canvas-texture-aware)
//   • layout/render.js      — renderScene + animator factories
//   • transport.js          — SSE primary + polling fallback
//   • fallback.js           — offline typed scene
```

with:

```js
// Mini-commerce 3D visualizer — entry shim.
//
// Wires the DOM, the Three.js bootstrap, and the per-concern modules.
// Per-concern code lives in:
//   • materials.js          — palette, status colours, PS1 texture factory
//   • geometry/frustum.js   — buildSquareFrustum, buildOpenFrustum
//   • objects/room.js       — room and floor grid
//   • objects/espresso-cup.js — Classic Espresso (ESPRESSO_CFG dev entry)
//   • objects/scene-meshes.js — typed scene per-role meshes
//   • objects/disposal.js   — clearGroup (canvas-texture-aware)
//   • layout/render.js      — renderScene + animator factories
//   • layout/rain-render.js — placed-order falling-cup rain (CUP-006)
//   • transport.js          — SSE primary + polling fallback
//   • fallback.js           — offline typed scene
```

- [ ] **Step 4: Manual smoke test**

Run: `./dev up web` (starts postgres, BFF, and the Next.js web app; the standalone visualizer runs on port 3002 per the container inventory).

1. Open the standalone Visualizer (`http://localhost:3002`, or the port your `./dev` prints) and confirm the page loads with no console errors and no falling cup appears while idle.
2. Place an order through the Web App (select Cup of Coffee, place the order anonymously).
3. Confirm exactly one small cup falls from the top of the scene, lands, sits briefly, and disappears — separate from any existing hero/history cup rendering.
4. Reload the Visualizer tab with existing order history already present (i.e. reconnect after at least one order has been placed) and confirm no cup rains on load — only newly placed orders after that point should rain.
5. Open the browser devtools console and confirm no reference to `traffic-hud`, `/workflow-traffic/events`, or `/workflow-traffic-updates` appears (no 404s from the deleted endpoint, since nothing calls it from the product runtime anymore).

Expected: all five checks pass. Record this manual pass as validation evidence (per `docs/performance/validation.md`'s evidence rule and `expresso-validation-audit`) since there is no automated test harness for `apps/visualizer-3d/public/`.

- [ ] **Step 5: Commit**

```bash
git add apps/visualizer-3d/public/layout/rain-render.js apps/visualizer-3d/public/scene.js
git commit -m "feat(visualizer): rain a falling cup for each newly placed order"
```

---

## Out of scope (left for later work, per the spec's own backlog)

- CUP-003 interactive-selection contract, CUP-004's full `VisualizerProjection` type (`revision`, `activeSelection`, `placedOrderTotal`), and CUP-005 foreground-hero-from-selection — the existing `dataGroup` hero/history rendering in `layout/render.js` is untouched and keeps working exactly as it does today, unrelated to the new `rainGroup`.
- CUP-009 (reducing k6 to the single `single-cup-order` scenario). The campaign scenario's `tests/performance/k6/scenarios/campaign/report-event.js` will keep POSTing to the now-deleted `/workflow-traffic/events` endpoint; per the old spec's own disconnection rule this must not (and structurally cannot, since it's fire-and-forget) fail the campaign — it will just silently 404. Retiring that call site is CUP-009's job and touches `scripts/pg/campaign.py` and the k6 scenario adapters, which is explicitly out of scope here.
- CUP-010 diagnostics contract and the real-stack certification suite in `docs/specs/live-traffic-visualizer-e2e-certification.md`.
