# Live Workflow Traffic and Falling Cups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a small real campaign against the real BFF (three catalog workflows: catalog-browse, order-lookup, purchase) and have the 3D Visualizer show that traffic as falling cups, driven by a real BFF feed, not a mock.

**Architecture:** k6 (Docker) executes catalog-driven adapters and fire-and-forget POSTs `started`/`succeeded`/`failed` events to a new, independent BFF module. That module rebroadcasts them as discrete SSE messages. The Visualizer picks these up through new, parallel modules (own transport, own renderer/animator, own cup builder) that spawn/animate/despawn cups from those events, wired into `scene.js` alongside — never touching — the existing domain-state modules.

**Tech Stack:** NestJS (BFF), k6 + Docker (campaign runner), Python stdlib (`scripts/pg/`), Three.js (visualizer), Vitest, Python `unittest`.

**Spec:** [`docs/specs/live-workflow-traffic-and-falling-cups.md`](../../specs/live-workflow-traffic-and-falling-cups.md)

## Global Constraints

- k6 runs only in Docker via `docker compose -f infra/docker/compose.performance.yaml`; no host k6 install is a code path.
- `scripts/pg/` stays stdlib-only Python. New orchestration is a sibling module to `perf.py`, never a second entry path outside `./dev` / `pnpm pg:*` / `task`.
- `BASE_URL` is the only target knob for k6 scenarios (via `config/env.js`'s `url()`).
- Reports land at `tests/performance/k6/reports/<name>-summary.json`; gitignored except `.gitkeep`.
- No secrets, no real URLs, no real user data anywhere in scenarios, fixtures, or docs.
- `WorkflowTrafficModule` MUST NOT be added to `VisualizationModule`'s providers and MUST NOT alter `/visualization-data` or `/visualization-updates`.
- A workflow-traffic ingest call from k6 MUST NOT fail or slow the measured commerce iteration — swallow ingest errors.
- The Visualizer is a per-concern module graph, not a monolith (module-discipline table in `.claude/skills/expresso-visualizer-review/SKILL.md`). Falling-cup work lives in new, parallel modules (`objects/traffic-cup.js`, `layout/traffic-render.js`, `traffic-transport.js`); `objects/espresso-cup.js`, `layout/render.js`, `transport.js`, `objects/disposal.js`, and `geometry/frustum.js`'s existing exports are never modified. `materials.js` gains exactly one new export (`TRAFFIC_COLORS`).
- All new domain-asset geometry reuses `buildSquareFrustum`/`makePsxTexture`, uses `MeshLambertMaterial` with `flatShading: true`, and stays within the Standard tier (≤ 28 triangles) — no smooth geometry, no round openings. Hex color literals live only in `materials.js`.
- English only in committed content; no AI attribution in commits.

---

### Task 1: `WorkflowTrafficService` — event buffer and live stream

**Files:**
- Create: `apps/bff/src/modules/workflow-traffic/workflow-traffic.types.ts`
- Create: `apps/bff/src/modules/workflow-traffic/workflow-traffic.service.ts`
- Test: `apps/bff/src/modules/workflow-traffic/workflow-traffic.service.spec.ts`

**Interfaces:**
- Produces: `WorkflowTrafficOutcome = "started" | "succeeded" | "failed"`; `WorkflowTrafficEvent { runId: string; useCaseId: string; useCaseVersion: number; iterationId: string; outcome: WorkflowTrafficOutcome; timestamp: string }`; `WorkflowTrafficEventInput` (same shape, `timestamp` optional); `WorkflowTrafficService.record(input: WorkflowTrafficEventInput): WorkflowTrafficEvent`; `WorkflowTrafficService.recentHistory(): readonly WorkflowTrafficEvent[]`; `WorkflowTrafficService.events$: Observable<WorkflowTrafficEvent>`.

- [ ] **Step 1: Write the types file**

```typescript
// apps/bff/src/modules/workflow-traffic/workflow-traffic.types.ts
export type WorkflowTrafficOutcome = "started" | "succeeded" | "failed";

export interface WorkflowTrafficEvent {
  readonly runId: string;
  readonly useCaseId: string;
  readonly useCaseVersion: number;
  readonly iterationId: string;
  readonly outcome: WorkflowTrafficOutcome;
  readonly timestamp: string;
}

export interface WorkflowTrafficEventInput {
  runId: string;
  useCaseId: string;
  useCaseVersion: number;
  iterationId: string;
  outcome: WorkflowTrafficOutcome;
  timestamp?: string;
}
```

- [ ] **Step 2: Write the failing service spec**

```typescript
// apps/bff/src/modules/workflow-traffic/workflow-traffic.service.spec.ts
import { describe, expect, it } from "vitest";
import { WorkflowTrafficService } from "./workflow-traffic.service";
import type { WorkflowTrafficEventInput } from "./workflow-traffic.types";

function makeEvent(overrides: Partial<WorkflowTrafficEventInput> = {}): WorkflowTrafficEventInput {
  return {
    runId: "run-1",
    useCaseId: "commerce.purchase",
    useCaseVersion: 1,
    iterationId: "iter-1",
    outcome: "started",
    ...overrides,
  };
}

describe("WorkflowTrafficService", () => {
  it("records an event and stamps a timestamp when none is given", () => {
    const svc = new WorkflowTrafficService();
    const event = svc.record(makeEvent());
    expect(event.iterationId).toBe("iter-1");
    expect(typeof event.timestamp).toBe("string");
  });

  it("keeps a caller-supplied timestamp", () => {
    const svc = new WorkflowTrafficService();
    const event = svc.record(makeEvent({ timestamp: "2026-01-01T00:00:00.000Z" }));
    expect(event.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns buffered events in arrival order", () => {
    const svc = new WorkflowTrafficService();
    svc.record(makeEvent({ iterationId: "iter-1", outcome: "started" }));
    svc.record(makeEvent({ iterationId: "iter-1", outcome: "succeeded" }));
    const history = svc.recentHistory();
    expect(history.map((e) => e.outcome)).toEqual(["started", "succeeded"]);
  });

  it("caps the buffer at 500 events, dropping the oldest first", () => {
    const svc = new WorkflowTrafficService();
    for (let i = 0; i < 501; i++) {
      svc.record(makeEvent({ iterationId: `iter-${i}` }));
    }
    const history = svc.recentHistory();
    expect(history).toHaveLength(500);
    expect(history[0].iterationId).toBe("iter-1");
    expect(history[499].iterationId).toBe("iter-500");
  });

  it("emits recorded events on events$", () => {
    const svc = new WorkflowTrafficService();
    const received: string[] = [];
    svc.events$.subscribe((event) => received.push(event.iterationId));
    svc.record(makeEvent({ iterationId: "iter-live" }));
    expect(received).toEqual(["iter-live"]);
  });
});
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/workflow-traffic/workflow-traffic.service.spec.ts`
Expected: FAIL — `Cannot find module './workflow-traffic.service'`.

- [ ] **Step 4: Implement the service**

```typescript
// apps/bff/src/modules/workflow-traffic/workflow-traffic.service.ts
import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import type { WorkflowTrafficEvent, WorkflowTrafficEventInput } from "./workflow-traffic.types";

const BUFFER_LIMIT = 500;

@Injectable()
export class WorkflowTrafficService {
  private readonly buffer: WorkflowTrafficEvent[] = [];
  private readonly _events$ = new Subject<WorkflowTrafficEvent>();
  readonly events$: Observable<WorkflowTrafficEvent> = this._events$.asObservable();

  record(input: WorkflowTrafficEventInput): WorkflowTrafficEvent {
    const event: WorkflowTrafficEvent = {
      runId: input.runId,
      useCaseId: input.useCaseId,
      useCaseVersion: input.useCaseVersion,
      iterationId: input.iterationId,
      outcome: input.outcome,
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    this.buffer.push(event);
    if (this.buffer.length > BUFFER_LIMIT) this.buffer.shift();
    this._events$.next(event);
    return event;
  }

  recentHistory(): readonly WorkflowTrafficEvent[] {
    return this.buffer;
  }
}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/workflow-traffic/workflow-traffic.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/bff/src/modules/workflow-traffic/workflow-traffic.types.ts apps/bff/src/modules/workflow-traffic/workflow-traffic.service.ts apps/bff/src/modules/workflow-traffic/workflow-traffic.service.spec.ts
git commit -m "feat(bff): add WorkflowTrafficService event buffer"
```

---

### Task 2: `WorkflowTrafficController` + module wiring

**Files:**
- Create: `apps/bff/src/modules/workflow-traffic/workflow-traffic.controller.ts`
- Create: `apps/bff/src/modules/workflow-traffic/workflow-traffic.module.ts`
- Test: `apps/bff/src/modules/workflow-traffic/workflow-traffic.controller.spec.ts`
- Modify: `apps/bff/src/app.module.ts`

**Interfaces:**
- Consumes: `WorkflowTrafficService` from Task 1 (`record`, `recentHistory`, `events$`).
- Produces: `POST /workflow-traffic/events` (202, body `WorkflowTrafficEventInput`), `GET /workflow-traffic-updates` (SSE, `Observable<MessageEvent>` where `data` is a `WorkflowTrafficEvent`).

**Note (ruling from Task 1's review):** `WorkflowTrafficService`'s buffer is a single global FIFO, not partitioned by run. Spec RUN-005 requires a new SSE subscriber to receive only "the current run's recent history," so this controller — not the service — filters `recentHistory()` down to the latest buffered event's `runId` before replaying. See Step 3.

- [ ] **Step 1: Write the failing controller spec**

```typescript
// apps/bff/src/modules/workflow-traffic/workflow-traffic.controller.spec.ts
import { describe, expect, it } from "vitest";
import { WorkflowTrafficController } from "./workflow-traffic.controller";
import { WorkflowTrafficService } from "./workflow-traffic.service";
import type { MessageEvent } from "@nestjs/common";

describe("WorkflowTrafficController", () => {
  describe("POST /workflow-traffic/events", () => {
    it("records the posted event and accepts immediately", () => {
      const svc = new WorkflowTrafficService();
      const controller = new WorkflowTrafficController(svc);
      const result = controller.ingest({
        runId: "run-1",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "iter-1",
        outcome: "started",
      });
      expect(result).toEqual({ accepted: true });
      expect(svc.recentHistory()).toHaveLength(1);
      expect(svc.recentHistory()[0].iterationId).toBe("iter-1");
    });
  });

  describe("GET /workflow-traffic-updates", () => {
    it("replays buffered history to a new subscriber", async () => {
      const svc = new WorkflowTrafficService();
      svc.record({
        runId: "run-1",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "iter-1",
        outcome: "started",
      });
      const controller = new WorkflowTrafficController(svc);
      const first = await new Promise<MessageEvent>((resolve) => {
        controller.updates().subscribe((message) => resolve(message));
      });
      expect((first.data as { iterationId: string }).iterationId).toBe("iter-1");
    });

    it("streams new events to an existing subscriber", () => {
      const svc = new WorkflowTrafficService();
      const controller = new WorkflowTrafficController(svc);
      const messages: MessageEvent[] = [];
      controller.updates().subscribe((message) => messages.push(message));
      svc.record({
        runId: "run-1",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "iter-2",
        outcome: "succeeded",
      });
      expect(messages).toHaveLength(1);
      expect((messages[0].data as { iterationId: string }).iterationId).toBe("iter-2");
    });

    it("replays only the current run's buffered history, not a prior run's tail", () => {
      const svc = new WorkflowTrafficService();
      svc.record({
        runId: "run-0",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "old-1",
        outcome: "succeeded",
      });
      svc.record({
        runId: "run-1",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "iter-1",
        outcome: "started",
      });
      const controller = new WorkflowTrafficController(svc);
      const messages: MessageEvent[] = [];
      controller.updates().subscribe((message) => messages.push(message));
      expect(messages).toHaveLength(1);
      expect((messages[0].data as { iterationId: string }).iterationId).toBe("iter-1");
    });
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/workflow-traffic/workflow-traffic.controller.spec.ts`
Expected: FAIL — `Cannot find module './workflow-traffic.controller'`.

- [ ] **Step 3: Implement the controller**

```typescript
// apps/bff/src/modules/workflow-traffic/workflow-traffic.controller.ts
import { Body, Controller, HttpCode, MessageEvent, Post, Sse } from "@nestjs/common";
import { Observable, concat, from } from "rxjs";
import { map } from "rxjs/operators";
import { WorkflowTrafficService } from "./workflow-traffic.service";
import type { WorkflowTrafficEventInput } from "./workflow-traffic.types";

@Controller()
export class WorkflowTrafficController {
  constructor(private readonly trafficService: WorkflowTrafficService) {}

  @Post("workflow-traffic/events")
  @HttpCode(202)
  ingest(@Body() body: WorkflowTrafficEventInput): { accepted: true } {
    this.trafficService.record(body);
    return { accepted: true };
  }

  // Event-based, not snapshot-based: each SSE message is one workflow-traffic
  // event, distinct from /visualization-updates' recomputed full-state model.
  //
  // The service's buffer is a single global FIFO, not partitioned by run
  // (Task 1). A new subscriber must see only "the current run's recent
  // history" (spec RUN-005), so replay is filtered here to the runId of the
  // most recently buffered event — a prior run's tail is never replayed.
  @Sse("workflow-traffic-updates")
  updates(): Observable<MessageEvent> {
    const history = this.trafficService.recentHistory();
    const currentRunId = history.length > 0 ? history[history.length - 1].runId : null;
    const currentRunHistory = currentRunId === null
      ? []
      : history.filter((event) => event.runId === currentRunId);
    return concat(
      from(currentRunHistory),
      this.trafficService.events$,
    ).pipe(map((event) => ({ data: event }) as MessageEvent));
  }
}
```

- [ ] **Step 4: Write the module**

```typescript
// apps/bff/src/modules/workflow-traffic/workflow-traffic.module.ts
// Independent of VisualizationModule by design: workflow traffic is a
// separate real boundary from the domain-state snapshot feed.
import { Module } from "@nestjs/common";
import { WorkflowTrafficController } from "./workflow-traffic.controller";
import { WorkflowTrafficService } from "./workflow-traffic.service";

@Module({
  controllers: [WorkflowTrafficController],
  providers: [WorkflowTrafficService],
  exports: [WorkflowTrafficService],
})
export class WorkflowTrafficModule {}
```

- [ ] **Step 5: Wire the module into `AppModule`**

In `apps/bff/src/app.module.ts`, add the import next to `VisualizationModule`'s:

```typescript
import { WorkflowTrafficModule } from "./modules/workflow-traffic/workflow-traffic.module";
```

and add `WorkflowTrafficModule` to the `imports` array, after `VisualizationModule`.

- [ ] **Step 6: Run the spec to verify it passes**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/workflow-traffic/workflow-traffic.controller.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full BFF suite**

Run: `pnpm --filter @mini-commerce/bff test`
Expected: PASS, no regressions in `visualization.*` specs.

- [ ] **Step 8: Manual real-endpoint check**

Run: `./dev up` (starts BFF on `:3001`), then in one terminal:

```bash
curl -N http://localhost:3001/workflow-traffic-updates &
curl -X POST http://localhost:3001/workflow-traffic/events \
  -H 'Content-Type: application/json' \
  -d '{"runId":"manual-check","useCaseId":"commerce.purchase","useCaseVersion":1,"iterationId":"manual-1","outcome":"started"}'
```

Expected: the `curl -N` stream prints one SSE `data:` line containing `"iterationId":"manual-1"`.

- [ ] **Step 9: Commit**

```bash
git add apps/bff/src/modules/workflow-traffic/workflow-traffic.controller.ts apps/bff/src/modules/workflow-traffic/workflow-traffic.module.ts apps/bff/src/modules/workflow-traffic/workflow-traffic.controller.spec.ts apps/bff/src/app.module.ts
git commit -m "feat(bff): add workflow-traffic ingest endpoint and SSE stream"
```

---

### Task 3: k6 report-event helper and the three campaign adapters

**Files:**
- Create: `tests/performance/k6/scenarios/campaign/report-event.js`
- Create: `tests/performance/k6/scenarios/campaign/catalog-browse.js`
- Create: `tests/performance/k6/scenarios/campaign/order-lookup.js`
- Create: `tests/performance/k6/scenarios/campaign/purchase.js`

**Interfaces:**
- Consumes: `url()` from `../../config/env.js` (existing); `POST /workflow-traffic/events` and `/catalog/products`, `/catalog/products/:id`, `/orders`, `/orders/:id`, `/cart/items`, `/checkout` from the real BFF.
- Produces: `newIterationId(): string`, `reportEvent(useCase: {id: string; version: number}, iterationId: string, outcome: "started"|"succeeded"|"failed"): void` from `report-event.js`; `catalogBrowse()`, `orderLookup()`, `purchase()` exported functions (used as k6 `exec` targets by Task 5's `campaign.js`).

- [ ] **Step 1: Write `report-event.js`**

```javascript
// tests/performance/k6/scenarios/campaign/report-event.js
//
// Fire-and-forget helper shared by all campaign adapters. A failed or slow
// ingest call MUST NOT fail or slow the measured commerce iteration
// (SPEC-007 / RUN-003) — errors are swallowed, not surfaced as checks.

import http from "k6/http";
import { url } from "../../config/env.js";

const INGEST_TIMEOUT = "500ms";

export function newIterationId() {
  return `${__VU}-${__ITER}-${Date.now()}`;
}

export function reportEvent(useCase, iterationId, outcome) {
  const payload = JSON.stringify({
    runId: __ENV.RUN_ID || "local",
    useCaseId: useCase.id,
    useCaseVersion: useCase.version,
    iterationId,
    outcome,
    timestamp: new Date().toISOString(),
  });
  try {
    http.post(url("/workflow-traffic/events"), payload, {
      headers: { "Content-Type": "application/json" },
      timeout: INGEST_TIMEOUT,
      tags: { name: "workflow-traffic-ingest" },
    });
  } catch (_err) {
    // swallow — ingest must never fail the iteration
  }
}
```

- [ ] **Step 2: Write `catalog-browse.js`**

```javascript
// tests/performance/k6/scenarios/campaign/catalog-browse.js
import http from "k6/http";
import { check, group } from "k6";
import { url } from "../../config/env.js";
import { newIterationId, reportEvent } from "./report-event.js";

const USE_CASE = { id: "commerce.catalog-browse", version: 1 };
const TAGS = { use_case: USE_CASE.id, use_case_version: String(USE_CASE.version) };

export function catalogBrowse() {
  const iterationId = newIterationId();
  reportEvent(USE_CASE, iterationId, "started");
  let ok = true;
  let productId;

  group("catalog: list", () => {
    const res = http.get(url("/catalog/products"), { tags: TAGS });
    ok = check(res, { "catalog list 200": (r) => r.status === 200 }) && ok;
    if (ok) {
      try {
        const items = res.json("items");
        productId = Array.isArray(items) && items.length > 0 ? items[0].productId : undefined;
      } catch {
        productId = undefined;
      }
    }
    ok = check(productId, { "product selected": (id) => typeof id === "string" }) && ok;
  });

  if (ok && productId) {
    group("catalog: view product", () => {
      const res = http.get(url(`/catalog/products/${productId}`), { tags: TAGS });
      ok = check(res, { "product view 200": (r) => r.status === 200 }) && ok;
    });
  }

  reportEvent(USE_CASE, iterationId, ok ? "succeeded" : "failed");
}

export default catalogBrowse;
```

- [ ] **Step 3: Write `order-lookup.js`**

```javascript
// tests/performance/k6/scenarios/campaign/order-lookup.js
//
// Precondition (catalog.json): "At least one seeded order exists." Early in
// a fresh campaign this may not hold yet if the purchase adapter hasn't
// produced an order — that iteration reports "failed" honestly rather than
// being special-cased, since it reflects real endpoint state.
import http from "k6/http";
import { check, group } from "k6";
import { url } from "../../config/env.js";
import { newIterationId, reportEvent } from "./report-event.js";

const USE_CASE = { id: "commerce.order-lookup", version: 1 };
const TAGS = { use_case: USE_CASE.id, use_case_version: String(USE_CASE.version) };

export function orderLookup() {
  const iterationId = newIterationId();
  reportEvent(USE_CASE, iterationId, "started");
  let ok = true;
  let orderId;

  group("orders: list", () => {
    const res = http.get(url("/orders"), { tags: TAGS });
    ok = check(res, { "orders list 200": (r) => r.status === 200 }) && ok;
    if (ok) {
      try {
        const items = res.json("items");
        orderId = Array.isArray(items) && items.length > 0 ? items[0].orderId : undefined;
      } catch {
        orderId = undefined;
      }
    }
    ok = check(orderId, { "order selected": (id) => typeof id === "string" }) && ok;
  });

  if (ok && orderId) {
    group("orders: view", () => {
      const res = http.get(url(`/orders/${orderId}`), { tags: TAGS });
      ok = check(res, {
        "order 200": (r) => r.status === 200,
        "order id matches": (r) => {
          try {
            return r.json("orderId") === orderId;
          } catch {
            return false;
          }
        },
      }) && ok;
    });
  }

  reportEvent(USE_CASE, iterationId, ok ? "succeeded" : "failed");
}

export default orderLookup;
```

- [ ] **Step 4: Write `purchase.js`**

```javascript
// tests/performance/k6/scenarios/campaign/purchase.js
//
// concurrency.maxVirtualUsers: 1 in catalog.json — the BFF cart is
// process-local and shared, so this adapter must never run above 1 VU
// (enforced by Task 4's preflight, not by this file).
import http from "k6/http";
import { check, group } from "k6";
import { url } from "../../config/env.js";
import { newIterationId, reportEvent } from "./report-event.js";

const USE_CASE = { id: "commerce.purchase", version: 1 };
const TAGS = { use_case: USE_CASE.id, use_case_version: String(USE_CASE.version) };
const JSON_HEADERS = { "Content-Type": "application/json" };

export function purchase() {
  const iterationId = newIterationId();
  reportEvent(USE_CASE, iterationId, "started");
  let ok = true;
  let productId;
  let orderId;

  group("catalog: browse", () => {
    const res = http.get(url("/catalog/products"), { tags: TAGS });
    ok = check(res, { "catalog list 200": (r) => r.status === 200 }) && ok;
    if (ok) {
      try {
        const items = res.json("items");
        productId = Array.isArray(items) && items.length > 0 ? items[0].productId : undefined;
      } catch {
        productId = undefined;
      }
    }
    ok = check(productId, { "product selected": (id) => typeof id === "string" }) && ok;
  });

  if (ok) {
    group("cart: add item", () => {
      const res = http.post(
        url("/cart/items"),
        JSON.stringify({ productId, quantity: 1 }),
        { headers: JSON_HEADERS, tags: TAGS },
      );
      ok = check(res, { "cart add 201": (r) => r.status === 201 }) && ok;
    });
  }

  // commerce.purchase's catalog entry declares cart.viewed as an ordered
  // action (use-cases/catalog.json) — this group implements and checks it,
  // per RUN-003's "adapter MUST implement the ordered actions defined by
  // its catalog entry."
  if (ok) {
    group("cart: view", () => {
      const res = http.get(url("/cart"), { tags: TAGS });
      ok = check(res, {
        "cart view 200": (r) => r.status === 200,
        "cart contains added item": (r) => {
          try {
            const items = r.json("items");
            return Array.isArray(items) && items.some((item) => item.productId === productId);
          } catch {
            return false;
          }
        },
      }) && ok;
    });
  }

  if (ok) {
    group("checkout", () => {
      const res = http.post(
        url("/checkout"),
        JSON.stringify({ customerName: "k6 Campaign Purchase" }),
        { headers: JSON_HEADERS, tags: TAGS },
      );
      ok = check(res, {
        "checkout 201": (r) => r.status === 201,
        "checkout returns orderId": (r) => {
          try {
            return typeof r.json("orderId") === "string";
          } catch {
            return false;
          }
        },
      }) && ok;
      if (ok) orderId = res.json("orderId");
    });
  }

  if (ok && orderId) {
    group("orders: verify", () => {
      const res = http.get(url(`/orders/${orderId}`), { tags: TAGS });
      ok = check(res, {
        "order 200": (r) => r.status === 200,
        "order id matches": (r) => {
          try {
            return r.json("orderId") === orderId;
          } catch {
            return false;
          }
        },
      }) && ok;
    });
  }

  reportEvent(USE_CASE, iterationId, ok ? "succeeded" : "failed");
}

export default purchase;
```

- [ ] **Step 5: Manual real-endpoint smoke check (single VU, single iteration each)**

With `./dev up` running (BFF on `:3001`) and Task 2 merged:

```bash
docker compose -f infra/docker/compose.performance.yaml run --rm \
  -e BASE_URL=http://host.docker.internal:3001 k6 \
  run --vus 1 --iterations 1 /scripts/scenarios/campaign/catalog-browse.js

docker compose -f infra/docker/compose.performance.yaml run --rm \
  -e BASE_URL=http://host.docker.internal:3001 k6 \
  run --vus 1 --iterations 1 /scripts/scenarios/campaign/purchase.js

docker compose -f infra/docker/compose.performance.yaml run --rm \
  -e BASE_URL=http://host.docker.internal:3001 k6 \
  run --vus 1 --iterations 1 /scripts/scenarios/campaign/order-lookup.js
```

Expected: each run exits 0 with `checks_succeeded: 100.00%` (run `purchase.js` before `order-lookup.js` so a real order exists to look up).

- [ ] **Step 6: Commit**

```bash
git add tests/performance/k6/scenarios/campaign/
git commit -m "feat(k6): add report-event helper and campaign adapters for catalog-browse, order-lookup, purchase"
```

---

### Task 4: Campaign descriptor, preflight, and k6 options generation

**Files:**
- Create: `scripts/pg/campaign.py`
- Test: `scripts/pg/tests/test_campaign.py`

**Interfaces:**
- Produces: `resolve_use_case(catalog: dict, use_case_id: str, version: int) -> dict | None`; `preflight(descriptor: dict, catalog: dict) -> list[str]`; `build_k6_options(descriptor: dict, catalog: dict) -> dict` (returns `{"scenarios": {...}, "thresholds": {...}}`); `EXEC_MAP: dict[str, str]` (adapter id → k6 `exec` function name); `run(argv: list[str]) -> int` (built in Task 5).

- [ ] **Step 1: Write the failing test file**

```python
# scripts/pg/tests/test_campaign.py
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.campaign import build_k6_options, preflight, resolve_use_case  # noqa: E402

CATALOG = {
    "catalogVersion": 1,
    "useCases": [
        {
            "id": "commerce.catalog-browse",
            "version": 1,
            "status": "active",
            "adapter": "k6.catalog-browse",
            "concurrency": {"safe": True},
        },
        {
            "id": "commerce.purchase",
            "version": 1,
            "status": "active",
            "adapter": "k6.purchase",
            "concurrency": {"safe": False, "maxVirtualUsers": 1},
        },
        {
            "id": "commerce.cart-edit",
            "version": 1,
            "status": "deprecated",
            "adapter": "k6.cart-edit",
            "concurrency": {"safe": False, "maxVirtualUsers": 1},
        },
    ],
}


class ResolveUseCaseTests(unittest.TestCase):
    def test_finds_matching_id_and_version(self) -> None:
        entry = resolve_use_case(CATALOG, "commerce.purchase", 1)
        self.assertIsNotNone(entry)
        self.assertEqual(entry["adapter"], "k6.purchase")

    def test_returns_none_for_unknown_id(self) -> None:
        self.assertIsNone(resolve_use_case(CATALOG, "commerce.nonexistent", 1))


class PreflightTests(unittest.TestCase):
    def test_accepts_valid_descriptor(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.catalog-browse", "version": 1, "weight": 3}],
            "durationSeconds": 10,
        }
        self.assertEqual(preflight(descriptor, CATALOG), [])

    def test_rejects_unknown_use_case(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.nonexistent", "version": 1, "weight": 1}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("commerce.nonexistent", errors[0])

    def test_rejects_deprecated_use_case(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.cart-edit", "version": 1, "weight": 1}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("deprecated", errors[0])

    def test_rejects_concurrency_violation(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.purchase", "version": 1, "weight": 2}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("maxVirtualUsers=1", errors[0])

    def test_accepts_purchase_at_its_limit(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.purchase", "version": 1, "weight": 1}],
            "durationSeconds": 10,
        }
        self.assertEqual(preflight(descriptor, CATALOG), [])

    def test_rejects_missing_required_field(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.catalog-browse", "version": 1}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("weight", errors[0])

    def test_rejects_duplicate_use_case_selection(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [
                {"id": "commerce.catalog-browse", "version": 1, "weight": 2},
                {"id": "commerce.catalog-browse", "version": 1, "weight": 3},
            ],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("commerce.catalog-browse", errors[0])

    def test_rejects_use_case_with_no_wired_adapter(self) -> None:
        catalog = {
            "useCases": CATALOG["useCases"] + [{
                "id": "commerce.unmapped",
                "version": 1,
                "status": "active",
                "adapter": "k6.unmapped",
                "concurrency": {"safe": True},
            }],
        }
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.unmapped", "version": 1, "weight": 1}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, catalog)
        self.assertEqual(len(errors), 1)
        self.assertIn("commerce.unmapped", errors[0])


class BuildK6OptionsTests(unittest.TestCase):
    def test_generates_one_scenario_per_use_case_with_thresholds(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [
                {"id": "commerce.catalog-browse", "version": 1, "weight": 3},
                {"id": "commerce.purchase", "version": 1, "weight": 1},
            ],
            "durationSeconds": 30,
        }
        options = build_k6_options(descriptor, CATALOG)
        self.assertEqual(
            set(options["scenarios"].keys()),
            {"commerce_catalog_browse", "commerce_purchase"},
        )
        browse = options["scenarios"]["commerce_catalog_browse"]
        self.assertEqual(browse["executor"], "constant-vus")
        self.assertEqual(browse["vus"], 3)
        self.assertEqual(browse["duration"], "30s")
        self.assertEqual(browse["exec"], "catalogBrowse")
        self.assertIn("checks{scenario:commerce_purchase}", options["thresholds"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm pg:test`
Expected: FAIL — `ModuleNotFoundError: No module named 'pg.campaign'`.

- [ ] **Step 3: Implement `scripts/pg/campaign.py` (preflight and options generation only — Docker invocation is Task 5)**

```python
# scripts/pg/campaign.py
"""campaign — catalog-driven k6 campaigns. Sibling to perf.py: same
Docker/report conventions, own preflight against use-cases/catalog.json
(SPEC-006 concurrency safety). Thresholds are generated here rather than in
config/thresholds.js because they depend on which use cases a given
campaign descriptor selects — there is no static set to name ahead of time.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from pg.paths import REPO_ROOT

CATALOG_PATH = REPO_ROOT / "use-cases" / "catalog.json"
DEFAULT_DESCRIPTOR = (
    REPO_ROOT / "tests" / "performance" / "k6" / "campaigns" / "morning-rush.json"
)

EXEC_MAP: Dict[str, str] = {
    "k6.catalog-browse": "catalogBrowse",
    "k6.order-lookup": "orderLookup",
    "k6.purchase": "purchase",
}


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def resolve_use_case(
    catalog: Dict[str, Any], use_case_id: str, version: int
) -> Optional[Dict[str, Any]]:
    for entry in catalog.get("useCases", []):
        if entry["id"] == use_case_id and entry["version"] == version:
            return entry
    return None


def preflight(descriptor: Dict[str, Any], catalog: Dict[str, Any]) -> List[str]:
    # Structural checks first: preflight passing must guarantee
    # build_k6_options() cannot KeyError on a missing/duplicate field.
    errors: List[str] = []
    if "runId" not in descriptor:
        errors.append("descriptor missing required field: runId")
    if "durationSeconds" not in descriptor:
        errors.append("descriptor missing required field: durationSeconds")
    seen: set = set()
    for selection in descriptor.get("useCases", []):
        missing = [f for f in ("id", "version", "weight") if selection.get(f) is None]
        if missing:
            errors.append(f"use case selection missing required field(s): {', '.join(missing)}")
            continue
        use_case_id = selection["id"]
        version = selection["version"]
        weight = selection["weight"]
        key = (use_case_id, version)
        if key in seen:
            errors.append(f"duplicate use-case selection: {use_case_id}@{version}")
            continue
        seen.add(key)
        entry = resolve_use_case(catalog, use_case_id, version)
        if entry is None:
            errors.append(f"unknown use case: {use_case_id}@{version}")
            continue
        if entry.get("status") == "deprecated":
            errors.append(f"deprecated use case: {use_case_id}@{version}")
            continue
        if entry["adapter"] not in EXEC_MAP:
            errors.append(
                f"no campaign adapter wired for: {use_case_id} (adapter {entry['adapter']})"
            )
            continue
        concurrency = entry.get("concurrency", {})
        max_vus = concurrency.get("maxVirtualUsers")
        if not concurrency.get("safe", True) and max_vus is not None and weight > max_vus:
            errors.append(
                f"{use_case_id} requests {weight} VUs but its concurrency limit is "
                f"maxVirtualUsers={max_vus}"
            )
    return errors


def _scenario_name(use_case_id: str) -> str:
    return use_case_id.replace(".", "_").replace("-", "_")


def build_k6_options(descriptor: Dict[str, Any], catalog: Dict[str, Any]) -> Dict[str, Any]:
    scenarios: Dict[str, Any] = {}
    thresholds: Dict[str, Any] = {"http_req_failed": ["rate<0.05"]}
    for selection in descriptor["useCases"]:
        entry = resolve_use_case(catalog, selection["id"], selection["version"])
        name = _scenario_name(selection["id"])
        scenarios[name] = {
            "executor": "constant-vus",
            "vus": selection["weight"],
            "duration": f"{descriptor['durationSeconds']}s",
            "exec": EXEC_MAP[entry["adapter"]],
            "tags": {
                "use_case": entry["id"],
                "use_case_version": str(entry["version"]),
            },
        }
        # Referencing the scenario-scoped submetric forces k6 to include it in
        # --summary-export, which is how RUN-004's per-use-case counts surface.
        thresholds[f"checks{{scenario:{name}}}"] = ["rate>0.5"]
    return {"scenarios": scenarios, "thresholds": thresholds}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm pg:test`
Expected: PASS, including the new `test_campaign` cases.

- [ ] **Step 5: Commit**

```bash
git add scripts/pg/campaign.py scripts/pg/tests/test_campaign.py
git commit -m "feat(pg): add campaign preflight and k6 options generation"
```

---

### Task 5: Campaign entry script, Docker invocation, and CLI wiring

**Files:**
- Create: `tests/performance/k6/scenarios/campaign/campaign.js`
- Create: `tests/performance/k6/campaigns/morning-rush.json`
- Modify: `scripts/pg/campaign.py` (add `run()`)
- Modify: `scripts/pg/cli.py`
- Modify: `package.json`
- Modify: `Taskfile.yml`

**Interfaces:**
- Consumes: `catalogBrowse`, `orderLookup`, `purchase` from Task 3's adapter files; `build_k6_options`, `preflight`, `load_json`, `CATALOG_PATH`, `DEFAULT_DESCRIPTOR` from Task 4.
- Produces: `./dev perf:campaign [descriptor-path]` (and `pnpm pg:perf:campaign`, `task perf:campaign`); `reports/campaign-<runId>-summary.json`.

- [ ] **Step 1: Write the campaign descriptor**

```json
{
  "runId": "morning-rush",
  "useCases": [
    { "id": "commerce.catalog-browse", "version": 1, "weight": 3 },
    { "id": "commerce.order-lookup", "version": 1, "weight": 2 },
    { "id": "commerce.purchase", "version": 1, "weight": 1 }
  ],
  "durationSeconds": 60,
  "visualization": { "enabled": true }
}
```

Save to `tests/performance/k6/campaigns/morning-rush.json`.

- [ ] **Step 2: Write the k6 entry script**

```javascript
// tests/performance/k6/scenarios/campaign/campaign.js
//
// options is generated by scripts/pg/campaign.py from the selected campaign
// descriptor and passed in as CAMPAIGN_JSON — this file does not hand-author
// scenario weights, executors, or thresholds.
import { catalogBrowse } from "./catalog-browse.js";
import { orderLookup } from "./order-lookup.js";
import { purchase } from "./purchase.js";

export const options = JSON.parse(__ENV.CAMPAIGN_JSON);

export { catalogBrowse, orderLookup, purchase };
```

- [ ] **Step 3: Add `run()` to `scripts/pg/campaign.py`**

Add these imports to the existing top-of-file import block (alongside the
`from pg.paths import REPO_ROOT` line already there from Task 4):

```python
import os
import subprocess

from pg.ansi import fail, header, info, pass_, warn
from pg.paths import BFF_PORT, COMPOSE_PERF_FILE, PERF_REPORTS_DIR, REPO_ROOT
from pg.ports import port_in_use
```

Then append the following to the end of the file:

```python
def _default_base_url() -> str:
    return os.environ.get("BASE_URL") or f"http://host.docker.internal:{BFF_PORT}"


def run(argv: List[str]) -> int:
    header("Performance campaign (k6)")
    descriptor_path = Path(argv[0]) if argv else DEFAULT_DESCRIPTOR
    if not descriptor_path.exists():
        fail(f"campaign descriptor not found: {descriptor_path}")
        return 1

    descriptor = load_json(descriptor_path)
    catalog = load_json(CATALOG_PATH)

    errors = preflight(descriptor, catalog)
    if errors:
        for err in errors:
            fail(err)
        return 1

    run_id = descriptor["runId"]
    options = build_k6_options(descriptor, catalog)
    base_url = _default_base_url()
    summary_filename = f"campaign-{run_id}-summary.json"
    summary_in_container = f"/scripts/reports/{summary_filename}"
    summary_on_host = PERF_REPORTS_DIR / summary_filename

    info(f"Target   : {base_url}")
    info(f"Run id   : {run_id}")
    info(f"Use cases: {', '.join(s['id'] for s in descriptor['useCases'])}")
    info(f"Summary  : {summary_on_host}")
    print()

    if (
        ("localhost" in base_url or "host.docker.internal" in base_url)
        and not port_in_use(BFF_PORT)
    ):
        warn(f"BFF does not appear to be listening on :{BFF_PORT}. Start it with: ./dev up")
        print()

    cmd = [
        "docker", "compose", "-f", str(COMPOSE_PERF_FILE),
        "run", "--rm",
        "-e", f"BASE_URL={base_url}",
        "-e", f"RUN_ID={run_id}",
        "-e", f"CAMPAIGN_JSON={json.dumps(options)}",
        "k6",
        "run", "--summary-export", summary_in_container,
        "/scripts/scenarios/campaign/campaign.js",
    ]
    result = subprocess.run(cmd, check=False)
    print()
    if result.returncode == 0:
        pass_(f"k6 campaign '{run_id}' completed.")
        info(f"Summary written to {summary_on_host}")
        print()
        return 0
    fail(f"k6 campaign '{run_id}' failed (exit code {result.returncode}).")
    return result.returncode
```

- [ ] **Step 4: Register `perf:campaign` in `scripts/pg/cli.py`**

Add near the other `_perf_*` functions:

```python
def _perf_campaign(args: Sequence[str]) -> int:
    from pg import campaign
    return campaign.run(list(args))
```

Add `"perf:campaign": _perf_campaign,` to the `COMMANDS` dict, after `"perf:read-heavy": _perf_read_heavy,`.

- [ ] **Step 5: Add `pnpm pg:perf:campaign` to `package.json`**

In the `scripts` object, after `"pg:perf:read-heavy": "./dev perf:read-heavy",`:

```json
"pg:perf:campaign": "./dev perf:campaign",
```

- [ ] **Step 6: Add `perf:campaign` to `Taskfile.yml`**

After the `perf:smoke:` block:

```yaml
  perf:campaign:
    desc: k6 catalog-driven campaign in Docker (catalog-browse, order-lookup, purchase)
    cmds:
      - pnpm pg:perf:campaign
```

- [ ] **Step 7: Real end-to-end run**

Run: `./dev up` (if not already running), then `./dev perf:campaign`.
Expected: exit code `0`; `tests/performance/k6/reports/campaign-morning-rush-summary.json` exists; `jq '.metrics["checks{scenario:commerce_purchase}"]' tests/performance/k6/reports/campaign-morning-rush-summary.json` returns a non-null object with a `rate`.

- [ ] **Step 8: Confirm real traffic reached the feed**

While `./dev perf:campaign` is running (or immediately after), run:

```bash
curl -s http://localhost:3001/workflow-traffic-updates | head -5
```

Expected: several `data:` lines with `runId":"morning-rush"` and a mix of `useCaseId` values matching the descriptor.

- [ ] **Step 9: Commit**

```bash
git add tests/performance/k6/scenarios/campaign/campaign.js tests/performance/k6/campaigns/morning-rush.json scripts/pg/campaign.py scripts/pg/cli.py package.json Taskfile.yml
git commit -m "feat(pg): wire perf:campaign entry point through Docker"
```

---

### Task 6: Orchestrator and scenario-library documentation

**Files:**
- Modify: `docs/performance/orchestrator.md`
- Modify: `tests/performance/k6/README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add the campaign entry point to `docs/performance/orchestrator.md`**

In the "Entry points today" table, add a row after `perf:read-heavy`:

```markdown
| `./dev perf:campaign [descriptor]` | `scenarios/campaign/campaign.js` | `campaign-<runId>-summary.json` |
```

In the "Layout" code block, add under `scenarios/`:

```
    campaign/
      campaign.js            # generated options; exec targets from adapters
      catalog-browse.js
      order-lookup.js
      purchase.js
      report-event.js        # fire-and-forget workflow-traffic emitter
  campaigns/
    morning-rush.json        # example campaign descriptor
```

Add a short paragraph after "Extending the orchestrator" noting: campaign thresholds are generated per-run in `scripts/pg/campaign.py` rather than named in `config/thresholds.js`, because they depend on which use cases a given descriptor selects — there is no static set to name ahead of time.

- [ ] **Step 2: Add the campaign scenario to `tests/performance/k6/README.md`**

In the folder layout tree, add `campaign/` under `scenarios/`. In "How to run scenarios locally", add:

```bash
pnpm pg:perf:campaign                                       # default descriptor
pnpm pg:perf:campaign tests/performance/k6/campaigns/morning-rush.json
```

- [ ] **Step 3: Commit**

```bash
git add docs/performance/orchestrator.md tests/performance/k6/README.md
git commit -m "docs(performance): document the campaign entry point"
```

---

### Task 7: Falling-cup builder and renderer (`objects/traffic-cup.js` + `layout/traffic-render.js`)

> The Visualizer is a per-concern module graph (see the module-discipline
> table in `.claude/skills/expresso-visualizer-review/SKILL.md`), not the
> single-file `scene.js` the original spec draft assumed — `apps/visualizer-3d`
> was refactored (PR #18) after this plan's first draft. This task and Task 8
> target the current module layout: `materials.js`, `geometry/frustum.js`,
> `objects/espresso-cup.js`, `objects/disposal.js`, `layout/render.js`,
> `transport.js`, `fallback.js`, `scene.js` (thin entry).

**Files:**
- Modify: `apps/visualizer-3d/public/materials.js` (add one export, nothing else)
- Create: `apps/visualizer-3d/public/objects/traffic-cup.js`
- Create: `apps/visualizer-3d/public/layout/traffic-render.js`

**Interfaces:**
- Consumes: `buildSquareFrustum(topW, botW, h)` from `geometry/frustum.js`; `makePsxTexture(hexColor, size)` from `materials.js` (both existing, unmodified).
- Produces: `TRAFFIC_COLORS` (new export in `materials.js`); `trafficVisualFor(useCaseId)`, `buildTrafficCupGroup(useCaseId)` (in `objects/traffic-cup.js`); `createTrafficRenderer({ trafficGroup })` returning `{ handleEvent(evt), tick(now) }` (in `layout/traffic-render.js`). Consumed by Task 8's `scene.js` wiring.

- [ ] **Step 1: Add `TRAFFIC_COLORS` to `materials.js`**

Append to the end of `apps/visualizer-3d/public/materials.js` (do not change any existing line — `ESPRESSO_PALETTE`, `STATUS_COLORS`, `desaturateHex`, `makePsxTexture` stay exactly as they are):

```javascript
// Workflow-traffic cup colours, keyed by catalog use-case id (values copied
// from use-cases/catalog.json's `visual.color`). Kept here per the
// module-discipline rule: no hex literals outside this file.
export const TRAFFIC_COLORS = {
  "commerce.catalog-browse": 0x8B5E3C,
  "commerce.order-lookup":   0x1976D2,
  "commerce.purchase":       0x2E7D32,
};
```

- [ ] **Step 2: Write `objects/traffic-cup.js`**

```javascript
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
```

- [ ] **Step 3: Write `layout/traffic-render.js`**

```javascript
// apps/visualizer-3d/public/layout/traffic-render.js
//
// Owns traffic-cup placement, fall/land/terminal state, and disposal —
// the traffic equivalent of layout/render.js's hero-placement + animate
// concern, kept in its own file so layout/render.js is never touched.
import { buildTrafficCupGroup, trafficVisualFor } from "../objects/traffic-cup.js";
import { STATUS_COLORS } from "../materials.js";

const FALL_SPEED    = 0.9;  // world units / second
const FLOOR_Y        = 0.02;
const SETTLE_MS      = 900; // time visible after terminal treatment before despawn
const MAX_CONCURRENT = 60;  // hard cap safety net — see RUN-006/SPEC-009 scope note

export function createTrafficRenderer({ trafficGroup }) {
  const cupsByIteration = new Map(); // iterationId → THREE.Group
  let lastFrameAt = null;

  function disposeCup(group) {
    cupsByIteration.delete(group.userData.iterationId);
    trafficGroup.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }

  function spawnCup(useCaseId, iterationId) {
    if (trafficGroup.children.length >= MAX_CONCURRENT) {
      disposeCup(trafficGroup.children[0]);
    }
    const visual = trafficVisualFor(useCaseId);
    const group = buildTrafficCupGroup(useCaseId);
    group.position.set(visual.laneX, visual.spawnY, 0.6);
    group.userData = { iterationId, state: "falling", outcome: null, landedAt: null };
    trafficGroup.add(group);
    cupsByIteration.set(iterationId, group);
    return group;
  }

  // Succeeded reads as a normal landing (no extra treatment); failed tips
  // over and tints red so it is never mistaken for a successful landing.
  function applyTerminalTreatment(group, outcome) {
    if (outcome !== "failed") return;
    const mesh = group.children[0];
    mesh.rotation.z = Math.PI / 2.2;
    mesh.material.color?.set?.(STATUS_COLORS.error);
  }

  function handleEvent(evt) {
    if (evt.outcome === "started") {
      spawnCup(evt.useCaseId, evt.iterationId);
      return;
    }
    const existing = cupsByIteration.get(evt.iterationId);
    if (existing) {
      existing.userData.outcome = evt.outcome;
      return;
    }
    // Late-connecting client: no in-flight cup for this iterationId — spawn
    // directly at its terminal treatment rather than dropping the event.
    const group = spawnCup(evt.useCaseId, evt.iterationId);
    group.position.y = FLOOR_Y;
    group.userData.state = "terminal";
    group.userData.outcome = evt.outcome;
    group.userData.landedAt = performance.now();
    applyTerminalTreatment(group, evt.outcome);
  }

  function tick(now) {
    const dt = lastFrameAt === null ? 1 / 60 : Math.min((now - lastFrameAt) / 1000, 0.1);
    lastFrameAt = now;
    for (let i = trafficGroup.children.length - 1; i >= 0; i--) {
      const cupGroup = trafficGroup.children[i];
      const ud = cupGroup.userData;
      if (ud.state === "falling") {
        cupGroup.position.y -= FALL_SPEED * dt;
        if (cupGroup.position.y <= FLOOR_Y) {
          cupGroup.position.y = FLOOR_Y;
          ud.state = ud.outcome ? "terminal" : "landed";
          ud.landedAt = now;
          if (ud.outcome) applyTerminalTreatment(cupGroup, ud.outcome);
        }
      } else if (ud.state === "landed" && ud.outcome) {
        ud.state = "terminal";
        ud.landedAt = now;
        applyTerminalTreatment(cupGroup, ud.outcome);
      } else if (ud.state === "terminal" && now - ud.landedAt > SETTLE_MS) {
        disposeCup(cupGroup);
      }
    }
  }

  return { handleEvent, tick };
}
```

- [ ] **Step 4: Verify no existing module was touched**

Run: `git diff --stat`
Expected: only `apps/visualizer-3d/public/materials.js` (one new export appended), `apps/visualizer-3d/public/objects/traffic-cup.js` (new file), and `apps/visualizer-3d/public/layout/traffic-render.js` (new file) appear. `objects/espresso-cup.js`, `layout/render.js`, `transport.js`, `objects/disposal.js`, and `geometry/frustum.js` must not appear in the diff.

- [ ] **Step 5: Commit**

```bash
git add apps/visualizer-3d/public/materials.js apps/visualizer-3d/public/objects/traffic-cup.js apps/visualizer-3d/public/layout/traffic-render.js
git commit -m "feat(visualizer): add falling-cup builder and renderer modules"
```

---

### Task 8: Traffic transport, HUD, and `scene.js` wiring

**Files:**
- Create: `apps/visualizer-3d/public/traffic-transport.js`
- Modify: `apps/visualizer-3d/public/index.html`
- Modify: `apps/visualizer-3d/public/scene.js`

**Interfaces:**
- Consumes: `trafficVisualFor(useCaseId)` from Task 7's `objects/traffic-cup.js`; `createTrafficRenderer({ trafficGroup })` from Task 7's `layout/traffic-render.js`.
- Produces: `initTrafficTransport({ onEvent, hudEls }) → { connect() }`.

- [ ] **Step 1: Write `traffic-transport.js`**

```javascript
// apps/visualizer-3d/public/traffic-transport.js
//
// Workflow-traffic feed — independent EventSource from transport.js's
// domain-state stream (never imports from or modifies transport.js).
// Event-based, not snapshot-based: each SSE message is one workflow-traffic
// event, never a recomputed full state. Owns its own HUD bookkeeping, the
// same way initTransport owns setStatus internally.
import { trafficVisualFor } from "./objects/traffic-cup.js";

const API_BASE = (() => {
  if (typeof window === "undefined") return "http://localhost:3001";
  if (window.location.pathname.startsWith("/viz")) return "/api/bff";
  return window.__VIZ_CONFIG__?.apiBaseUrl || "http://localhost:3001";
})();

const SSE_RETRY_MS = 5000;

export function initTrafficTransport({ onEvent, hudEls }) {
  let sseSource = null;
  let sseRetryHandle = null;
  const hudState = { runId: null, useCases: new Map(), succeeded: 0, failed: 0 };

  function updateHud(evt) {
    if (!hudEls?.root) return;
    if (evt.runId !== hudState.runId) {
      hudState.runId = evt.runId;
      hudState.useCases.clear();
      hudState.succeeded = 0;
      hudState.failed = 0;
    }
    hudState.useCases.set(evt.useCaseId, trafficVisualFor(evt.useCaseId).label);
    if (evt.outcome === "succeeded") hudState.succeeded++;
    if (evt.outcome === "failed") hudState.failed++;

    hudEls.root.hidden = false;
    hudEls.runId.textContent = hudState.runId;
    hudEls.useCases.textContent = Array.from(hudState.useCases.values()).join(", ");
    hudEls.counts.textContent = `${hudState.succeeded} ok / ${hudState.failed} failed`;
  }

  function connect() {
    if (typeof EventSource === "undefined") return;
    if (sseSource) { sseSource.close(); sseSource = null; }
    clearTimeout(sseRetryHandle);
    sseRetryHandle = null;

    sseSource = new EventSource(`${API_BASE}/workflow-traffic-updates`);

    sseSource.addEventListener("open", () => {
      clearTimeout(sseRetryHandle);
      sseRetryHandle = null;
    });

    sseSource.addEventListener("message", (event) => {
      try {
        const evt = JSON.parse(event.data);
        onEvent(evt);
        updateHud(evt);
      } catch {
        // Malformed traffic event — drop it; domain-state path is unaffected.
      }
    });

    sseSource.addEventListener("error", () => {
      if (sseSource) { sseSource.close(); sseSource = null; }
      sseRetryHandle = setTimeout(() => connect(), SSE_RETRY_MS);
    });
  }

  return { connect };
}
```

- [ ] **Step 2: Add additive HUD markup**

In `apps/visualizer-3d/public/index.html`, inside `<div class="hud-controls">`, insert new elements between `#status` and the `#reload` button (do not modify `#status` or `#reload`):

```html
        <span id="status" class="status">starting…</span>
        <div id="traffic-hud" class="traffic-hud" hidden>
          <span id="traffic-run-id"></span>
          <span id="traffic-use-cases"></span>
          <span id="traffic-counts"></span>
        </div>
        <button id="reload" type="button">Reload data</button>
```

- [ ] **Step 3: Wire everything into `scene.js`**

In `apps/visualizer-3d/public/scene.js`, add these imports alongside the existing ones (after `import { initTransport } from "./transport.js";`):

```javascript
import { createTrafficRenderer } from "./layout/traffic-render.js";
import { initTrafficTransport } from "./traffic-transport.js";
```

After the existing `const { renderScene, sceneObjectCount } = createRenderer({ dataGroup });` / `const animator = ...` / `const transport = initTransport({...});` block, add (do not change any of those three existing statements):

```javascript
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

Then change:

```javascript
transport.connect();
animator.start();
```

to:

```javascript
transport.connect();
animator.start();
trafficTransport.connect();
requestAnimationFrame(tickTraffic);
```

(Leave `reloadBtn`'s listener and the `visibilitychange` handler exactly as they are — the traffic connection is not wired into them for this pass; it simply keeps streaming.)

- [ ] **Step 4: Manual browser verification**

Run: `./dev up web` (or `./dev up full`), then open `http://localhost:3002` (standalone Visualizer).
Expected: HUD's `#traffic-hud` stays `hidden` (no visible change from today) since no campaign is running yet.

Then, in another terminal: `./dev perf:campaign`.
Expected within a few seconds: `#traffic-hud` becomes visible, showing `morning-rush`, a comma-separated list including "Catalog browse", "Order lookup", "Purchase", and a growing `N ok / M failed` counter. Falling cups (from Task 7) are visible dropping from the top of the scene in three distinguishable colors, landing, and — for any failed iteration — tipping over with a red tint.

- [ ] **Step 5: Verify no existing module was touched beyond the documented wiring lines**

Run: `git diff apps/visualizer-3d/public/scene.js`
Expected: only new import lines, the new `trafficGroup`/`trafficRenderer`/`trafficTransport`/`tickTraffic` block, and the three added lines at the bottom (`trafficTransport.connect();`, `requestAnimationFrame(tickTraffic);`) — no existing line changed.

- [ ] **Step 6: Commit**

```bash
git add apps/visualizer-3d/public/traffic-transport.js apps/visualizer-3d/public/index.html apps/visualizer-3d/public/scene.js
git commit -m "feat(visualizer): wire workflow-traffic transport and HUD into scene.js"
```

---

### Task 9: Full end-to-end validation and evidence capture (RUN-008)

**Files:** none (validation only).

- [ ] **Step 1: Run the full local stack**

Run: `./dev up web`

- [ ] **Step 2: Run the campaign against the live stack**

Run: `./dev perf:campaign`
Expected: exit code `0`.

- [ ] **Step 3: Capture two time-separated screenshots of the standalone Visualizer**

Open `http://localhost:3002`, take a screenshot, wait 2 seconds, take a second screenshot. Confirm at least one cup's vertical position differs between the two — this is the downward-movement evidence RUN-006's acceptance criteria require (a single static screenshot is not sufficient).

- [ ] **Step 4: Confirm a real failure treatment**

Temporarily lower a seeded product's inventory to 0 (via `GET /catalog/products` + a direct DB update, or by running enough real `purchase` iterations to exhaust it), re-run `./dev perf:campaign`, and confirm at least one purchase iteration reports `outcome: "failed"` on `/workflow-traffic-updates` and its cup tips over with the red tint in the browser, while the HUD's failed counter increments. Restore the product's inventory afterward.

- [ ] **Step 5: Confirm the embedded Visualizer shows the same traffic**

Open the web app's `/visualizer` page (embeds the same `scene.js`) during another `./dev perf:campaign` run. Confirm the same falling cups and HUD counters appear there.

- [ ] **Step 6: Run the full automated suite once more**

Run: `pnpm pg:test && pnpm --filter @mini-commerce/bff test`
Expected: PASS.

- [ ] **Step 7: Report validation evidence**

Summarize in the PR description (not committed as a separate file): commands run, campaign summary path and key counts, screenshot evidence of movement, and the failure-treatment confirmation. Per RUN-008, automating this end-to-end check is CERT-004's job (a separate, not-yet-built spec) — this step is manual by design.
