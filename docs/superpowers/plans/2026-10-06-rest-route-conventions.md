# REST Route Conventions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename BFF routes to plain REST names and move every caller to them in one branch, with no behaviour change.

**Architecture:** Each BFF controller gets only new decorator paths (plus one `owner` query branch and one new `MeController`). A metadata-driven route-map test then pins the whole route table. Callers (contracts comments, web client, visualizer transport, e2e mocks, `./dev smoke`, k6 scenarios, live docs) move route strings in separate tasks. A final grep gate proves no old route survives.

**Tech Stack:** NestJS 10 + Vitest (BFF), Next.js + Vitest (web), static ESM (visualizer), Playwright (e2e), Python stdlib (`scripts/pg`), k6 + esbuild (perf).

**Spec:** [`docs/superpowers/specs/2026-10-06-rest-route-conventions-design.md`](../specs/2026-10-06-rest-route-conventions-design.md)

## Global Constraints

- Route map is exactly the spec's table; old routes are removed with no aliases or redirects.
- Same request bodies, status codes, cookies, and SSE frames as today.
- `GET /orders`: no `owner` → all orders; `owner=session` → session orders (mints `sid`); any other value → `400`.
- Auth action routes (`/auth/register|login|logout`) and `POST /assets/refresh` stay as they are.
- BFF module ownership is unchanged; type names (`AccountOrdersResponse`, `MeResponse`, `CheckoutResponse`) are unchanged.
- Dated records stay as written: everything under `docs/superpowers/` and `docs/adr/`.
- k6 workflow and scenario _names_ do not change (that is spec B); only route strings inside them change.
- Committed content in English; no real names, URLs, IPs, or credentials.
- No AI attribution in commits (no `Co-Authored-By`, no "Generated with").

## Review Focus

1. `GET /orders?owner=session` through the e2e mock: the fixture matches on `pathname`, which drops the query string, so session-scope lists silently return _all_ orders unless the mock reads `searchParams`. Pinned in Task 9 (a fixture branch on `owner`, covered by the existing `data-scope="mine"` specs).
2. Negative assertions written against old URLs pass vacuously after the rename. For example, `hot-status.spec.ts` asserts "no request contains `/account/hot-status`". Task 9 moves those strings to the new routes.
3. Repeated or empty `owner` (`?owner=`, `?owner=session&owner=session`, which Express parses as an array) must be `400`, not "all orders". Pinned in Task 3's unit tests.
4. `GET /orders` without `owner` must not mint a `sid` cookie, as today. Pinned in Task 3 (`resolveSessionId` not called).
5. `POST /orders` and `GET /orders` share a path in the visualizer e2e mock, whose `/checkout` branch never checked the method. The new branch must check `POST`, or the order list breaks. Pinned in Task 9.

---

## File map

| File                                                                                                                                                                        | Change                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `apps/bff/src/modules/catalog/catalog.controller.ts` (+ new `.spec.ts`, `catalog.module.ts`)                                                                                | `/products`                               |
| `apps/bff/src/modules/checkout/checkout.controller.ts` (+ spec, module)                                                                                                     | `POST /orders`                            |
| `apps/bff/src/modules/orders/orders.controller.ts` (+ spec, module)                                                                                                         | `owner` query, drop `mine`                |
| `apps/bff/src/modules/auth/me.controller.ts` (new, + spec), `auth.controller.ts` (+ spec), `auth.module.ts`                                                                 | `GET /me`                                 |
| `apps/bff/src/modules/orders/account.controller.ts` (+ spec), `apps/bff/prisma/schema.prisma` comment                                                                       | `/me/orders`, `/me/hot-status`            |
| `apps/bff/src/modules/visualization/visualization.controller.ts` (+ new spec, module)                                                                                       | `/visualization`, `/visualization/events` |
| `apps/bff/src/routes.spec.ts` (new)                                                                                                                                         | route-map guard                           |
| `apps/bff/README.md`, `apps/bff/src/core/session/session.service.ts` comment                                                                                                | docs                                      |
| `packages/contracts/src/index.ts`                                                                                                                                           | comments                                  |
| `apps/web/src/lib/api/expresso-api.ts` (+ new `expresso-api.test.ts`), `DevSection.tsx`, `HotCoffeeBanner.tsx`, `AuthProvider.tsx`, `app/page.tsx` comment                  | web client                                |
| `apps/visualizer-3d/public/transport.js`, `index.html`, `README.md`                                                                                                         | visualizer                                |
| `tests/e2e/fixtures/commerce-api.ts`, `tests/e2e/tests/{visualizer-interaction,hot-status}.spec.ts`, `tests/e2e/TEST_PLAN.md`                                               | e2e                                       |
| `scripts/pg/smoke.py`, `scripts/pg/http.py` comment                                                                                                                         | `./dev smoke`                             |
| `tests/performance/k6/scenarios/**`, `scripts/pg/tests/test_k6_checkout_contract.py`, `tests/performance/k6/README.md`, `Taskfile.yml`, `infra/docker/compose.yaml` comment | k6                                        |
| Live docs (Task 12 list), `CLAUDE.md`, `README.md`                                                                                                                          | docs                                      |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/rest-route-conventions
```

---

### Task 1: Catalog → `/products`

**Files:**

- Modify: `apps/bff/src/modules/catalog/catalog.controller.ts`
- Modify: `apps/bff/src/modules/catalog/catalog.module.ts:5-6`
- Create: `apps/bff/src/modules/catalog/catalog.controller.spec.ts`

**Interfaces:**

- Produces: `CatalogController` mounted at `products`, handlers `list` (`GET /products`), `get` (`GET /products/:id`).

- [ ] **Step 1: Write the failing test**

`apps/bff/src/modules/catalog/catalog.controller.spec.ts`:

```ts
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { CatalogController } from "./catalog.controller";

