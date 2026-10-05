# Simplify Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Place Order the final step (no prepare/cancel lifecycle), add a per-session "My orders" listing next to "All orders", and make hot/cold the only order state signal.

**Architecture:** Orders gain a nullable `sessionId` (from the existing `sid` cookie) and lose `status` in one Prisma migration. The BFF drops `POST /orders/:id/manage`, adds `GET /orders/mine`, and the visualization derives order tint and aggregates from temperature. The web Orders section becomes a My/All toggle over a single list component that revalidates when its soonest hot order cools.

**Tech Stack:** NestJS + Prisma + Postgres (BFF, Vitest), Next.js + SWR (web), Playwright (e2e), Python stdlib smoke (`scripts/pg/smoke.py`), k6.

**Spec:** `docs/superpowers/specs/2026-10-05-simplify-orders-design.md`

## Global Constraints

- No AI attribution in commits, PR text, or docs (repo `CLAUDE.md`).
- English for all committed content; no real names, URLs, IPs, or credentials.
- `sessionId` is server-side only and never serialized on any wire type.
- "User" is the anonymous session resolved by `SessionService.resolveSessionId(req, res)` (cookie `sid`). No login, no name collection.
- No cancel action. A placed order is terminal.
- `status` is removed everywhere: DB column, BFF types, `@mini-commerce/shared-types`, `@mini-commerce/contracts`, web, visualizer, smoke, k6, e2e.
- `GET /orders/mine` never errors for an unknown session; it returns `{ items: [] }`.
- `scripts/pg/` stays standard-library-only.
- Living docs are updated; historical specs/plans under `docs/superpowers/` and `docs/specs/` are not rewritten.

## Review Focus

1. **Route shadowing:** `GET /orders/mine` must not be captured by `GET /orders/:id` (would 404 "order mine not found"). Pinned in Task 3 by a metadata-order test.
2. **Fresh browser with no cookie:** `/orders/mine` must mint a session and return `{ items: [] }`, not 4xx/5xx. Pinned in Task 3.
3. **Idempotent checkout retry from a different session:** replay must return the original order and must not re-own it. Pinned in Task 2 (cache replay keeps the original session index) and Task 4.
4. **Browser clock ahead of server:** the list cool-down timer must not hot-loop refetches when the server still says "hot". Pinned in Task 7 by the 1 s minimum delay and covered by the e2e list-flip test.
5. **Historical orders without a session (seed `ord_demo`):** must appear in All orders and never in My orders. Pinned in Task 2 (`listForSession` excludes null-session rows) and Task 8 (smoke).

---

### Task 1: Visualization derives order meaning from temperature

Order `status` is about to disappear; the visualization is the only BFF consumer that maps it. Switch it to `temperature` first (which already exists on `Order`), so later tasks compile.

**Files:**
- Modify: `apps/bff/src/modules/visualization/visualization.types.ts`
- Modify: `apps/bff/src/modules/visualization/visualization.service.ts`
- Modify: `apps/visualizer-3d/public/fallback.js:10-14`
- Test: `apps/bff/src/modules/visualization/visualization.service.spec.ts`

**Interfaces:**
- Consumes: `Order.temperature: "hot" | "cold"` (already on `apps/bff/src/modules/orders/orders.types.ts`).
- Produces: `SceneOrder { orderId; customerName; temperature: OrderTemperature; vizStatus; total; lineCount; placedAt; updatedAt }` (no `status`); `OrderAggregates { totalCount; olderCount; temperatureCounts: Readonly<Record<OrderTemperature, number>> }`. Legacy item metadata key `orderStatus` is replaced by `temperature`.

- [ ] **Step 1: Update the spec fixtures and write failing tests**

In `visualization.service.spec.ts`:

Replace the `VALID_ORDER_STATUSES` set (lines 8-13) with:

```ts
const VALID_TEMPERATURES = new Set(["hot", "cold"]);
```

Replace the `ORDERS` fixture's `status: "pending",` line with temperature fields (keep the rest):

```ts
    temperature: "hot",
    coolsAt: "2026-05-14T12:05:00.000Z",
```

and remove `status` from it.

Replace the two tests "order items are spheres with status mapped from order status" and "cancelled order maps to error status" with:

```ts
    it("order items are spheres tinted ok while hot", () => {
      const { items } = makeSvc().list();
      const orderItem = items.find((i) => i.id === "viz_order_ord_demo");
      expect(orderItem?.type).toBe("sphere");
      expect(orderItem?.status).toBe("ok"); // hot → ok
      expect(orderItem?.metadata.temperature).toBe("hot");
    });

    it("cold order maps to idle status", () => {
      const cold: Order = { ...ORDERS[0], temperature: "cold" };
      const { items } = makeSvc({ orders: [cold] }).list();
      expect(items.find((i) => i.id === "viz_order_ord_demo")?.status).toBe(
        "idle",
      );
    });
```

In "scene.recentOrders carries SceneOrder entries with vizStatus mapping" replace the two status lines with:

```ts
      expect(VALID_TEMPERATURES.has(ord.temperature)).toBe(true);
      expect(ord).not.toHaveProperty("status");
      expect(ord.vizStatus).toBe("ok"); // hot → ok
```

Replace "scene.orderAggregates math: totalCount + olderCount + statusCounts" with:

```ts
    it("scene.orderAggregates math: totalCount + olderCount + temperatureCounts", () => {
      const orders: Order[] = [
        { ...ORDERS[0], orderId: "ord_a", temperature: "hot" },
        { ...ORDERS[0], orderId: "ord_b", temperature: "cold" },
        { ...ORDERS[0], orderId: "ord_c", temperature: "cold" },
      ];
      const { scene } = makeSvc({ orders }).list();
      expect(scene.orderAggregates.totalCount).toBe(3);
      expect(scene.orderAggregates.olderCount).toBe(0);
      expect(scene.orderAggregates.temperatureCounts).toEqual({
        hot: 1,
        cold: 2,
      });
    });
```

In "scene survives orders throwing", replace the `statusCounts` line with:

```ts
        temperatureCounts: { hot: 0, cold: 0 },
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/visualization/visualization.service.spec.ts`
Expected: FAIL — `orderItem.status` is `"warn"`, `temperatureCounts` undefined, `ord.status` present.

- [ ] **Step 3: Implement**

`visualization.types.ts` — change the import and the two order shapes:

```ts
import type { Money, OrderTemperature } from "@mini-commerce/shared-types";
```

```ts
export interface SceneOrder {
  readonly orderId: string;
  readonly customerName: string | null;
  readonly temperature: OrderTemperature;
  readonly vizStatus: VisualizationItemStatus;
  readonly total: Money;
  readonly lineCount: number;
  readonly placedAt: string;
  readonly updatedAt: string;
}

export interface OrderAggregates {
  readonly totalCount: number;
  readonly olderCount: number;
  readonly temperatureCounts: Readonly<Record<OrderTemperature, number>>;
}
```

`visualization.service.ts`:

Replace the `OrderStatus` import with `import type { OrderTemperature } from "@mini-commerce/shared-types";`.

Replace `emptyStatusCounts` with:

```ts
function emptyTemperatureCounts(): Record<OrderTemperature, number> {
  return { hot: 0, cold: 0 };
}
```

Replace `orderStatus(status)` with:

```ts
// A hot order is a fresh, live event; a cold one is settled history.
function orderVizStatus(temperature: OrderTemperature): VisualizationItemStatus {
  return temperature === "hot" ? "ok" : "idle";
}
```

In `fromOrder`: `status: orderVizStatus(order.temperature),` and in metadata replace `orderStatus: order.status,` with `temperature: order.temperature,`.

In `toSceneOrder` replace the two status lines with:

```ts
    temperature: order.temperature,
    vizStatus: orderVizStatus(order.temperature),
```

In `aggregateOrders`:

```ts
  const counts = emptyTemperatureCounts();
  for (const o of orders) {
    counts[o.temperature] += 1;
  }
```

and return `temperatureCounts: counts,` instead of `statusCounts`.

Wherever the service builds the zeroed aggregates for the orders-throwing path, use `temperatureCounts: emptyTemperatureCounts()` (search the file for `emptyStatusCounts`).

`apps/visualizer-3d/public/fallback.js` — replace the `statusCounts` line with:

```js
    temperatureCounts: { hot: 0, cold: 0 },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/visualization`
Expected: PASS

Run: `grep -rn "statusCounts\|orderStatus(" apps/bff/src apps/visualizer-3d/public`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/visualization apps/visualizer-3d/public/fallback.js
git commit -m "feat(viz): derive order tint and aggregates from temperature"
```

---

### Task 2: Orders persist session ownership and drop status + manage

**Files:**
- Create: `apps/bff/prisma/migrations/20261005120000_order_session_drop_status/migration.sql`
- Modify: `apps/bff/prisma/schema.prisma:24-40`
- Modify: `apps/bff/prisma/seed.ts:42`
- Modify: `apps/bff/src/modules/orders/orders.types.ts`
- Modify: `apps/bff/src/modules/orders/orders.service.ts`
- Modify: `apps/bff/src/modules/orders/orders.controller.ts` (remove manage handler only)
- Modify: `apps/bff/src/modules/orders/orders.module.ts` (header comment)
- Delete: `apps/bff/src/modules/orders/orders.dto.ts`
- Test: `apps/bff/src/modules/orders/orders.service.spec.ts`, `apps/bff/src/modules/orders/orders.controller.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `CreateOrderInput.sessionId?: string`
  - `OrdersService.listForSession(sessionId: string): ReadonlyArray<Order>` — orders whose stored `sessionId` equals the argument, newest `placedAt` first; never includes null-session rows.
  - `Order` (BFF) without `status`; `OrderStatusResponse` without `status`.
  - `OrdersService.manage` and `ManageOrderResponse` no longer exist.

- [ ] **Step 1: Schema + migration + seed**

`schema.prisma` — in `model Order`, delete the `status String` line and add after `customerName`:

```prisma
  // Anonymous owner: the `sid` cookie of the browser that placed the order.
  // NULL for seed and pre-session orders, which only appear in GET /orders.
  sessionId        String?
```

and before the closing `}` of `model Order`:

```prisma

  @@index([sessionId])
```

`migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "Order" DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "Order_sessionId_idx" ON "Order"("sessionId");
```

`seed.ts` — delete the `status: "pending",` line in the `ord_demo` create block.

Run: `pnpm --filter @mini-commerce/bff exec prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 2: Write the failing service tests**

In `orders.service.spec.ts`:

- `DB_ORDER`: delete `status: "pending",`, add `sessionId: null,` after `customerName`.
- Remove the `BadRequestException` import.
- In "maps DB columns to the Order DTO shape" replace `expect(order.status).toBe("pending");` with `expect(order).not.toHaveProperty("status");` and add `expect(order).not.toHaveProperty("sessionId");`.
- In "persists via prisma.order.create with nested lines" replace `status: "pending",` in the expected data with `sessionId: null,`.
- Delete the whole `describe("manage()", ...)` block.
- In `getStatus()` tests: replace `select: { orderId: true, status: true, placedAt: true }` with `select: { orderId: true, placedAt: true }`; delete `status: "prepared",` / `status: "pending",` from the mocked rows and from the expected `toEqual` object.

Add a new block after `describe("get()", ...)`:

```ts
  describe("listForSession()", () => {
    const LATTE_INPUT: CreateOrderInput = {
      lines: [],
      total: { amountMinor: 320, currency: "EUR" },
    };

    function row(orderId: string, sessionId: string | null, placedAt: string) {
      return {
        ...DB_ORDER,
        orderId,
        sessionId,
        placedAt: new Date(placedAt),
        updatedAt: new Date(placedAt),
      };
    }

    it("excludes orders without a session (seed ord_demo)", () => {
      expect(service.listForSession("sid_a")).toEqual([]);
    });

    it("returns only the caller's orders, newest first", async () => {
      prisma.order.create
        .mockResolvedValueOnce(row("ord_001", "sid_a", "2026-05-14T12:01:00Z"))
        .mockResolvedValueOnce(row("ord_002", "sid_b", "2026-05-14T12:02:00Z"))
        .mockResolvedValueOnce(row("ord_003", "sid_a", "2026-05-14T12:03:00Z"));
      await service.create({ ...LATTE_INPUT, sessionId: "sid_a" });
      await service.create({ ...LATTE_INPUT, sessionId: "sid_b" });
      await service.create({ ...LATTE_INPUT, sessionId: "sid_a" });

      const mine = service.listForSession("sid_a");
      expect(mine.map((o) => o.orderId)).toEqual(["ord_003", "ord_001"]);
      expect(mine[0]).not.toHaveProperty("sessionId");
      expect(mine[0].temperature).toMatch(/^(hot|cold)$/);
    });

    it("persists sessionId on create", async () => {
      prisma.order.create.mockResolvedValueOnce(
        row("ord_001", "sid_a", "2026-05-14T12:01:00Z"),
      );
      await service.create({ ...LATTE_INPUT, sessionId: "sid_a" });
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionId: "sid_a" }),
        }),
      );
    });

    it("warms the session index from the DB on boot", async () => {
      prisma.order.findMany.mockResolvedValue([
        DB_ORDER,
        row("ord_009", "sid_boot", "2026-05-14T12:09:00Z"),
      ]);
      const booted = await makeService(prisma);
      expect(booted.listForSession("sid_boot").map((o) => o.orderId)).toEqual([
        "ord_009",
      ]);
    });

    it("an idempotent replay from another session does not re-own the order", async () => {
      prisma.order.create.mockResolvedValueOnce({
        ...row("ord_001", "sid_a", "2026-05-14T12:01:00Z"),
        clientRequestId: "key-1",
      });
      await service.create({
        ...LATTE_INPUT,
        sessionId: "sid_a",
        clientRequestId: "key-1",
      });
      const replay = await service.create({
        ...LATTE_INPUT,
        sessionId: "sid_b",
        clientRequestId: "key-1",
      });
      expect(replay.orderId).toBe("ord_001");
      expect(service.listForSession("sid_b")).toEqual([]);
      expect(service.listForSession("sid_a").map((o) => o.orderId)).toEqual([
        "ord_001",
      ]);
    });
  });