describe("CatalogController routes", () => {
  it("is mounted at /products", () => {
    expect(Reflect.getMetadata(PATH_METADATA, CatalogController)).toBe(
      "products",
    );
  });

  it.each([
    ["list", "/", RequestMethod.GET],
    ["get", ":id", RequestMethod.GET],
  ] as const)("%s → %s", (name, path, method) => {
    const fn = CatalogController.prototype[name];
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(method);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/catalog/catalog.controller.spec.ts`
Expected: FAIL. The output shows `expected 'catalog' to be 'products'` and `expected 'products' to be '/'`.

- [ ] **Step 3: Implement**

`catalog.controller.ts`:

```ts
@Controller("products")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(): ProductsResponse {
    return this.catalog.list();
  }

  @Get(":id")
  get(@Param("id") id: string): Product {
    return this.catalog.getById(id);
  }
}
```

`catalog.module.ts` lines 5-6:

```ts
//   - GET /products       — return a deterministic list of products
//   - GET /products/:id   — return one product or 404
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/catalog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/catalog
git commit -m "feat(bff): serve the catalog at /products"
```

---

### Task 2: Checkout → `POST /orders`

**Files:**

- Modify: `apps/bff/src/modules/checkout/checkout.controller.ts:9`
- Modify: `apps/bff/src/modules/checkout/checkout.controller.spec.ts:49-56`
- Modify: `apps/bff/src/modules/checkout/checkout.module.ts:6`

**Interfaces:**

- Produces: `CheckoutController` mounted at `orders`, handler `create` = `POST /orders` → `201`. Same `CheckoutDto` body, same `CheckoutResponse`.

- [ ] **Step 1: Update the route test (failing)**

Replace the last `it` in `checkout.controller.spec.ts`:

```ts
it("is POST /orders with a 201", () => {
  expect(Reflect.getMetadata(PATH_METADATA, CheckoutController)).toBe("orders");
  const handler = CheckoutController.prototype.create;
  expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
    RequestMethod.POST,
  );
  expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("/");
  expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(201);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/checkout/checkout.controller.spec.ts`
Expected: FAIL with `expected 'checkout' to be 'orders'`.

- [ ] **Step 3: Implement**

In `checkout.controller.ts`, change `@Controller("checkout")` to:

```ts
// POST /orders creates an order from the session cart. It lives in the
// checkout module (cart → order orchestration); OrdersController owns the
// GET routes on the same path.
@Controller("orders")
```

In `checkout.module.ts` line 6:

```ts
//   - POST /orders         — checkout the current cart, returns the new order
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/checkout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/checkout
git commit -m "feat(bff): create orders with POST /orders"
```

---

### Task 3: `GET /orders?owner=session` replaces `/orders/mine`

**Files:**

- Modify: `apps/bff/src/modules/orders/orders.controller.ts`
- Modify: `apps/bff/src/modules/orders/orders.controller.spec.ts`
- Modify: `apps/bff/src/modules/orders/orders.module.ts:8`

**Interfaces:**

- Produces: `OrdersController.list(owner: string | string[] | undefined, req: Request, res: Response): OrdersResponse`. The `mine` handler is deleted.

- [ ] **Step 1: Rewrite the list tests (failing)**

In `orders.controller.spec.ts`, add `BadRequestException` to the `@nestjs/common` import. Remove the `METHOD_METADATA`, `PATH_METADATA`, and `RequestMethod` imports if nothing else uses them. Replace both the `describe("GET /orders/mine", …)` block and the `describe("GET /orders", …)` block with:

```ts
describe("GET /orders", () => {
  const req = {} as Request;
  const res = {} as Response;

  it("without owner returns all orders and never touches the session", () => {
    const { controller, svc, session } = makeController();
    const result = controller.list(undefined, req, res);
    expect(result).toEqual({ items: [DEMO_ORDER] });
    expect(svc.listAll).toHaveBeenCalledOnce();
    expect(session.resolveSessionId).not.toHaveBeenCalled();
  });

  it("returns empty items when no orders exist", () => {
    const { controller } = makeController({
      listAll: vi.fn().mockReturnValue([]),
    });
    expect(controller.list(undefined, req, res)).toEqual({ items: [] });
  });

  it("owner=session resolves the session and lists only its orders", () => {
    const { controller, svc, session } = makeController({
      listForSession: vi.fn().mockReturnValue([DEMO_ORDER]),
    });
    const result = controller.list("session", req, res);
    expect(session.resolveSessionId).toHaveBeenCalledWith(req, res);
    expect(svc.listForSession).toHaveBeenCalledWith("sid_test");
    expect(svc.listAll).not.toHaveBeenCalled();
    expect(result.items.map((o) => o.orderId)).toEqual(["ord_demo"]);
  });

  it("owner=session returns an empty envelope for a fresh session", () => {
    const { controller } = makeController({}, "sid_brand_new");
    expect(controller.list("session", req, res)).toEqual({ items: [] });
  });

  it.each([
    ["unknown value", "bogus"],
    ["empty value", ""],
    ["repeated param", ["session", "session"]],
  ] as const)("owner %s → 400", (_label, owner) => {
    const { controller, svc, session } = makeController();
    expect(() => controller.list(owner as string | string[], req, res)).toThrow(
      BadRequestException,
    );
    expect(svc.listAll).not.toHaveBeenCalled();
    expect(session.resolveSessionId).not.toHaveBeenCalled();
  });

  it("has no mine handler", () => {
    expect(
      Object.getOwnPropertyNames(OrdersController.prototype),
    ).not.toContain("mine");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders/orders.controller.spec.ts`
Expected: FAIL. The "owner=session" tests get the `listAll` result, `BadRequestException` is not thrown, and `mine` is still present.

- [ ] **Step 3: Implement**

`orders.controller.ts`, full file:

```ts
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
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

  // No owner → every order. owner=session → the caller's orders, minting the
  // `sid` cookie for a fresh browser (which then owns nothing yet). Any other
  // value, including empty or repeated, is a 400 rather than a silent "all".
  @Get()
  list(
    @Query("owner") owner: string | string[] | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): OrdersResponse {
    if (owner === undefined) {
      return { items: this.orders.listAll() };
    }
    if (owner === "session") {
      const sessionId = this.session.resolveSessionId(req, res);
      return { items: this.orders.listForSession(sessionId) };
    }
    throw new BadRequestException('owner must be "session" when present');
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

In `orders.module.ts`, replace line 8 (`GET /orders/mine`) with:

```ts
//   - GET /orders?owner=session — the caller's orders (session cookie), newest first
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/orders/orders.controller.ts apps/bff/src/modules/orders/orders.controller.spec.ts apps/bff/src/modules/orders/orders.module.ts
git commit -m "feat(bff): filter session orders with GET /orders?owner=session"
```

---

### Task 4: `/me`, `/me/orders`, `/me/hot-status`

**Files:**

- Create: `apps/bff/src/modules/auth/me.controller.ts`
- Create: `apps/bff/src/modules/auth/me.controller.spec.ts`
- Modify: `apps/bff/src/modules/auth/auth.controller.ts` (remove `me`)
- Modify: `apps/bff/src/modules/auth/auth.controller.spec.ts` (remove the `me` row)
- Modify: `apps/bff/src/modules/auth/auth.module.ts` (comment + `controllers`)
- Modify: `apps/bff/src/modules/orders/account.controller.ts` (`@Controller("me")` + comment)
- Modify: `apps/bff/src/modules/orders/account.controller.spec.ts:34-41`
- Modify: `apps/bff/src/modules/orders/orders.module.ts:9-10`
- Modify: `apps/bff/prisma/schema.prisma:49-50` (comment)

**Interfaces:**

- Produces: `MeController` (auth module) with `me(req, res): Promise<MeResponse>` = `GET /me`; `AccountController` mounted at `me` with `orders` = `GET /me/orders`, `hotStatus` = `GET /me/hot-status`.

- [ ] **Step 1: Write the failing tests**

`apps/bff/src/modules/auth/me.controller.spec.ts`:

```ts
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "./auth.service";
import { MeController } from "./me.controller";

describe("MeController", () => {
  it("is GET /me", () => {
    expect(Reflect.getMetadata(PATH_METADATA, MeController)).toBe("me");
    const fn = MeController.prototype.me;
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(RequestMethod.GET);
  });

  it("delegates to AuthService.me (guest → user:null, not 401)", async () => {
    const auth = { me: vi.fn().mockResolvedValue({ user: null }) };
    const controller = new MeController(auth as unknown as AuthService);
    const req = {} as Request;
    const res = {} as Response;
    await expect(controller.me(req, res)).resolves.toEqual({ user: null });
    expect(auth.me).toHaveBeenCalledWith(req, res);
  });
});
```

In `auth.controller.spec.ts`, delete the row `["me", "me", RequestMethod.GET, undefined],` and add after the `it.each`:

```ts
it("no longer serves me (moved to GET /me)", () => {
  expect(Object.getOwnPropertyNames(AuthController.prototype)).not.toContain(
    "me",
  );
});
```

In `account.controller.spec.ts`, replace the first `it` (lines 34-41):

```ts
it("is mounted at /me with GET orders", () => {
  expect(Reflect.getMetadata(PATH_METADATA, AccountController)).toBe("me");
  expect(
    Reflect.getMetadata(PATH_METADATA, AccountController.prototype.orders),
  ).toBe("orders");
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/auth src/modules/orders/account.controller.spec.ts`
Expected: FAIL. `me.controller` cannot be resolved, `AuthController` still has `me`, and the mount is `'account'` instead of `'me'`.

- [ ] **Step 3: Implement**

`apps/bff/src/modules/auth/me.controller.ts`:

```ts
import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import type { MeResponse } from "./auth.types";

// /me is the current-user alias. GET /me/orders and GET /me/hot-status live
// in the orders module's AccountController under the same prefix.
@Controller("me")
export class MeController {
  constructor(private readonly auth: AuthService) {}

  // 200 with user:null for guests (not 401) so the web app's bootstrap
  // probe never logs a console error.
  @Get()
  me(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.auth.me(req, res);
  }
}
```

In `auth.controller.ts`, delete the `me` handler and its comment. Remove `Get` from the `@nestjs/common` import and `MeResponse` from the types import.

In `auth.module.ts`:

```ts
//   - POST /auth/logout     — end the session (idempotent, 204)
//   - GET  /me              — {user} or {user: null}
```

```ts
import { MeController } from "./me.controller";
...
  controllers: [AuthController, MeController],
```

In `account.controller.ts`, replace the comment and decorator above the class:

```ts
// Current-user routes under /me (GET /me itself is the auth module's
// MeController). Never under /orders, so nothing collides with GET /orders/:id.
@Controller("me")
```

In `orders.module.ts`, lines 9-10:

```ts
//   - GET /me/orders            — signed-in user's orders (owner username OR email), newest first + latest
//   - GET /me/hot-status        — signed-in user's hot count + next coolsAt (banner)
```

In `apps/bff/prisma/schema.prisma`, lines 49-50:

```prisma
  // Composite so GET /me/hot-status (owner + placedAt range) and
  // GET /me/orders (owner, newest first) are index scans.
```

- [ ] **Step 4: Run them to make sure they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/auth src/modules/orders && pnpm --filter @mini-commerce/bff typecheck`
Expected: PASS, and typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/auth apps/bff/src/modules/orders/account.controller.ts apps/bff/src/modules/orders/account.controller.spec.ts apps/bff/src/modules/orders/orders.module.ts apps/bff/prisma/schema.prisma
git commit -m "feat(bff): current-user routes under /me"
```

---

### Task 5: Visualization → `/visualization`, `/visualization/events`

**Files:**

- Modify: `apps/bff/src/modules/visualization/visualization.controller.ts`
- Create: `apps/bff/src/modules/visualization/visualization.controller.spec.ts`
- Modify: `apps/bff/src/modules/visualization/visualization.module.ts:8`

**Interfaces:**

- Produces: `VisualizationController` mounted at `visualization`, `list` = `GET /visualization`, `updates` = SSE `GET /visualization/events`.

- [ ] **Step 1: Write the failing test**

```ts
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import {
  METHOD_METADATA,
  PATH_METADATA,
  SSE_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { VisualizationController } from "./visualization.controller";

describe("VisualizationController routes", () => {
  it("is mounted at /visualization", () => {
    expect(Reflect.getMetadata(PATH_METADATA, VisualizationController)).toBe(
      "visualization",
    );
  });

  it("serves the snapshot at GET /visualization", () => {
    const fn = VisualizationController.prototype.list;
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(RequestMethod.GET);
  });

  it("streams SSE at GET /visualization/events", () => {
    const fn = VisualizationController.prototype.updates;
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe("events");
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(SSE_METADATA, fn)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/visualization/visualization.controller.spec.ts`
Expected: FAIL with `expected '/' to be 'visualization'`.

- [ ] **Step 3: Implement**

In `visualization.controller.ts`, change `@Controller()` to `@Controller("visualization")`, `@Get("visualization-data")` to `@Get()`, and `@Sse("visualization-updates")` to `@Sse("events")`. In `visualization.module.ts` line 8:

```ts
//   - GET /visualization — aggregates catalog and orders into a flat
```

Then add this line after that bullet's continuation lines:

```ts
//   - GET /visualization/events — SSE: full snapshot on connect and per mutation
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/visualization`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/visualization
git commit -m "feat(bff): visualization resource with an events stream"
```

---

### Task 6: Route-map guard + BFF docs

**Files:**

- Create: `apps/bff/src/routes.spec.ts`
- Modify: `apps/bff/README.md:37-61,79`
- Modify: `apps/bff/src/core/session/session.service.ts:22`

**Interfaces:**

- Consumes: every controller from Tasks 1-5 plus the unchanged `AssetsController`, `CartController`, `HealthController`.

- [ ] **Step 1: Write the guard test**

`apps/bff/src/routes.spec.ts`:

```ts
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AssetsController } from "./modules/assets/assets.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { MeController } from "./modules/auth/me.controller";
import { CartController } from "./modules/cart/cart.controller";
import { CatalogController } from "./modules/catalog/catalog.controller";
import { CheckoutController } from "./modules/checkout/checkout.controller";
import { HealthController } from "./modules/health/health.controller";
import { AccountController } from "./modules/orders/account.controller";
import { OrdersController } from "./modules/orders/orders.controller";
import { VisualizationController } from "./modules/visualization/visualization.controller";

// The whole public route table, derived from decorator metadata. Adding,
// moving, or removing a route fails here until the spec's route map (and
// this list) say so.
const CONTROLLERS = [
  AssetsController,
  AuthController,
  MeController,
  CartController,
  CatalogController,
  CheckoutController,
  HealthController,
  AccountController,
  OrdersController,
  VisualizationController,
];

const trim = (s: unknown) => String(s ?? "").replace(/^\/+|\/+$/g, "");

function routeTable(): string[] {
  const routes: string[] = [];
  for (const controller of CONTROLLERS) {
    const base = trim(Reflect.getMetadata(PATH_METADATA, controller));
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === "constructor" || typeof handler !== "function") continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;
      const sub = trim(Reflect.getMetadata(PATH_METADATA, handler));
      const path = "/" + [base, sub].filter(Boolean).join("/");
      routes.push(`${RequestMethod[method as RequestMethod]} ${path}`);
    }
  }
  return routes.sort();
}

describe("BFF route table", () => {
  it("matches the REST route map exactly", () => {
    expect(routeTable()).toEqual(
      [
        "GET /health",
        "GET /products",
        "GET /products/:id",
        "GET /cart",
        "POST /cart/items",
        "PATCH /cart/items/:itemId",
        "DELETE /cart/items/:itemId",
        "POST /orders",
        "GET /orders",
        "GET /orders/:id",
        "GET /orders/:id/status",
        "GET /me",
        "GET /me/orders",
        "GET /me/hot-status",
        "POST /auth/register",
        "POST /auth/login",
        "POST /auth/logout",
        "GET /visualization",
        "GET /visualization/events",
        "POST /assets/refresh",
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/routes.spec.ts`
Expected: PASS, because Tasks 1-5 are in. If it fails, the diff names the stray or missing route; fix the controller, not the list.

- [ ] **Step 3: Sanity check that the guard bites**

Temporarily change `@Get(":id/status")` in `orders.controller.ts` to `@Get(":id/state")`, then re-run. Expected: FAIL with the diff showing `GET /orders/:id/state`. Revert the change.

- [ ] **Step 4: BFF docs**

`apps/bff/README.md`: in the module tree (lines 37-40) and the endpoint table (lines 50-61), replace routes with the spec map. That means `/products`, `/products/:id`, `POST /orders` (the checkout row: "converts the cart to an order and resets it. Rejects a `customerName` field (400)."), `GET /orders?owner=session`, `GET /me`, `GET /me/orders`, `GET /me/hot-status`, `GET /visualization`, and a new row `GET /visualization/events` | SSE: full snapshot on connect and after each mutation. Line 79 becomes `curl http://localhost:3001/products`.

`session.service.ts` line 22: change `('/cart/items', '/checkout')` to `('/cart/items', '/orders')`.

- [ ] **Step 5: Full BFF gate and commit**

Run: `pnpm --filter @mini-commerce/bff test && pnpm --filter @mini-commerce/bff typecheck && pnpm --filter @mini-commerce/bff lint`
Expected: all green.

```bash
git add apps/bff
git commit -m "test(bff): pin the REST route table"
```

---

### Task 7: Contracts + web client

**Files:**

- Modify: `packages/contracts/src/index.ts:123,129`
- Modify: `apps/web/src/lib/api/expresso-api.ts` (header table 18-43; error labels 257, 267, 274, 308, 378, 385; real calls 406, 412, 439, 449, 477, 483, 487)
- Create: `apps/web/src/lib/api/expresso-api.test.ts`
- Modify: `apps/web/src/components/sections/DevSection.tsx:582-593,711,928,978`
- Modify: `apps/web/src/components/sections/HotCoffeeBanner.tsx:5`, `apps/web/src/components/auth/AuthProvider.tsx:6,33`, `apps/web/app/page.tsx:47` (comments)

**Interfaces:**

- Consumes: the route map. `expressoApi` method names are unchanged (`getProducts`, `getProductById`, `checkout`, `getOrders`, `getMyOrders`, `getMe`, `getAccountOrders`, `getHotStatus`).

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/api/expresso-api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expressoApi } from "./expresso-api";

type Call = { method: string; path: string };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://bff.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      calls.push({
        method: init?.method ?? "GET",
        path: u.pathname + u.search,
      });
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("expressoApi routes", () => {
  it.each([
    ["getProducts", () => expressoApi.getProducts(), "GET", "/products"],
    [
      "getProductById",
      () => expressoApi.getProductById("prod_espresso"),
      "GET",
      "/products/prod_espresso",
    ],
    [
      "checkout",
      () =>
        expressoApi.checkout({
          cartId: "cart_1",
        } as Parameters<typeof expressoApi.checkout>[0]),
      "POST",
      "/orders",
    ],
    ["getOrders", () => expressoApi.getOrders(), "GET", "/orders"],
    [
      "getMyOrders",
      () => expressoApi.getMyOrders(),
      "GET",
      "/orders?owner=session",
    ],
    ["getMe", () => expressoApi.getMe(), "GET", "/me"],
    [
      "getAccountOrders",
      () => expressoApi.getAccountOrders(),
      "GET",
      "/me/orders",
    ],
    ["getHotStatus", () => expressoApi.getHotStatus(), "GET", "/me/hot-status"],
  ] as const)("%s → %s %s", async (_name, call, method, path) => {
    await call();
    expect(calls).toEqual([{ method, path }]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @mini-commerce/web exec vitest run src/lib/api/expresso-api.test.ts`
Expected: FAIL for every row except `getOrders`, with the old paths showing in the diff (`/catalog/products`, `/checkout`, `/orders/mine`, `/auth/me`, `/account/...`).

- [ ] **Step 3: Implement**

In `expresso-api.ts`, in the real-API block:

```ts
return request<ProductsResponse>("GET", "/products");
```

```ts
      `/products/${encodeURIComponent(productId)}`,
```

```ts
return request<CheckoutResponse>("POST", "/orders", input);
```

```ts
return request<OrdersResponse>("GET", "/orders?owner=session");
```

```ts
return request<MeResponse>("GET", "/me");
```

```ts
return request<AccountOrdersResponse>("GET", "/me/orders");
```

```ts
return request<HotStatusResponse>("GET", "/me/hot-status");
```

The mock-API `ExpressoApiError` labels move the same way: lines 257/267/274 use `/products` and `` `/products/${productId}` ``, line 308 uses `"/orders"` (method stays `"POST"`), lines 378/385 use `"/me/orders"` and `"/me/hot-status"`.

The header table (lines 22-41) becomes:

```ts
 * | Endpoint                     | BFF Controller       | Status    |
 * |------------------------------|----------------------|-----------|
 * | GET  /health                 | health.controller    | VERIFIED  |
 * | GET  /products               | catalog.controller   | VERIFIED  |
 * | GET  /products/:id           | catalog.controller   | VERIFIED  |
 * | GET    /cart                 | cart.controller      | VERIFIED  |
 * | POST   /cart/items           | cart.controller      | VERIFIED  |
 * | PATCH  /cart/items/:itemId   | cart.controller      | VERIFIED  |
 * | DELETE /cart/items/:itemId   | cart.controller      | VERIFIED  |
 * | POST   /orders               | checkout.controller  | VERIFIED  |
 * | GET    /orders/:id           | orders.controller    | VERIFIED  |
 * | GET    /orders?owner=session | orders.controller    | VERIFIED  |
 * | GET    /orders               | orders.controller    | VERIFIED  |
 * | POST   /auth/register        | auth.controller      | VERIFIED  |
 * | POST   /auth/login           | auth.controller      | VERIFIED  |
 * | POST   /auth/logout          | auth.controller      | VERIFIED  |
 * | GET    /me                   | me.controller        | VERIFIED  |
 * | GET    /me/orders            | account.controller   | VERIFIED  |
 * | GET    /me/hot-status        | account.controller   | VERIFIED  |
```

`packages/contracts/src/index.ts`: line 123 becomes `// GET /me/orders — the signed-in user's orders, newest first.` and line 129 becomes `// GET /me/hot-status — the signed-in user's hot-order summary.`

`DevSection.tsx`: the notes and labels at 582/587/591/593/711/928/978 become `GET /products`, `GET /products/:id`, `POST /orders`, `GET /orders?owner=session`, `GET /products`, `POST /orders`, `GET /orders?owner=session`.

Comments: in `HotCoffeeBanner.tsx:5`, use `GET /me/hot-status`. In `AuthProvider.tsx:6,33` and `app/page.tsx:47`, use `GET /me` and `/me`. Leave the `OrdersScope` value `"mine"` in `page.tsx`/`OrdersSection.tsx`; it is a UI scope name, not a route.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm --filter @mini-commerce/web test && pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint && pnpm --filter @mini-commerce/contracts typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts apps/web
git commit -m "feat(web): call the REST routes"
```

---

### Task 8: Visualizer transport

**Files:**

- Modify: `apps/visualizer-3d/public/transport.js:42,95`
- Modify: `apps/visualizer-3d/public/index.html:38`
- Modify: `apps/visualizer-3d/README.md:57,79,86,146`

**Interfaces:**

- Consumes: `GET /visualization`, SSE `GET /visualization/events`. The frame format is unchanged.

- [ ] **Step 1: Implement**

`transport.js` line 42:

```js
const res = await fetch(`${API_BASE}/visualization`, {
  headers: { accept: "application/json" },
});
```

`transport.js` line 95:

```js
sseSource = new EventSource(`${API_BASE}/visualization/events`);
```

`index.html` line 38: change `<code>/visualization-updates</code>` to `<code>/visualization/events</code>`. In `README.md`, lines 57 and 86 use `GET /visualization`, line 79 uses `GET /visualization/events`, and line 146 uses `/visualization`.

- [ ] **Step 2: Verify**

Run: `grep -n "visualization-" apps/visualizer-3d -r`
Expected: no output. Behaviour is proven by Task 9's `visualizer-interaction.spec.ts`: its mock answers only the new endpoints, so the old URLs would get a 404 and the scene assertions would fail.

- [ ] **Step 3: Commit**

```bash
git add apps/visualizer-3d
git commit -m "feat(visualizer): read /visualization and its events stream"
```

---

### Task 9: e2e mocks and specs

**Files:**

- Modify: `tests/e2e/fixtures/commerce-api.ts:140-160,227,285-292,293,314,341,378`
- Modify: `tests/e2e/tests/visualizer-interaction.spec.ts:131-169`
- Modify: `tests/e2e/tests/hot-status.spec.ts:40` (and any other `/account/hot-status` string in it)
- Modify: `tests/e2e/TEST_PLAN.md:35,37,39,47,49,51`

**Interfaces:**

- Consumes: the web client from Task 7 and the visualizer from Task 8.

- [ ] **Step 1: Run the suite on the current branch to see the break**

Run: `pnpm --filter @mini-commerce/e2e test:e2e` (Playwright starts `next dev` itself via `webServer`).
Expected: FAILURES in catalog, checkout, account, hot-status, and visualizer specs, because the mocks still answer the old paths. These failures are the "failing test" for this task.

- [ ] **Step 2: Implement `commerce-api.ts`**

Next to `pathname` (around line 143), add:

```ts
const owner = new URL(request.url()).searchParams.get("owner");
```

Route matches:

```ts
path === "/products" || path === "/api/products";
```

```ts
const productMatch = path.match(/^\/products\/([^/]+)$/);
```

```ts
    if (method === "POST" && path === "/orders") {
```

Replace the `GET /orders` branch (285-291) **and** the `GET /orders/mine` branch (341-347) with this single block, placed where the `GET /orders` branch was:

```ts
if (method === "GET" && path === "/orders") {
  // Mirrors the BFF: owner=session → this browser's orders, no owner →
  // all orders, anything else → 400.
  if (owner !== null && owner !== "session") {
    return fulfillJson(route, 400, {
      message: 'owner must be "session" when present',
    });
  }
  return fulfillJson(route, 200, {
    items: Array.from(orders.values())
      .filter((o) => owner === null || myOrderIds.has(o.orderId))
      .sort(newestFirst)
      .map(withTemperature),
  });
}
```

Then change `"/account/orders"` to `"/me/orders"`, `"/account/hot-status"` to `"/me/hot-status"`, and `"/auth/me"` to `"/me"`.

- [ ] **Step 3: Implement `visualizer-interaction.spec.ts`**

```ts
    if (endpoint === "/products")
      return json({ items: [product, secondProduct] });
    if (endpoint === "/visualization") return json({ scene: scene() });
    if (endpoint === "/visualization/events") {
```

Change the checkout branch to check the method, so it no longer swallows `GET /orders`:

```ts
    if (endpoint === "/orders" && request.method() === "POST") {
```

Leave `if (endpoint === "/orders") return json({ items: orders });` below it as it is.

- [ ] **Step 4: Implement `hot-status.spec.ts` and `TEST_PLAN.md`**

`hot-status.spec.ts`: replace every `"/account/hot-status"` with `"/me/hot-status"`. This is Review Focus 2: the "no request" assertion would otherwise pass vacuously.

`TEST_PLAN.md`: on lines 35/47, use `` `GET /products` ``. On lines 39/49, use `` `POST /orders` ``. On line 51, use `` `GET /orders?owner=session`, `GET /orders` ``. Line 37 ("direct `/checkout` visit") is a web page path, not an API route; leave it.

- [ ] **Step 5: Run the suite**

Run: `pnpm --filter @mini-commerce/e2e test:e2e`
Expected: PASS, including `account-orders.spec.ts` and `order-temperature.spec.ts` (`data-scope="mine"` lists only this browser's orders) and `hot-status.spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): mock the REST routes"
```

---

### Task 10: `./dev smoke`

**Files:**

- Modify: `scripts/pg/smoke.py:91-255`
- Modify: `scripts/pg/http.py:7` (docstring)

**Interfaces:**

- Consumes: the live BFF from Tasks 1-6.

- [ ] **Step 1: Implement**

In `smoke.py`, change the route strings and labels:

| Line(s)            | New                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| 91-92              | `"GET  /products"`, `_expect("GET", "/products", 200, cookie_jar=jar)`                                |
| 93-94              | `"GET  /products/prod_espresso"`, `_expect("GET", "/products/prod_espresso", 200, cookie_jar=jar)`    |
| 115-116            | `"POST /orders (rejected — customerName not accepted)"`, `_expect("POST", "/orders", 400, …)`         |
| 123, 129           | `f"{API_BASE}/orders"`, `"POST /orders"`                                                              |
| 147, 153, 157, 158 | `f"{API_BASE}/orders?owner=session"`; messages and label say `/orders?owner=session`                  |
| 161                | comment `/me/orders`                                                                                  |
| 178, 180, 181      | `f"{API_BASE}/me"`, `"/me did not return …"`, `"GET  /me"`                                            |
| 190, 195           | `f"{API_BASE}/orders"`, `"POST /orders (orderFor self)"`                                              |
| 198, 206           | `f"{API_BASE}/me/orders"`, `"GET  /me/orders (latest hot)"`                                           |
| 209, 221           | `f"{API_BASE}/me/hot-status"`, `"GET  /me/hot-status (hot count)"`                                    |
| 224, 227, 230, 249 | `f"{API_BASE}/visualization"`, labels `"GET  /visualization"` / `"GET  /visualization (scene shape)"` |
| 252, 255           | `f"{API_BASE}/visualization/events"`, `"GET  /visualization/events (SSE)"`                            |

Directly after the `GET  /orders?owner=session (session-owned)` check, add two checks (21 → 23):

```python
    results.append(_check("GET  /orders?owner=bogus (rejected)",
                          _expect("GET", "/orders?owner=bogus", 400, cookie_jar=jar)))
    # Retired route stays retired: no alias, plain 404.
    results.append(_check("GET  /catalog/products (retired → 404)",
                          _expect("GET", "/catalog/products", 404, cookie_jar=jar)))
```

`http.py` line 7: `GET /visualization/events.`

- [ ] **Step 2: Unit gate**

Run: `pnpm pg:test`
Expected: PASS. If `test_k6_checkout_contract.py` fails, that's expected and fixed in Task 11; check that every other test passes.

- [ ] **Step 3: Live run**

```bash
./dev up
./dev smoke
```

Expected: `23/23` passed, including `GET  /visualization/events (SSE)`.

- [ ] **Step 4: Commit**

```bash
git add scripts/pg/smoke.py scripts/pg/http.py
git commit -m "test(smoke): check the REST routes and a retired one"
```

---

### Task 11: k6 route strings

**Files:**

- Modify: `tests/performance/k6/scenarios/{cart-fulfill,place-order,purchase-flow,purchase-registered,hot-status,smoke}/*.ts`, `scenarios/load/load.js`, `scenarios/stress/stress.js`, plus comments in `cart-fulfill-browser.ts` and `purchase-flow-browser.ts`
- Modify: `scripts/pg/tests/test_k6_checkout_contract.py:63`
- Modify: `tests/performance/k6/README.md:139,144,205,264`, `Taskfile.yml:163`, `infra/docker/compose.yaml:113`

**Interfaces:**

- Consumes: the route map. Scenario dirs, file names, group names, and check names are unchanged (spec B owns them).

- [ ] **Step 1: Update the contract test (failing)**

`test_k6_checkout_contract.py` line 63:

```python
            r'http\.post\(\s*url\(["\']/orders["\']\),\s*JSON\.stringify\((\{[^)]*\})\)',
```

Run: `pnpm pg:test`
Expected: FAIL at `self.assertTrue(checkout_scenarios)`, because no scenario posts to `/orders` yet.

- [ ] **Step 2: Rewrite route strings**

```bash
cd tests/performance/k6/scenarios
grep -rlE 'catalog/products|/checkout|visualization-data|/account/hot-status' . \
  | xargs sed -i '' \
      -e 's#/catalog/products#/products#g' \
      -e 's#url("/checkout")#url("/orders")#g' \
      -e 's#POST /checkout#POST /orders#g' \
      -e 's#/visualization-data#/visualization#g' \
      -e 's#/account/hot-status#/me/hot-status#g'
cd -
```

Then read the diff (`git diff tests/performance/k6/scenarios`). For any line still containing `/checkout`, decide by hand. Comments about the web UI having "no /checkout route" (`cart-fulfill-browser.ts:13` points at `checkout.dto.ts`, a file path; `purchase-flow-browser.ts:8` refers to a web page) stay. Any other API mention becomes `/orders`. `smoke.ts:8` names `GET /orders/mine` in a comment: change it to `GET /orders?owner=session`.

- [ ] **Step 3: Docs in this area**

`tests/performance/k6/README.md`: lines 139/144 use `POST /orders`, line 205 uses `GET /me/hot-status`, line 264 uses `GET /products/:id`. `Taskfile.yml:163` uses `GET /me/hot-status`. `infra/docker/compose.yaml:113` uses `/visualization`.

- [ ] **Step 4: Verify**

Run: `pnpm pg:test && pnpm --filter @mini-commerce/k6-scenarios typecheck && pnpm --filter @mini-commerce/k6-scenarios build`
Expected: all green.

Live (stack from Task 10 still up): `VUS=1 ITERATIONS=1 ./dev perf:purchase-flow`
Expected: exit 0, all checks pass (`checkout 201`, visualizer feed check).

- [ ] **Step 5: Commit**

```bash
git add tests/performance/k6 scripts/pg/tests/test_k6_checkout_contract.py Taskfile.yml infra/docker/compose.yaml
git commit -m "test(perf): drive k6 scenarios through the REST routes"
```

---

### Task 12: Live docs sweep + grep gate

**Files:**

- Modify: `README.md`, `CLAUDE.md:41`, `docs/local-development.md`, `docs/cli-reference.md`, `docs/quality-strategy/README.md`, `docs/architecture/{orchestrator-python,observability,web-entry-point,bff-modules,containers}.md`, `docs/uat/{walkthrough-uat,web-app-uat}.md`, `docs/specs/live-workflow-traffic-and-falling-cups.md`, `docs/ai/codex/{design-governance-prompt,current-findings,manual-uat-prompt,governance}.md`, `docs/ai/codex/skills/manual-web-uat/references/web-uat-source-map.md`, `docs/project-state/{current-system,visualizer-domain-certification}.md`, `docs/next-steps/{README,visualizer-reactivity,hot-status,observability-grafana,expresso-order-counter,uat-remediation,login,geometry-db-params,simplify-orders}.md`
- Not touched: `docs/superpowers/**`, `docs/adr/**` (dated records)

- [ ] **Step 1: Rewrite routes in live docs**

For each file, replace old routes with the spec map, reading each hit in context (not a blind `sed`):
`/catalog/products/:id` → `/products/:id`, `/catalog/products` → `/products`, `POST /checkout` → `POST /orders`, `/orders/mine` → `/orders?owner=session`, `/auth/me` → `/me`, `/account/orders` → `/me/orders`, `/account/hot-status` → `/me/hot-status`, `/visualization-data` → `/visualization`, `/visualization-updates` → `/visualization/events`.
Web page paths (a `/checkout` _page_ the web app doesn't have) stay.

Smoke check counts: `CLAUDE.md:41`, `docs/cli-reference.md:57`, `docs/quality-strategy/README.md:83`, and `docs/architecture/orchestrator-python.md:87` move from 21 to **23** checks. `docs/next-steps/hot-status.md:17` is a dated progress note; leave it.

`docs/architecture/bff-modules.md`: record that `POST /orders` belongs to the checkout module while `GET /orders*` belongs to orders, and that `/me` is shared by `MeController` (auth) and `AccountController` (orders).

- [ ] **Step 2: Grep gate**

```bash
grep -rnE 'catalog/products|orders/mine|/account/(orders|hot-status)|auth/me|visualization-data|visualization-updates|(POST|url\()["( ]*/checkout' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
  --exclude-dir=vendor --exclude-dir=reports --exclude-dir=superpowers --exclude-dir=adr --exclude-dir=.turbo . \
  | grep -v 'retired'
```

Expected: no output. The only allowed hit is `scripts/pg/smoke.py`'s `(retired → 404)` check, which the `grep -v` removes. Fix any other hit.

- [ ] **Step 3: Format and commit**

Run: `pnpm format` (fix with `pnpm exec prettier --write <files>` if it flags any).

```bash
git add -A README.md CLAUDE.md docs
git commit -m "docs: REST route names across live docs"
```

---

### Task 13: End-to-end verification

- [ ] **Step 1: Repo gates**

Run: `pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm pg:test`
Expected: all green.

- [ ] **Step 2: Live stack**

```bash
./dev down && ./dev up full
./dev smoke
```

Expected: `23/23`.

- [ ] **Step 3: Manual web walk** (through `/api/bff`, browser devtools Network tab open)

Browse the catalog (`GET /products`), add to cart, and check out (`POST /orders` → 201). The order appears in "my orders" (`GET /orders?owner=session`). Log in as a demo user (`POST /auth/login`, then `GET /me`). The account list loads (`GET /me/orders`), and after an order for self the hot-coffee banner shows (`GET /me/hot-status`). The visualizer stage loads (`GET /visualization`) and updates after checkout (`/visualization/events` stays open with frames). No request hits an old route.

- [ ] **Step 4: e2e and k6**

Run: `pnpm --filter @mini-commerce/e2e test:e2e && VUS=1 ITERATIONS=1 ./dev perf:purchase-flow && ./dev perf:smoke`
Expected: all pass.

- [ ] **Step 5: Push and watch CI**

```bash
git push -u origin feat/rest-route-conventions
gh run watch
```

Expected: every CI job green, including the k6 smoke job. Don't trust local state alone; a checkout-level CI failure hides everything downstream.