```

In `orders.controller.spec.ts`: delete `status: "pending",` from `DEMO_ORDER` and from the `status` object in the `GET /orders/:id/status` test.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders`
Expected: FAIL — `listForSession is not a function`, `status` still present, `select` mismatch.

- [ ] **Step 4: Implement**

`orders.types.ts`:

- Change the import to `import type { Money, OrderTemperature } from "@mini-commerce/shared-types";`.
- Delete `readonly status: OrderStatus;` from `Order` and from `OrderStatusResponse`.
- Delete the `ManageOrderResponse` interface.
- Add to `CreateOrderInput`:

```ts
  // Anonymous owner (the caller's `sid`). Stored, never serialized.
  readonly sessionId?: string;
```

`orders.service.ts`:

- Remove imports: `BadRequestException`, `OrderStatus`, `ManageOrderDto`, `ManageOrderResponse`.
- In `toOrder`, delete the `status:` line.
- Add a field next to `idempotencyIndex`:

```ts
  // Session index: orderId → owning session id. Kept beside the cache (not
  // on StoredOrder) so the owner can never leak into a serialized Order.
  private sessionIndex = new Map<string, string>();
```

- In `onModuleInit`, inside the existing `for (const row of rows)` loop add:

```ts
      if (row.sessionId) {
        this.sessionIndex.set(row.orderId, row.sessionId);
      }
```

- Add after `listAll()`:

```ts
  // Newest first. Orders without a session (seed, pre-session history) are
  // never anyone's — they only appear in listAll().
  listForSession(sessionId: string): ReadonlyArray<Order> {
    const now = new Date();
    return this.cache
      .filter((o) => this.sessionIndex.get(o.orderId) === sessionId)
      .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt))
      .map((o) => this.withTemperature(o, now));
  }
```

- In `getStatus`: `select: { orderId: true, placedAt: true },` and delete the `status:` line in the returned object.
- In `create`, in `tx.order.create({ data: { ... } })` replace `status: "pending",` with:

```ts
                sessionId: input.sessionId ?? null,
```

- In the P2002 race branch, after `this.idempotencyIndex.set(input.clientRequestId, replay.orderId);` add:

```ts
              if (winner.sessionId) {
                this.sessionIndex.set(winner.orderId, winner.sessionId);
              }
```

- After the success path's `this.cache.push(order);` add:

```ts
        if (row.sessionId) {
          this.sessionIndex.set(order.orderId, row.sessionId);
        }
```

- Delete the whole `manage(...)` method.

`orders.controller.ts`: delete the `manage` handler, the `ManageOrderDto` import, `ManageOrderResponse` from the type import, and unused `Body`, `HttpCode`, `Post` from `@nestjs/common`.

Delete `apps/bff/src/modules/orders/orders.dto.ts`.

`orders.module.ts` header comment — replace the surface/TODO lines with:

```ts
// Responsibility: the order record after checkout. Placing an order is the
// final step — there is no preparation lifecycle or cancel. Hot/cold
// temperature is derived on read from placedAt.
// Public surface:
//   - GET /orders               — every order (oldest first)
//   - GET /orders/mine          — the caller's orders (session cookie), newest first
//   - GET /orders/:id           — a single order (404 for unknown)
//   - GET /orders/:id/status    — temperature read from Postgres
//                                 (cold after ORDER_COOL_DOWN_SECONDS)
//
// Pre-seeded with `ord_demo` (no session) so the playground has history.
//
// Strong candidate for Phase 3 extraction (owns post-purchase state).
```

(`GET /orders/mine` is added in Task 3; the comment lands now so the module header is written once.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders src/modules/visualization`
Expected: PASS

Run: `grep -rn "status" apps/bff/src/modules/orders/*.ts | grep -v "\.spec\.ts" | grep -vi "getStatus\|orders.status\|/status\|OrderStatusResponse\|HttpStatus\|SpanStatusCode"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/bff/prisma apps/bff/src/modules/orders
git commit -m "feat(orders): store session owner, drop status lifecycle and manage"
```

---

### Task 3: `GET /orders/mine`

**Files:**
- Modify: `apps/bff/src/modules/orders/orders.controller.ts`
- Modify: `apps/bff/src/modules/orders/orders.module.ts` (imports)
- Test: `apps/bff/src/modules/orders/orders.controller.spec.ts`

**Interfaces:**
- Consumes: `OrdersService.listForSession(sessionId)` (Task 2); `SessionService.resolveSessionId(req: Request, res: Response): string` from `apps/bff/src/core/session/session.service.ts`.
- Produces: `OrdersController.mine(req, res): OrdersResponse` mapped to `GET /orders/mine`, declared before `@Get(":id")`.

- [ ] **Step 1: Write the failing tests**

In `orders.controller.spec.ts`, change `makeController` to also build a session stub:

```ts
function makeController(
  overrides: Partial<typeof OrdersService.prototype> = {},
  sessionId = "sid_test",
) {
  const svc = {
    listAll: vi.fn().mockReturnValue([DEMO_ORDER]),
    listForSession: vi.fn().mockReturnValue([]),
    get: vi.fn().mockImplementation((id: string) => {
      if (id === "ord_demo") return DEMO_ORDER;
      throw new NotFoundException(`order ${id} not found`);
    }),
    ...overrides,
  };
  const session = { resolveSessionId: vi.fn().mockReturnValue(sessionId) };
  return {
    controller: new OrdersController(
      svc as unknown as OrdersService,
      session as unknown as SessionService,
    ),
    svc,
    session,
  };
}
```

Add imports:

```ts
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { Request, Response } from "express";
import { SessionService } from "../../core/session/session.service";
```

Add a describe block:

```ts
  describe("GET /orders/mine", () => {
    const req = {} as Request;
    const res = {} as Response;

    it("resolves the session and lists only its orders", () => {
      const { controller, svc, session } = makeController({
        listForSession: vi.fn().mockReturnValue([DEMO_ORDER]),
      });
      const result = controller.mine(req, res);
      expect(session.resolveSessionId).toHaveBeenCalledWith(req, res);
      expect(svc.listForSession).toHaveBeenCalledWith("sid_test");
      expect(result.items.map((o) => o.orderId)).toEqual(["ord_demo"]);
    });

    it("returns an empty envelope for a fresh session", () => {
      const { controller } = makeController({}, "sid_brand_new");
      expect(controller.mine(req, res)).toEqual({ items: [] });
    });

    it("is routed as GET mine and declared before GET :id", () => {
      const proto = OrdersController.prototype;
      const names = Object.getOwnPropertyNames(proto);
      expect(Reflect.getMetadata(PATH_METADATA, proto.mine)).toBe("mine");
      expect(Reflect.getMetadata(METHOD_METADATA, proto.mine)).toBe(
        RequestMethod.GET,
      );
      expect(names.indexOf("mine")).toBeLessThan(names.indexOf("get"));
    });
  });
```

If `Reflect.getMetadata` is not typed in the spec, add `import "reflect-metadata";` at the top.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders/orders.controller.spec.ts`
Expected: FAIL — `controller.mine is not a function`.

- [ ] **Step 3: Implement**

`orders.controller.ts`:

```ts
import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { SessionService } from "../../core/session/session.service";
import { OrdersService } from "./orders.service";
import type {
  Order,
  OrderStatusResponse,
  OrdersResponse,
} from "./orders.types";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly session: SessionService,
  ) {}

  @Get()
  list(): OrdersResponse {
    return { items: this.orders.listAll() };
  }

  // Declared before :id so Nest does not route "mine" as an order id.
  // Mints the `sid` cookie for a fresh browser, which then owns nothing yet.
  @Get("mine")
  mine(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): OrdersResponse {
    const sessionId = this.session.resolveSessionId(req, res);
    return { items: this.orders.listForSession(sessionId) };
  }

  @Get(":id")
  get(@Param("id") id: string): Order {
    return this.orders.get(id);
  }

  // Reads Postgres directly; temperature is derived from placedAt.
  @Get(":id/status")
  status(@Param("id") id: string): Promise<OrderStatusResponse> {
    return this.orders.getStatus(id);
  }
}
```

`orders.module.ts`: add `import { SessionModule } from "../../core/session/session.module";` and change `imports: [DomainEventsModule, CatalogModule],` to `imports: [DomainEventsModule, CatalogModule, SessionModule],`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff test`
Expected: PASS (checkout spec still passes; it does not touch `status` behavior yet).

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/orders
git commit -m "feat(orders): add GET /orders/mine for the caller's session"
```

---

### Task 4: Checkout records the session and drops status

**Files:**
- Modify: `apps/bff/src/modules/checkout/checkout.service.ts`
- Modify: `apps/bff/src/modules/checkout/checkout.types.ts`
- Test: `apps/bff/src/modules/checkout/checkout.service.spec.ts`

**Interfaces:**
- Consumes: `CreateOrderInput.sessionId` (Task 2).
- Produces: `CheckoutResponse { orderId; cartId; customerName; total; placedAt }` (no `status`).

- [ ] **Step 1: Write the failing tests**

In `checkout.service.spec.ts`:

- Delete `status: "pending",` from the `ORDER` fixture.
- In "calls orders.create with lines derived from cart items and no customer name", add `sessionId: SESSION_ID,` to the expected object after `total`.
- In the "replays an existing order on a known key ..." test, add:

```ts
      expect(response).not.toHaveProperty("status");
```

- Add:

```ts
    it("response carries no status field", async () => {
      const response = await service.checkout(SESSION_ID, PAYLOAD);
      expect(response).not.toHaveProperty("status");
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/checkout`
Expected: FAIL — `sessionId` missing from create call; `status` present.

- [ ] **Step 3: Implement**

`checkout.types.ts`:

```ts
import type { Money } from "@mini-commerce/shared-types";

export interface CheckoutResponse {
  readonly orderId: string;
  readonly cartId: string;
  readonly customerName: string | null;
  readonly total: Money;
  readonly placedAt: string;
}
```

`checkout.service.ts`:

- In the `this.orders.create({...})` call add `sessionId,` after `total,`.
- In `toResponse`, delete `status: "pending",`.
- Replace the comment above `toResponse` with:

```ts
  // Replay returns the original creation receipt. `cartId` isn't persisted
  // on the order (checkout is the only place it's meaningful), so it's just
  // echoed back from whichever request produced this response.
```

- [ ] **Step 4: Run tests and BFF typecheck**

Run: `pnpm --filter @mini-commerce/bff test && pnpm --filter @mini-commerce/bff typecheck`
Expected: PASS, no tsc errors.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/checkout
git commit -m "feat(checkout): own orders by session, drop status from receipt"
```

---

### Task 5: Shared contracts drop status and manage

**Files:**
- Modify: `packages/shared-types/src/index.ts:14-22`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `@mini-commerce/contracts` exports `Money`, `OrderTemperature`, `Order` (no `status`), `OrdersResponse`, `OrderStatusResponse` (no `status`), `CheckoutResponse` (no `status`). `OrderStatus`, `OrderManageAction`, `ManageOrderRequest`, `ManageOrderResponse` no longer exist.

- [ ] **Step 1: Edit shared-types**

Delete the `OrderStatus` type and its comment, and the `OrderManageAction` type and its comment. Keep `OrderTemperature`.

- [ ] **Step 2: Edit contracts**

- Header comment: `// Cross-cutting domain primitives (Money, OrderTemperature, branded IDs)`.
- Import/re-export:

```ts
import type { Money, OrderTemperature } from "@mini-commerce/shared-types";

export type { Money, OrderTemperature };
```

- `Order`: delete `readonly status: OrderStatus;`.
- Delete `ManageOrderRequest` and `ManageOrderResponse`.
- `OrderStatusResponse`: delete `readonly status: OrderStatus;`.
- `CheckoutResponse`: delete `readonly status: Extract<OrderStatus, "pending">;`.

- [ ] **Step 3: Verify the packages build; web is expected to fail until Task 6**

Run: `pnpm --filter @mini-commerce/shared-types --filter @mini-commerce/contracts --filter @mini-commerce/bff typecheck`
Expected: PASS.

- [ ] **Step 4: Commit together with Task 6** (web does not compile against these contracts until Task 6 lands; do not commit this task alone).

---

### Task 6: Web API client, demo mocks, and Dev section

**Files:**
- Modify: `apps/web/src/lib/api/expresso-api.ts`
- Modify: `apps/web/src/lib/api/mock-data.ts`
- Modify: `apps/web/src/components/sections/DevSection.tsx`

**Interfaces:**
- Consumes: contracts from Task 5.
- Produces: `expressoApi.getMyOrders(): Promise<OrdersResponse>` (`GET /orders/mine`); `getAllMockOrders()` returns newest-first; `getMyMockOrders(): { items: Order[] }` returns only orders created through `createMockOrder()` in this page session. `expressoApi.manageOrder`, `ManageOrderInput`, `OrderStatus`, `ManageOrderResponse` exports and `updateMockOrderStatus` no longer exist.

- [ ] **Step 1: `expresso-api.ts`**

- Remove `OrderStatus`, `ManageOrderRequest`, `ManageOrderResponse` from the contracts import and from the `export type { ... }` list; delete `export type ManageOrderInput = ManageOrderRequest;`.
- Remove `updateMockOrderStatus` from the `./mock-data` import; add `getMyMockOrders`.
- `mockApi`: delete `manageOrder`; in `getOrderStatus` delete `status: order.status,`; add after `getOrders`:

```ts
  async getMyOrders(): Promise<OrdersResponse> {
    await simulateLatency();
    return getMyMockOrders();
  },
```

- `realApi`: delete `manageOrder`; add after `getOrders`:

```ts
  // Session-scoped: the BFF resolves the caller from the `sid` cookie,
  // which same-origin fetch through the /api/bff proxy sends by default.
  getMyOrders(): Promise<OrdersResponse> {
    return request<OrdersResponse>("GET", "/orders/mine");
  },
```

- Public `expressoApi`: delete `manageOrder`; add after `getOrders`:

```ts
  getMyOrders(): Promise<OrdersResponse> {
    return isDemoMode() ? mockApi.getMyOrders() : realApi.getMyOrders();
  },
```

- [ ] **Step 2: `mock-data.ts`**

- `sampleOrder`: delete `status: "preparing",`.
- Add next to `mockOrders`:

```ts
// Orders placed through createMockOrder() in this page session — the demo
// stand-in for the BFF's per-`sid` ownership. The sample order is nobody's.
const myMockOrderIds = new Set<string>();
```

- `createMockOrder`: delete both `status: "pending",` lines; after `mockOrders.set(orderId, order);` add `myMockOrderIds.add(orderId);`.
- Replace `getAllMockOrders` and delete `updateMockOrderStatus`:

```ts
function newestFirst(a: StoredMockOrder, b: StoredMockOrder): number {
  return Date.parse(b.placedAt) - Date.parse(a.placedAt);
}

export function getAllMockOrders(): { items: Order[] } {
  if (shouldSimulateEmpty()) {
    return { items: [] };
  }
  return {
    items: Array.from(mockOrders.values()).sort(newestFirst).map(withTemperature),
  };
}

export function getMyMockOrders(): { items: Order[] } {
  if (shouldSimulateEmpty()) {
    return { items: [] };
  }
  return {
    items: Array.from(mockOrders.values())
      .filter((o) => myMockOrderIds.has(o.orderId))
      .sort(newestFirst)
      .map(withTemperature),
  };
}
```

- [ ] **Step 3: `DevSection.tsx`**

- In the wired-endpoints list replace the `"Order management"` entry with:

```ts
    { label: "My orders", status: "wired", note: "GET /orders/mine" },
```

- Delete the whole `OrderManageCard` component and its `<OrderManageCard />` usage.
- Add a card after `OrderLookupCard` and render `<MyOrdersCard />` where `<OrderManageCard />` was:

```tsx
function MyOrdersCard() {
  const { result, loading, call } = useApiCall();
  return (
    <Card title="Orders - Mine">
      <ActionButton
        onClick={() => call(() => expressoApi.getMyOrders())}
        loading={loading}
      >
        GET /orders/mine
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}
```

- [ ] **Step 4: Typecheck web (OrdersSection still fails until Task 7)**

Run: `pnpm --filter @mini-commerce/web typecheck 2>&1 | grep -v OrdersSection | grep "error TS"`
Expected: no output (only `OrdersSection.tsx` errors remain).

- [ ] **Step 5: Continue to Task 7 before committing** (Tasks 5–7 form one commit so every commit typechecks).

---

### Task 7: Orders section — My/All toggle, cool-down revalidation, no actions

**Files:**
- Modify: `apps/web/src/components/sections/OrdersSection.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `expressoApi.getMyOrders()`, `expressoApi.getOrders()`, `expressoApi.getOrderById()`, `expressoApi.getOrderStatus()`; `Order.temperature`, `Order.coolsAt`.
- Produces: `OrdersSection({ selectedOrderId, placedOrderId, onSelect, onBack })`. DOM hooks used by e2e: tab buttons with role `tab` and names `My orders` / `All orders` inside a `tablist` named `Order scope`; list container `data-testid="orders-list"` with `data-scope="mine" | "all"`; existing `data-testid="order-temperature"` badges; success banner text "Order placed successfully!".

- [ ] **Step 1: Rewrite the list half of `OrdersSection.tsx`**

Delete: `statusConfig`, `OrderStatusBadge`, `OrdersListProps`, `OrdersList`, `OrdersListView` (including the lookup form), and `OrderManagePanel`. Then remove imports that became unused: `Search`, `ArrowRight` only if unused by `OrderRow` (it is used — keep it), `Clock`, `XCircle`, `ChefHat`, `RefreshCw`, `Loader2`, `OrderStatus`, `ManageOrderInput`, `ExpressoApiError`. Keep `CheckCircle` (success banner). `pnpm lint` in Step 4 flags anything missed.

Keep `temperatureConfig`, `OrderTemperatureBadge`, `OrderRow` (delete its `<OrderStatusBadge .../>` line).

Add:

```tsx
type OrdersScope = "mine" | "all";

const scopeConfig: Record<
  OrdersScope,
  {
    label: string;
    swrKey: string;
    fetch: () => Promise<OrdersResponse>;
    emptyTitle: string;
    emptyHint: string;
  }
> = {
  mine: {
    label: "My orders",
    swrKey: "orders-mine",
    fetch: () => expressoApi.getMyOrders(),
    emptyTitle: "You have not placed any orders yet",
    emptyHint: "Place an order from the catalog to see it here",
  },
  all: {
    label: "All orders",
    swrKey: "orders",
    fetch: () => expressoApi.getOrders(),
    emptyTitle: "No orders yet",
    emptyHint: "Orders will appear here after checkout",
  },
};

// Never refetch sooner than this: if the browser clock runs ahead of the
// server, the server may still say "hot" at our coolsAt — a floor keeps
// that from turning into a tight refetch loop.
const MIN_COOL_REFRESH_MS = 1000;

// One timer at the soonest hot order's coolsAt flips list badges to Cold
// without polling (same pattern as the detail view).
function useRevalidateAtCoolDown(
  orders: ReadonlyArray<Order> | undefined,
  revalidate: () => void,
) {
  useEffect(() => {
    const hotCoolsAt = (orders ?? [])
      .filter((o) => o.temperature === "hot")
      .map((o) => Date.parse(o.coolsAt));
    if (hotCoolsAt.length === 0) return;
    const delay = Math.max(
      MIN_COOL_REFRESH_MS,
      Math.min(...hotCoolsAt) - Date.now() + 250,
    );
    const timer = setTimeout(revalidate, delay);
    return () => clearTimeout(timer);
  }, [orders, revalidate]);
}

function OrdersList({
  scope,
  onSelect,
}: {
  scope: OrdersScope;
  onSelect: (orderId: string) => void;
}) {
  const cfg = scopeConfig[scope];
  const { data, error, isLoading, mutate } = useSWR<OrdersResponse, Error>(
    cfg.swrKey,
    cfg.fetch,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const revalidate = useCallback(() => void mutate(), [mutate]);
  useRevalidateAtCoolDown(data?.items, revalidate);

  if (isLoading) return <PageLoadingState message="Loading orders..." />;

  if (error) {
    return (
      <div
        className="flex items-start gap-3 p-4 rounded-lg"
        style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
        role="alert"
      >
        <AlertTriangle
          className="h-4 w-4 mt-0.5 shrink-0"
          style={{ color: "var(--destructive)" }}
        />
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--destructive)" }}
          >
            Could not load orders
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  const orders = data?.items ?? [];

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: "var(--secondary)" }}
        >
          <Package
            className="h-6 w-6"
            style={{ color: "var(--muted-foreground)" }}
          />
        </div>
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--foreground)" }}
        >
          {cfg.emptyTitle}
        </p>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {cfg.emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div>
      {orders.map((order) => (
        <OrderRow key={order.orderId} order={order} onSelect={onSelect} />
      ))}
    </div>
  );
}

function OrdersListView({ onSelect }: { onSelect: (orderId: string) => void }) {
  // Remounts (section switch, Back) reset to "My orders" — the default view.
  const [scope, setScope] = useState<OrdersScope>("mine");

  return (
    <div className="home-stage-section-inner max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            Orders
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Database className="h-3 w-3" style={{ color: "var(--success)" }} />
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Persisted to PostgreSQL
            </p>
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          role="tablist"
          aria-label="Order scope"
          className="px-2 py-2 border-b flex items-center gap-1"
          style={{ borderColor: "var(--border)" }}
        >
          {(Object.keys(scopeConfig) as OrdersScope[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              onClick={() => setScope(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                scope === key ? "tone-primary" : "tone-muted"
              }`}
            >
              {scopeConfig[key].label}
            </button>
          ))}
        </div>
        <div data-testid="orders-list" data-scope={scope} role="tabpanel">
          <OrdersList key={scope} scope={scope} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}
```

Update the React import to `import { useCallback, useEffect, useState } from "react";`.

- [ ] **Step 2: Simplify the detail view**

In `OrderDetailView`:

- Signature: `({ orderId, justPlaced, onBack }: { orderId: string; justPlaced: boolean; onBack: () => void })`.
- Delete `const status = statusConfig[order.status]!;` and `const StatusIcon = status.icon;`.
- Change the banner condition `{order.status === "pending" && (` to `{justPlaced && (` and its body text "Your order has been received and is being processed." to "Your coffee is on its way — enjoy it while it is hot.".
- In the header, keep only the temperature badge (delete the status pill `div` next to it):

```tsx
        <OrderTemperatureBadge
          temperature={orderStatus?.temperature ?? order.temperature}
        />
```

- Delete `{order.status !== "cancelled" && (<OrderManagePanel ... />)}`.

Replace the exported component:

```tsx
export function OrdersSection({
  selectedOrderId,
  placedOrderId,
  onSelect,
  onBack,
}: {
  selectedOrderId: string | null;
  // The order this browser just placed; its detail shows the success banner.
  placedOrderId: string | null;
  onSelect: (orderId: string) => void;
  onBack: () => void;
}) {
  if (selectedOrderId) {
    return (
      <OrderDetailView
        orderId={selectedOrderId}
        justPlaced={selectedOrderId === placedOrderId}
        onBack={onBack}
      />
    );
  }
  return <OrdersListView onSelect={onSelect} />;
}
```

Update the file header comment to:

```tsx
/**
 * OrdersSection - My orders / All orders lists and a read-only order detail
 *
 * Placing an order is the final step; there are no order actions. Hot/Cold
 * is the only state an order shows, and both the lists and the detail flip
 * it at coolsAt without polling. The parent (page.tsx) owns the selected
 * order id so it survives this component remounting on section switches.
 */
```

- [ ] **Step 3: `page.tsx`**

Add state next to `justPlacedOrderId`:

```tsx
  // Kept (unlike justPlacedOrderId) so the detail can show the success
  // banner for the order this browser just placed.
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
```

In `handleOrderPlaced` add `setPlacedOrderId(orderId);`, and pass `placedOrderId={placedOrderId}` to `<OrdersSection ... />`.

- [ ] **Step 4: Typecheck, lint, format**

Run: `pnpm typecheck && pnpm lint && pnpm format`
Expected: all PASS. (If `pnpm format` is check-only, run `pnpm exec prettier --write` on the touched files and re-run.)

Run: `grep -rn "manageOrder\|OrderStatus\b\|mark_prepared\|Start Preparing\|Mark as Prepared" apps/web/src apps/web/app packages`
Expected: no output.

- [ ] **Step 5: Commit Tasks 5–7**

```bash
git add packages/shared-types packages/contracts apps/web
git commit -m "feat(web): my/all orders lists, hot/cold only, no order actions"
```

---

### Task 8: e2e fixture and specs

**Files:**
- Modify: `tests/e2e/fixtures/commerce-api.ts`
- Modify: `tests/e2e/pages/StorefrontPage.ts`
- Modify: `tests/e2e/tests/checkout-happy-path.spec.ts:61-89`
- Modify: `tests/e2e/tests/frontend-certification.spec.ts:98-104`
- Modify: `tests/e2e/tests/visual-integrity.spec.ts:170-199`
- Modify: `tests/e2e/tests/order-temperature.spec.ts`
- Modify: `tests/e2e/tests/visualizer-interaction.spec.ts:98,181,468`

**Interfaces:**
- Consumes: DOM hooks from Task 7 (`tablist` "Order scope", tabs "My orders"/"All orders", `data-testid="orders-list"`).
- Produces: fixture route `GET /orders/mine` returning orders created via the mock `POST /checkout` (seed orders are nobody's), newest first.

- [ ] **Step 1: Fixture**

In `commerce-api.ts`:

- Delete `export type OrderStatus = ...` and `status: OrderStatus;` in `Order`.
- `makeOrder`: delete `status: "pending",`.
- After the `orders` map declaration add:

```ts
  // Orders placed through the mocked checkout belong to "this browser";
  // seed orders belong to nobody, mirroring the BFF's null-session rows.
  const myOrderIds = new Set<string>();
  const newestFirst = (a: Order, b: Order) =>
    Date.parse(b.placedAt) - Date.parse(a.placedAt);
```

- In `POST /checkout`: delete `status: "pending",` from the order and `status: order.status,` from the response; after `orders.set(order.orderId, order);` add `myOrderIds.add(order.orderId);`.
- Replace the `GET /orders` handler and add `/orders/mine` **before** the `orderMatch` handler:

```ts
    if (method === "GET" && path === "/orders") {
      return fulfillJson(route, 200, {
        items: Array.from(orders.values()).sort(newestFirst).map(withTemperature),
      });
    }

    if (method === "GET" && path === "/orders/mine") {
      return fulfillJson(route, 200, {
        items: Array.from(orders.values())
          .filter((o) => myOrderIds.has(o.orderId))
          .sort(newestFirst)
          .map(withTemperature),
      });
    }
```

- In the `/status` handler delete `status: order.status,`.
- Delete the whole `manageMatch` block.

- [ ] **Step 2: Page object**

In `StorefrontPage.ts` delete `orderStatus`, `startPreparingButton`, `markPreparedButton`, `startPreparingOrder`, and add:

```ts
  orderTemperature(): Locator {
    return this.page.getByTestId("order-temperature");
  }

  ordersScopeTab(name: "My orders" | "All orders"): Locator {
    return this.page
      .getByRole("tablist", { name: "Order scope" })
      .getByRole("tab", { name });
  }

  ordersList(): Locator {
    return this.page.getByTestId("orders-list");
  }

  backToOrdersButton(): Locator {
    return this.page.getByRole("button", { name: /Back to orders/i });
  }
```

- [ ] **Step 3: Update flows that used the manage buttons**

`checkout-happy-path.spec.ts` — rename the test to `"completes catalog to cart to place order to my orders @smoke"`. Replace `await expect(storefront.orderStatus("Pending")).toBeVisible();` with:

```ts
      await expect(storefront.orderTemperature()).toHaveAttribute(
        "data-temperature",
        "hot",
      );
```

Replace the last four lines (start preparing … mark prepared) with:

```ts
      await storefront.backToOrdersButton().click();
      await expect(storefront.ordersScopeTab("My orders")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(storefront.ordersList()).toContainText(orderId);
      await expect(
        page
          .getByRole("button", { name: new RegExp(orderId) })
          .getByTestId("order-temperature"),
      ).toHaveText("Hot");
```

`frontend-certification.spec.ts` — rename the test to `"certifies catalog, cart CRUD, checkout, and my orders"` and replace the four Start Preparing / Mark as Prepared lines with:

```ts
  await expect(page.getByTestId("order-temperature")).toHaveText("Hot");
  await expect(
    page.getByRole("button", { name: "Start Preparing" }),
  ).toHaveCount(0);
```

`visual-integrity.spec.ts` — rename to `"places an order and shows it hot through visual controls"`; replace from `await expect(page.getByText("Pending", { exact: true })).toBeVisible();` to the end of the test with:

```ts
    const badge = page.getByTestId("order-temperature");
    await expect(badge).toHaveText("Hot");

    const back = page.getByRole("button", { name: /Back to orders/i });
    await back.scrollIntoViewIfNeeded();
    await expectVisualActionable(back, { minHeight: 20, minWidth: 80 });
    await clickVisualCenter(back);

    const mine = page
      .getByRole("tablist", { name: "Order scope" })
      .getByRole("tab", { name: "My orders" });
    await expectVisualActionable(mine, { minHeight: 28, minWidth: 80 });
    await expect(page.getByTestId("orders-list")).toHaveAttribute(
      "data-scope",
      "mine",
    );
```

`visualizer-interaction.spec.ts`:
- line 98: `temperatureCounts: { hot: orders.length, cold: 0 },`
- line ~181 (`makeOrder`): replace `status: "pending",` with `temperature: "hot",` and add `coolsAt: timestamp,`.
- line 468: replace `status: 'prepared'` with `temperature: 'cold'`.

- [ ] **Step 4: Order-temperature + My/All tests**

In `order-temperature.spec.ts`, make `openOrders` select All orders (seed orders are nobody's):

```ts
async function openOrders(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Orders" })
    .click();
  await expect(page.getByTestId("home-orders")).toBeVisible();
  await page
    .getByRole("tablist", { name: "Order scope" })
    .getByRole("tab", { name: "All orders" })
    .click();
  await expect(page.getByTestId("orders-list")).toHaveAttribute(
    "data-scope",
    "all",
  );
}
```

Add inside the describe:

```ts
  test("the list flips a row from Hot to Cold at coolsAt without a reload", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      coolDownMs: 3_000,
      seedOrders: [makeOrder("ord_listflip_001", new Date().toISOString())],
    });
    await openOrders(page);
    const badge = orderRow(page, "ord_listflip_001").getByTestId(
      "order-temperature",
    );
    await expect(badge).toHaveText("Hot");
    await expect(badge).toHaveText("Cold", { timeout: 8_000 });
  });

  test("My orders defaults on and excludes orders this browser did not place", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      seedOrders: [makeOrder("ord_someone_else", new Date().toISOString())],
    });
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: "Orders" })
      .click();
    const list = page.getByTestId("orders-list");
    await expect(list).toHaveAttribute("data-scope", "mine");
    await expect(list).toContainText("You have not placed any orders yet");
    await expect(list).not.toContainText("ord_someone_else");
  });
```

- [ ] **Step 5: Run e2e**

Run: `pnpm --filter @mini-commerce/e2e exec playwright test tests/order-temperature.spec.ts tests/checkout-happy-path.spec.ts tests/frontend-certification.spec.ts tests/visual-integrity.spec.ts tests/visualizer-interaction.spec.ts`
Expected: PASS (Playwright starts `next dev` itself).

Run: `grep -rn "Preparing\|mark_prepared\|/manage\|statusCounts\|OrderStatus" tests/e2e/tests tests/e2e/fixtures tests/e2e/pages`
Expected: no output except the `toHaveCount(0)` negative assertion in `frontend-certification.spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): cover my/all orders and drop order management flows"
```

---

### Task 9: Smoke and k6

**Files:**
- Modify: `scripts/pg/smoke.py:123-155`
- Modify: `tests/performance/k6/scenarios/load/load.js`
- Modify: `tests/performance/k6/scenarios/stress/stress.js`
- Modify: `tests/performance/k6/scenarios/smoke/smoke.ts`
- Modify: `tests/performance/k6/scenarios/order-status/order-status.ts:66-74`

**Interfaces:**
- Consumes: `GET /orders/mine`, `GET /orders/:id/status` without `status`, `scene.orderAggregates.temperatureCounts`.
- Produces: smoke stays at 16 checks (manage check replaced by a `/orders/mine` check).

- [ ] **Step 1: `smoke.py`**

Capture the checkout order id. Replace the `POST /checkout` check with:

```python
    placed: dict = {}

    def checkout() -> None:
        _, payload = request_json(
            f"{API_BASE}/checkout", method="POST", body={"cartId": cart_id},
            expect_status=201, cookie_jar=jar,
        )
        if not isinstance(payload, dict) or "status" in payload:
            raise HttpError("checkout receipt must be an object without status")
        placed["orderId"] = payload.get("orderId")
    results.append(_check("POST /checkout", checkout))
```

In `order_status`, change the key tuple to `("orderId", "temperature", "placedAt", "coolsAt", "checkedAt")` and add after the loop:

```python
        if "status" in payload:
            raise HttpError("order status payload must not carry status")
```

Replace the `POST /orders/ord_demo/manage (mark_prepared)` check with:

```python
    def my_orders() -> None:
        _, payload = request_json(f"{API_BASE}/orders/mine", expect_status=200, cookie_jar=jar)
        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise HttpError("Expected items array")
        ids = [o.get("orderId") for o in items if isinstance(o, dict)]
        if placed.get("orderId") not in ids:
            raise HttpError(f"placed order {placed.get('orderId')!r} missing from /orders/mine")
        if "ord_demo" in ids:
            raise HttpError("seed order ord_demo must not belong to a session")
    results.append(_check("GET  /orders/mine (session-owned)", my_orders))
```

In `viz_scene`, change `"statusCounts" not in aggregates` to `"temperatureCounts" not in aggregates`.

Run: `python3 -m py_compile scripts/pg/smoke.py && pnpm pg:test`
Expected: compile OK; unittest suite PASS.

- [ ] **Step 2: k6 scenarios**

In `load.js`, `stress.js`, `smoke.ts`: delete the `//   POST /orders/:id/manage` header line and the whole `group("orders: manage", ...)` block. If `JSON_HEADERS` becomes unused in a file, check with `grep -n JSON_HEADERS <file>`; keep it if the cart/checkout groups still use it, otherwise delete its declaration.

In `order-status.ts`, delete `status: string;` from `OrderStatusBody`.

Run: `grep -rn "manage\|mark_prepared" tests/performance/k6/scenarios tests/performance/k6/config`
Expected: no output.

Run: `pnpm --filter @mini-commerce/k6-scenarios typecheck && pnpm --filter @mini-commerce/k6-scenarios build`
Expected: no errors.

- [ ] **Step 3: Live smoke**

Run: `./dev up && ./dev smoke`
Expected: `All 16 smoke checks passed.` (the BFF container applies the new migration on start).

- [ ] **Step 4: Commit**

```bash
git add scripts/pg/smoke.py tests/performance/k6
git commit -m "test(smoke,k6): check /orders/mine, drop order manage traffic"
```

---

### Task 10: Docs

**Files:**
- Create: `docs/next-steps/simplify-orders.md`
- Modify: `docs/next-steps/README.md`
- Modify: `docs/adr/0002-mini-commerce-domain.md` (append addendum)
- Modify: living docs matched by the grep in Step 1 (expected: `docs/project-state/current-system.md`, `docs/architecture/bff-modules.md`, `docs/architecture/observability.md`, `docs/uat/web-app-uat.md`, `docs/uat/walkthrough-uat.md`, `docs/local-development.md`, `docs/cli-reference.md`, `docs/quality-strategy/README.md`, `apps/bff/README.md`, `apps/visualizer-3d/README.md`, `tests/e2e/README.md`, `tests/e2e/TEST_PLAN.md`, `README.md`, `apps/web/src/types/README.md`)

- [ ] **Step 1: Find stale references**

Run:

```bash
grep -rln "orders/:id/manage\|/manage\b\|mark_prepared\|Start Preparing\|Mark as Prepared\|statusCounts\|preparing\|order management" \
  README.md apps/*/README.md apps/web/src/types/README.md tests/e2e/*.md tests/performance/k6/README.md docs \
  | grep -v "docs/superpowers/\|docs/specs/\|docs/adr/"
```

- [ ] **Step 2: Update each living doc**

For each file: remove `POST /orders/:id/manage` from endpoint tables, add `GET /orders/mine — the caller's orders (session cookie), newest first`; replace the order lifecycle (`pending → preparing → prepared / cancelled`) with "Placing an order is final; an order is Hot until `ORDER_COOL_DOWN_SECONDS` after `placedAt`, then Cold"; replace `statusCounts` with `temperatureCounts { hot, cold }`; UAT steps that click Start Preparing / Mark as Prepared become "open My orders, confirm the new order shows Hot; switch to All orders, confirm `ord_demo` is listed and the new order too".

- [ ] **Step 3: ADR-0002 addendum**

Append:

```markdown
## Addendum (2026-10-05): order lifecycle removed

Placing an order is now the final step. The `pending → preparing →
prepared / cancelled` lifecycle, `POST /orders/:id/manage`, and the
`status` column are removed. Orders carry a nullable `sessionId` (the
anonymous `sid` cookie) so `GET /orders/mine` lists the caller's orders;
`GET /orders` lists everyone's. Hot/cold temperature, derived from
`placedAt`, is the only order state shown. See
`docs/next-steps/simplify-orders.md`.
```

- [ ] **Step 4: Next-steps record**

Create `docs/next-steps/simplify-orders.md`:

```markdown
# Simplify orders (place-and-done, my/all lists)

Status: shipped 2026-10-05.
Spec: `docs/superpowers/specs/2026-10-05-simplify-orders-design.md`
Plan: `docs/superpowers/plans/2026-10-05-simplify-orders.md`

## What changed

- Placing an order is final. No prepare, no cancel, no `status`.
- `Order.sessionId` (nullable, never serialized) records the anonymous
  `sid` owner. Seed and older orders have none.
- `GET /orders/mine` lists the caller's orders newest first;
  `GET /orders` lists all.
- Web Orders section: My orders (default) / All orders toggle; Hot/Cold
  badges flip at `coolsAt` without polling; order detail is read-only.
- Visualizer: order tint from temperature (hot → ok, cold → idle);
  `orderAggregates.temperatureCounts` replaces `statusCounts`.

## Open follow-ups

- Attach pre-session orders to a session (not planned).
- Pagination for `GET /orders` once history grows.
```

Add a one-line entry for it in `docs/next-steps/README.md` next to the order-temperature entry, following that file's existing format.

- [ ] **Step 5: Verify and commit**

Run the Step 1 grep again.
Expected: no output.

```bash
git add README.md apps/bff/README.md apps/visualizer-3d/README.md apps/web/src/types/README.md tests/e2e/*.md docs
git commit -m "docs: place-and-done orders, my/all lists, temperature aggregates"
```

---

### Task 11: Full verification

- [ ] **Step 1:** Run `pnpm build && pnpm test && pnpm typecheck && pnpm lint && pnpm format && pnpm pg:test`. Expected: all PASS.
- [ ] **Step 2:** Run `./dev up web && ./dev smoke`. Expected: `All 16 smoke checks passed.`
- [ ] **Step 3:** Manual check in the browser: place an order → detail shows "Order placed successfully!" and Hot → Back → My orders lists it → All orders lists it plus `ord_demo` (Cold).
- [ ] **Step 4:** Run `pnpm --filter @mini-commerce/e2e exec playwright test`. Expected: PASS.
