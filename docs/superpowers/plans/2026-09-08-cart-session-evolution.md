# Cart/Session Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `CartService`'s single global in-memory cart with a
per-session cart, identified by an `HttpOnly` cookie the BFF mints and
reads itself. Orders and product inventory stay global/shared exactly as
today. This resolves CLAUDE.md's tracked Phase 2 "Open: cart/session
evolution" item and unblocks (without implementing) the spec's CUP-003
interactive-selection contract.

**Architecture:** A new `SessionService` (BFF `core/session/`) resolves a
session id from a `sid` cookie on every cart/checkout request, minting and
setting one if absent. `CartService`'s internal state becomes
`Map<sessionId, SessionCart>` instead of one singleton. `CartController`
and `CheckoutController` resolve the session id per request and pass it
down. `VisualizationService` — which has no request context — stops
reading the cart at all (a pre-existing, spec-mandated retirement this
document just moves earlier; see Task 6).

**Tech Stack:** NestJS (Express under the hood — `@nestjs/platform-express`
already provides `res.cookie()`; no new dependency needed), Vitest,
Playwright, Python stdlib (`scripts/pg/`).

**Spec:** [`docs/superpowers/specs/2026-09-08-cart-session-evolution-design.md`](../specs/2026-09-08-cart-session-evolution-design.md)
— the plan argues from this spec; executors should read both.

## Global Constraints

- Session state is in-memory, per-process, keyed by session id — same
  "resets on BFF restart" design the cart already had, just no longer a
  singleton. No new database table, no Redis, no TTL/cleanup job.
- The cookie is `sid`, `HttpOnly`, `SameSite=Lax`, **`Path: '/'`** (not a
  narrower prefix — see the spec's "Session identity & transport" section
  for why `/api/bff` would silently break direct callers like
  `scripts/pg/smoke.py` and k6), `Secure` only when
  `process.env.NODE_ENV === 'production'`.
- No new npm dependency. Cookie parsing is a small manual helper (read
  `req.headers.cookie`) — not `cookie-parser`. Setting a cookie uses
  Express's built-in `res.cookie()`, already available via
  `@nestjs/platform-express`.
- Orders (`OrdersService`) and `Product.inventory` (Postgres, CAS-guarded)
  are **not** session-scoped and are not touched by this plan except where
  a call site's argument list changes because `CartService`'s signature
  changed underneath it.
- k6 is out of scope — do not touch any file under `tests/performance/k6/`.
  k6 not carrying cookies is an accepted, known consequence (spec
  Non-goals), left for the CUP-009 follow-up.
- The web app (`apps/web`) needs **no code changes**. Browser `fetch()`
  defaults to `credentials: 'same-origin'`, and `/api/bff/*` is
  same-origin from the browser's perspective — cookies flow automatically
  through the existing proxy with zero config. Confirmed by reading
  `apps/web/src/lib/api/expresso-api.ts`'s `request()`: no `credentials`
  override is set anywhere in it.

---

## File Structure

**BFF — new:**
- `apps/bff/src/core/session/session.service.ts` — resolves/mints the
  session id from the `sid` cookie.
- `apps/bff/src/core/session/session.service.spec.ts` — unit tests.
- `apps/bff/src/core/session/session.module.ts` — exports `SessionService`.

**BFF — modified:**
- `apps/bff/src/modules/cart/cart.service.ts` — per-session `Map` instead
  of a singleton array.
- `apps/bff/src/modules/cart/cart.service.spec.ts` — every call gains a
  `sessionId` argument; one new isolation test.
- `apps/bff/src/modules/cart/cart.controller.ts` — resolves the session id
  per request via `SessionService`.
- `apps/bff/src/modules/cart/cart.module.ts` — imports `SessionModule`;
  header comment updated.
- `apps/bff/src/modules/checkout/checkout.service.ts` — `checkout()` takes
  a leading `sessionId` argument.
- `apps/bff/src/modules/checkout/checkout.service.spec.ts` — every call
  gains a `sessionId` argument.
- `apps/bff/src/modules/checkout/checkout.controller.ts` — resolves the
  session id per request.
- `apps/bff/src/modules/checkout/checkout.module.ts` — imports
  `SessionModule`.
- `apps/bff/src/modules/visualization/visualization.service.ts` — drops
  the `CartService` dependency and all cart-derived scene/legacy-item
  output entirely.
- `apps/bff/src/modules/visualization/visualization.service.spec.ts` —
  cart-related tests removed/updated to match.
- `apps/bff/src/modules/visualization/visualization.module.ts` — drops the
  `CartModule` import.

**Tooling:**
- `scripts/pg/http.py` — `request_json` gains an optional `cookie_jar`
  parameter.
- `scripts/pg/smoke.py` — one shared `http.cookiejar.CookieJar()` threaded
  through the whole run.

**e2e:**
- `tests/e2e/tests/session-isolation.spec.ts` — new spec against the real
  BFF (no route mocking); requires `./dev up` running.

**Docs:**
- `docs/architecture/web-entry-point.md` — new "Session cookie" section.
- `CLAUDE.md` — Phase 2 status line updated; the "Open: cart/session
  evolution" item is resolved.

---

### Task 1: `SessionService` — resolve/mint the session id

**Files:**
- Create: `apps/bff/src/core/session/session.service.ts`
- Create: `apps/bff/src/core/session/session.service.spec.ts`
- Create: `apps/bff/src/core/session/session.module.ts`

**Interfaces:**
- Produces: `SessionService.resolveSessionId(req: Request, res: Response):
  string` — the interface every later task's controllers call.

- [ ] **Step 1: Write the failing tests**

Create `apps/bff/src/core/session/session.service.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { SessionService } from "./session.service";

function makeReq(cookieHeader?: string): Request {
  return { headers: { cookie: cookieHeader } } as unknown as Request;
}

function makeRes() {
  return { cookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
  };
}

describe("SessionService", () => {
  it("mints and sets a new session id when no cookie is present", () => {
    const service = new SessionService();
    const req = makeReq(undefined);
    const res = makeRes();

    const sessionId = service.resolveSessionId(req, res);

    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
    expect(res.cookie).toHaveBeenCalledOnce();
    expect(res.cookie).toHaveBeenCalledWith(
      "sid",
      sessionId,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("returns the existing session id unchanged when the cookie is present", () => {
    const service = new SessionService();
    const req = makeReq("sid=existing-session-id; other=value");
    const res = makeRes();

    const sessionId = service.resolveSessionId(req, res);

    expect(sessionId).toBe("existing-session-id");
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("finds the sid cookie regardless of position among other cookies", () => {
    const service = new SessionService();
    const req = makeReq("other=value; sid=middle-session-id; third=z");
    const res = makeRes();

    expect(service.resolveSessionId(req, res)).toBe("middle-session-id");
  });

  it("mints a new id when the sid cookie is present but empty", () => {
    const service = new SessionService();
    const req = makeReq("sid=; other=value");
    const res = makeRes();

    const sessionId = service.resolveSessionId(req, res);

    expect(sessionId.length).toBeGreaterThan(0);
    expect(res.cookie).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run session.service.spec.ts`
Expected: FAIL — `session.service.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/bff/src/core/session/session.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

const SESSION_COOKIE = "sid";

// Cart/session evolution: resolves the caller's session id from the `sid`
// cookie, minting and setting one if absent. Manual cookie parsing (no
// `cookie-parser` middleware) — the BFF only ever needs to read this one
// cookie, so a small dependency-free parse is simpler than wiring a
// library for it. `res.cookie()` for *setting* is already available via
// `@nestjs/platform-express` (Express), no new dependency needed there
// either.
@Injectable()
export class SessionService {
  resolveSessionId(req: Request, res: Response): string {
    const existing = this.readCookie(req.headers.cookie, SESSION_COOKIE);
    if (existing) {
      return existing;
    }
    const sessionId = randomUUID();
    // path: '/' (not a narrower prefix like '/api/bff') — the BFF only
    // ever sees its own bare route paths ('/cart/items', '/checkout'),
    // never the '/api/bff' prefix the browser uses through the Next.js
    // proxy (the rewrite strips it before the request arrives here). Both
    // the proxied browser and direct callers (scripts/pg/smoke.py, k6)
    // need path '/' to see this cookie on the paths they actually request.
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    return sessionId;
  }

  private readCookie(
    header: string | undefined,
    name: string,
  ): string | undefined {
    if (!header) {
      return undefined;
    }
    const prefix = `${name}=`;
    for (const part of header.split(";")) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        const value = trimmed.slice(prefix.length);
        return value.length > 0 ? decodeURIComponent(value) : undefined;
      }
    }
    return undefined;
  }
}
```

Create `apps/bff/src/core/session/session.module.ts`:

```ts
// Not @Global — consumers must explicitly import this module, matching
// the DomainEventsModule pattern in the sibling core/ directory.

import { Module } from "@nestjs/common";
import { SessionService } from "./session.service";

@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run session.service.spec.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/core/session/
git commit -m "feat(bff): add SessionService for cart/session evolution"
```

---

### Task 2: `CartService` — per-session state

**Files:**
- Modify: `apps/bff/src/modules/cart/cart.service.ts`
- Modify: `apps/bff/src/modules/cart/cart.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `add(sessionId, payload)`, `get(sessionId)`,
  `updateQuantity(sessionId, itemId, quantity)`, `remove(sessionId,
  itemId)`, `clear(sessionId)`, `currentItems(sessionId)`,
  `lastChangedAt(sessionId)` — every method gains a **leading**
  `sessionId: string` parameter. Consumed by Task 3
  (`CartController`) and Task 4 (`CheckoutService`).

- [ ] **Step 1: Write the failing test**

In `apps/bff/src/modules/cart/cart.service.spec.ts`, add a
`SESSION_A`/`SESSION_B` pair of constants near the top (after the
`PRODUCT` constant):

```ts
const SESSION_A = "sid_test_a";
const SESSION_B = "sid_test_b";
```

Update every existing call in the file to pass `SESSION_A` as the first
argument. The full updated file:

```ts
import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { CatalogService } from "../catalog/catalog.service";
import { CartService } from "./cart.service";

const PRODUCT = {
  productId: "prod_espresso",
  sku: "ESP-001",
  name: "Espresso",
  description: "Short and strong",
  category: "coffee" as const,
  price: { amountMinor: 180, currency: "EUR" },
  inventory: 100,
};

const SESSION_A = "sid_test_a";
const SESSION_B = "sid_test_b";

function makeCatalog() {
  return {
    getById: vi.fn().mockReturnValue(PRODUCT),
  };
}

function makeDomainEvents() {
  return { emit: vi.fn() };
}

async function makeService(
  catalog: ReturnType<typeof makeCatalog> = makeCatalog(),
  domainEvents: ReturnType<typeof makeDomainEvents> = makeDomainEvents(),
) {
  const module = await Test.createTestingModule({
    providers: [
      CartService,
      { provide: CatalogService, useValue: catalog },
      { provide: DomainEventsService, useValue: domainEvents },
    ],
  }).compile();
  return module.get(CartService);
}

describe("CartService", () => {
  let service: CartService;
  let catalog: ReturnType<typeof makeCatalog>;
  let domainEvents: ReturnType<typeof makeDomainEvents>;

  beforeEach(async () => {
    catalog = makeCatalog();
    domainEvents = makeDomainEvents();
    service = await makeService(catalog, domainEvents);
  });

  describe("add()", () => {
    it("returns a cart with the added item", () => {
      const cart = service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.productId).toBe("prod_espresso");
      expect(cart.items[0]!.quantity).toBe(1);
      expect(cart.items[0]!.lineTotal).toEqual({ amountMinor: 180, currency: "EUR" });
    });

    it("emits a domain event", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("throws NotFoundException for an unknown product", () => {
      catalog.getById.mockImplementation(() => {
        throw new NotFoundException("product not found");
      });
      expect(() =>
        service.add(SESSION_A, { productId: "prod_unknown", quantity: 1 }),
      ).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when quantity is not 1", () => {
      expect(() =>
        service.add(SESSION_A, { productId: "prod_espresso", quantity: 2 }),
      ).toThrow(BadRequestException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("throws ConflictException on a second add while the cart is occupied", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      expect(() =>
        service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 }),
      ).toThrow(ConflictException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get(SESSION_A).items).toHaveLength(1);
    });

    it("two different sessions can each independently hold their own cup", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      service.add(SESSION_B, { productId: "prod_espresso", quantity: 1 });

      expect(service.get(SESSION_A).items).toHaveLength(1);
      expect(service.get(SESSION_B).items).toHaveLength(1);
      expect(service.get(SESSION_A).items[0]!.itemId).not.toBe(
        service.get(SESSION_B).items[0]!.itemId,
      );
    });
  });

  describe("updateQuantity()", () => {
    it("throws ConflictException once the cup is selected, regardless of requested quantity", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      const itemId = service.get(SESSION_A).items[0]!.itemId;
      expect(() => service.updateQuantity(SESSION_A, itemId, 2)).toThrow(ConflictException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get(SESSION_A).items[0]!.quantity).toBe(1);
    });

    it("throws NotFoundException for an unknown itemId", () => {
      expect(() => service.updateQuantity(SESSION_A, "ci_999", 1)).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe("remove()", () => {
    it("throws ConflictException once the cup is selected", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      const itemId = service.get(SESSION_A).items[0]!.itemId;
      expect(() => service.remove(SESSION_A, itemId)).toThrow(ConflictException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get(SESSION_A).items).toHaveLength(1);
    });

    it("throws NotFoundException for an unknown itemId", () => {
      expect(() => service.remove(SESSION_A, "ci_999")).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe("get()", () => {
    it("returns an empty cart initially", () => {
      const cart = service.get(SESSION_A);
      expect(cart.items).toHaveLength(0);
      expect(cart.total).toEqual({ amountMinor: 0, currency: "EUR" });
    });

    it("does not emit domain events", () => {
      service.get(SESSION_A);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("a session never seen before starts empty, same as any other", () => {
      expect(service.get("sid_never_seen").items).toHaveLength(0);
    });
  });

  describe("clear()", () => {
    it("only clears the given session, leaving others untouched", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      service.add(SESSION_B, { productId: "prod_espresso", quantity: 1 });

      service.clear(SESSION_A);

      expect(service.get(SESSION_A).items).toHaveLength(0);
      expect(service.get(SESSION_B).items).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run cart.service.spec.ts`
Expected: FAIL — `CartService`'s methods don't accept a `sessionId` yet
(TypeScript compile error surfaces as a test-run failure).

- [ ] **Step 3: Rewrite `cart.service.ts`**

Replace the full contents of `apps/bff/src/modules/cart/cart.service.ts`:

```ts
import { ConflictException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Money } from "@mini-commerce/shared-types";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { CatalogService } from "../catalog/catalog.service";
import type { AddCartItemDto } from "./cart.dto";
import type { Cart, CartItem } from "./cart.types";

// Fixed display label on every returned Cart — not a real per-cart
// identifier. Session isolation comes from the Map key (sessionId), not
// from this field; nothing currently reads it as anything other than a
// constant.
const CART_ID = "cart_demo";

interface SessionCart {
  items: CartItem[];
  nextItemSeq: number;
  lastChangedEpoch: number;
}

function emptySessionCart(): SessionCart {
  return { items: [], nextItemSeq: 1, lastChangedEpoch: 0 };
}

// Cart/session evolution: one cart per session id, in-memory, keyed by a
// Map instead of one process-wide singleton. Still fully in-memory and
// per-process — same "resets on BFF restart" design as before, just no
// longer shared across every browser hitting the BFF.
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private carts = new Map<string, SessionCart>();
  // Frozen clock keeps responses deterministic so smoke/contract tests are
  // stable across runs.
  private updatedAt = "2026-05-14T12:00:00.000Z";

  constructor(
    private readonly catalog: CatalogService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  lastChangedAt(sessionId: string): number {
    return this.getOrCreate(sessionId).lastChangedEpoch;
  }

  add(sessionId: string, payload: AddCartItemDto): Cart {
    const state = this.getOrCreate(sessionId);
    // CUP-001: the only allowed quantity is 1, and the only allowed cart
    // states are empty or one cup — enforced per session. No `await` runs
    // between these checks and the mutation below, so Node's
    // single-threaded execution makes this atomic across concurrent
    // requests for the same session without extra locking.
    if (payload.quantity !== 1) {
      throw new BadRequestException("quantity must be exactly 1");
    }
    if (state.items.length > 0) {
      throw new ConflictException(
        "cart already holds the one allowed cup; place the order or wait for it to clear",
      );
    }
    // Re-uses CatalogService through its public surface — same access path a
    // future extracted catalog service would use over the wire. Also doubles
    // as the "reject any other product identity" guard: the catalog holds
    // only one product, so any other productId 404s here.
    const product = this.catalog.getById(payload.productId);
    const lineTotal: Money = {
      amountMinor: product.price.amountMinor * payload.quantity,
      currency: product.price.currency,
    };
    const item: CartItem = {
      itemId: `ci_${String(state.nextItemSeq).padStart(3, "0")}`,
      productId: product.productId,
      name: product.name,
      unitPrice: product.price,
      quantity: payload.quantity,
      lineTotal,
    };
    state.nextItemSeq += 1;
    state.items = [...state.items, item];
    state.lastChangedEpoch = Date.now();
    this.logger.log(
      `cart add session=${sessionId} product=${product.productId} qty=${payload.quantity}`,
    );
    const cart = this.snapshot(state);
    this.domainEvents.emit();
    return cart;
  }

  get(sessionId: string): Cart {
    return this.snapshot(this.getOrCreate(sessionId));
  }

  // CUP-001: once the one cup is selected, the only normal product action is
  // Place Order. Quantity change is rejected transactionally at this layer,
  // not just hidden in the UI.
  updateQuantity(sessionId: string, itemId: string, quantity: number): Cart {
    const state = this.getOrCreate(sessionId);
    const exists = state.items.some((item) => item.itemId === itemId);
    if (!exists) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    throw new ConflictException(
      `cannot change quantity to ${quantity}; once selected, only Place Order is allowed`,
    );
  }

  // CUP-001: removal is rejected once the cup is selected — the cart can
  // only be cleared by a successful Place Order (see `clear()`, called
  // internally by CheckoutService).
  remove(sessionId: string, itemId: string): Cart {
    const state = this.getOrCreate(sessionId);
    const exists = state.items.some((item) => item.itemId === itemId);
    if (!exists) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    throw new ConflictException(
      "removal is not allowed once the cup is selected; place the order or wait for it to clear",
    );
  }

  // Consumed by CheckoutService after a successful checkout to reset state
  // for this session only.
  clear(sessionId: string): void {
    this.carts.set(sessionId, emptySessionCart());
  }

  // Internal helper used by CheckoutService to build the order from the
  // current cart without re-fetching products.
  currentItems(sessionId: string): ReadonlyArray<CartItem> {
    return this.getOrCreate(sessionId).items;
  }

  private getOrCreate(sessionId: string): SessionCart {
    let state = this.carts.get(sessionId);
    if (!state) {
      state = emptySessionCart();
      this.carts.set(sessionId, state);
    }
    return state;
  }

  private snapshot(state: SessionCart): Cart {
    const currency = state.items[0]?.unitPrice.currency ?? "EUR";
    const amountMinor = state.items.reduce(
      (sum, item) => sum + item.lineTotal.amountMinor,
      0,
    );
    const itemCount = state.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    return {
      cartId: CART_ID,
      items: state.items,
      itemCount,
      total: { amountMinor, currency },
      updatedAt: this.updatedAt,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run cart.service.spec.ts`
Expected: PASS, 15/15 (11 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/cart/cart.service.ts apps/bff/src/modules/cart/cart.service.spec.ts
git commit -m "feat(bff): make CartService per-session instead of a global singleton"
```

---

### Task 3: `CartController` + `CartModule` — wire `SessionService`

**Files:**
- Modify: `apps/bff/src/modules/cart/cart.controller.ts`
- Modify: `apps/bff/src/modules/cart/cart.module.ts`

**Interfaces:**
- Consumes: `SessionService.resolveSessionId(req, res): string` (Task 1),
  `CartService`'s session-scoped methods (Task 2).

- [ ] **Step 1: Rewrite `cart.controller.ts`**

Replace the full contents of `apps/bff/src/modules/cart/cart.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { SessionService } from "../../core/session/session.service";
import { AddCartItemDto, UpdateCartItemDto } from "./cart.dto";
import { CartService } from "./cart.service";
import type { Cart } from "./cart.types";

@Controller("cart")
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly session: SessionService,
  ) {}

  @Get()
  get(@Req() req: Request, @Res({ passthrough: true }) res: Response): Cart {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.cart.get(sessionId);
  }

  @Post("items")
  @HttpCode(201)
  addItem(
    @Body() body: AddCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Cart {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.cart.add(sessionId, body);
  }

  @Patch("items/:itemId")
  updateItem(
    @Param("itemId") itemId: string,
    @Body() body: UpdateCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Cart {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.cart.updateQuantity(sessionId, itemId, body.quantity);
  }

  @Delete("items/:itemId")
  removeItem(
    @Param("itemId") itemId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Cart {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.cart.remove(sessionId, itemId);
  }
}
```

- [ ] **Step 2: Rewrite `cart.module.ts`**

Replace the full contents of `apps/bff/src/modules/cart/cart.module.ts`:

```ts
// Cart domain module — fictional mini-commerce store.
//
// Responsibility: maintain a per-session in-memory cart for the
// playground (cart/session evolution — one cart per `sid` cookie, not one
// global cart).
// Public surface (current iteration — mocked):
//   - GET    /cart               — return the current session's cart
//   - POST   /cart/items         — add the one allowed product line
//   - PATCH  /cart/items/:itemId — always rejected once selected (CUP-001)
//   - DELETE /cart/items/:itemId — always rejected once selected (CUP-001)
//
// Depends on CatalogModule for product lookups via its public service
// surface, and SessionModule for session id resolution.
//
// TODO (next iterations):
//   - Back service with a Prisma-backed repository

import { Module } from "@nestjs/common";
import { DomainEventsModule } from "../../core/domain-events/domain-events.module";
import { SessionModule } from "../../core/session/session.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

@Module({
  imports: [CatalogModule, DomainEventsModule, SessionModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
```

- [ ] **Step 3: Verify the BFF builds and unit tests still pass**

Run: `pnpm --filter @mini-commerce/bff exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @mini-commerce/bff exec vitest run cart.service.spec.ts`
Expected: PASS (unchanged by this task — it only touches the controller and
module, not the service under test).

- [ ] **Step 4: Manual verification against a running BFF**

Run: `./dev up`, then:

```bash
curl -s -c /tmp/jar-a.txt -X POST http://localhost:3001/cart/items \
  -H 'content-type: application/json' -d '{"productId":"prod_espresso","quantity":1}'
curl -s -c /tmp/jar-b.txt -X POST http://localhost:3001/cart/items \
  -H 'content-type: application/json' -d '{"productId":"prod_espresso","quantity":1}'
```

Expected: the first call succeeds (201, cookie jar A gets a `sid`). The
second call — deliberately **no `-b` flag**, so it carries no cookie at
all and the BFF mints a brand-new session, saved into jar B — also
succeeds (201), proving two sessions don't collide. Re-run the second
curl's exact command a third time, this time adding `-b /tmp/jar-b.txt`
(reusing session B's now-established cookie) and confirm it now 409s
(session B's own cart is already occupied by its own prior add).

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/cart/cart.controller.ts apps/bff/src/modules/cart/cart.module.ts
git commit -m "feat(bff): resolve the session id per cart request"
```

---

### Task 4: `CheckoutService` — thread `sessionId` through

**Files:**
- Modify: `apps/bff/src/modules/checkout/checkout.service.ts`
- Modify: `apps/bff/src/modules/checkout/checkout.service.spec.ts`

**Interfaces:**
- Consumes: `CartService.currentItems(sessionId)`, `CartService.clear
  (sessionId)` (Task 2).
- Produces: `CheckoutService.checkout(sessionId: string, payload:
  CheckoutDto): Promise<CheckoutResponse>` — a **leading** `sessionId`
  parameter. Consumed by Task 5 (`CheckoutController`).

- [ ] **Step 1: Update the test file**

In `apps/bff/src/modules/checkout/checkout.service.spec.ts`, add a
`SESSION_ID` constant after the `ORDER` constant:

```ts
const SESSION_ID = "sid_test";
```

Then change every `service.checkout(PAYLOAD)` (and its `{ ...PAYLOAD,
idempotencyKey: ... }` variants) call in the file to
`service.checkout(SESSION_ID, PAYLOAD)` (and `service.checkout(SESSION_ID,
{ ...PAYLOAD, idempotencyKey: ... })`). There are 9 call sites — every
`it(...)` block in the `describe("checkout()", ...)` block that calls
`service.checkout`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run checkout.service.spec.ts`
Expected: FAIL — `checkout()` doesn't accept a leading `sessionId` yet.

- [ ] **Step 3: Update `checkout.service.ts`**

Change the method signature and both `this.cart.currentItems()` /
`this.cart.clear()` call sites (there are three `clear()` calls total: one
in the `ConflictException` catch branch, one on the success path):

```ts
  async checkout(sessionId: string, payload: CheckoutDto): Promise<CheckoutResponse> {
```

```ts
    const items = this.cart.currentItems(sessionId);
```

```ts
      if (err instanceof ConflictException) {
        this.cart.clear(sessionId);
```

```ts
    this.cart.clear(sessionId);
```

(Leave every other line — the idempotent-replay logic, the
`BadRequestException` for an empty cart, the `orders.create()` call, the
logging, `toResponse()` — completely unchanged. Only the method signature
and these two call sites change.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run checkout.service.spec.ts`
Expected: PASS, 11/11.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/checkout/checkout.service.ts apps/bff/src/modules/checkout/checkout.service.spec.ts
git commit -m "feat(bff): thread sessionId through CheckoutService.checkout()"
```

---

### Task 5: `CheckoutController` + `CheckoutModule` — wire `SessionService`

**Files:**
- Modify: `apps/bff/src/modules/checkout/checkout.controller.ts`
- Modify: `apps/bff/src/modules/checkout/checkout.module.ts`

**Interfaces:**
- Consumes: `SessionService.resolveSessionId(req, res): string` (Task 1),
  `CheckoutService.checkout(sessionId, payload)` (Task 4).

- [ ] **Step 1: Rewrite `checkout.controller.ts`**

Replace the full contents of
`apps/bff/src/modules/checkout/checkout.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { SessionService } from "../../core/session/session.service";
import { CheckoutDto } from "./checkout.dto";
import { CheckoutService } from "./checkout.service";
import type { CheckoutResponse } from "./checkout.types";

@Controller("checkout")
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly session: SessionService,
  ) {}

  @Post()
  @HttpCode(201)
  create(
    @Body() body: CheckoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CheckoutResponse> {
    const sessionId = this.session.resolveSessionId(req, res);
    return this.checkout.checkout(sessionId, body);
  }
}
```

- [ ] **Step 2: Update `checkout.module.ts`**

In `apps/bff/src/modules/checkout/checkout.module.ts`, add the
`SessionModule` import and add it to the `imports` array:

```ts
import { Module } from "@nestjs/common";
import { DomainEventsModule } from "../../core/domain-events/domain-events.module";
import { SessionModule } from "../../core/session/session.module";
import { CartModule } from "../cart/cart.module";
import { OrdersModule } from "../orders/orders.module";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";

@Module({
  imports: [CartModule, OrdersModule, DomainEventsModule, SessionModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
```

- [ ] **Step 3: Verify the BFF builds and unit tests still pass**

Run: `pnpm --filter @mini-commerce/bff exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @mini-commerce/bff test`
Expected: all files PASS (full suite — this is the last BFF-internal task
before the visualization rework, a good point to confirm nothing else
regressed).

- [ ] **Step 4: Manual verification**

With `./dev up` running and the two cookie jars from Task 3's Step 4 still
around (or create fresh ones the same way): confirm session A can check
out (`POST /checkout` with `-b /tmp/jar-a.txt`, body `{}`, expect 201) and
that session B's cart (added in Task 3) is untouched afterward (`curl -s -b
/tmp/jar-b.txt http://localhost:3001/cart` still shows 1 item).

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/checkout/checkout.controller.ts apps/bff/src/modules/checkout/checkout.module.ts
git commit -m "feat(bff): resolve the session id per checkout request"
```

---

### Task 6: `VisualizationService` — drop the cart dependency entirely

**Files:**
- Modify: `apps/bff/src/modules/visualization/visualization.service.ts`
- Modify: `apps/bff/src/modules/visualization/visualization.service.spec.ts`
- Modify: `apps/bff/src/modules/visualization/visualization.module.ts`

**Interfaces:**
- Produces: `VisualizationService`'s constructor drops its `CartService`
  parameter entirely (now `(catalog, orders, assets)`, was `(catalog,
  orders, cart, assets)`). `scene.cart` is unconditionally `null`;
  `items[]` no longer contains a `viz_cart_demo` entry.

`VisualizationService` runs on an SSE/poll loop with no per-request
context — it has no way to resolve a `sessionId` now that the cart is
session-scoped. This is not a workaround forced awkwardly by that fact:
CUP-005 in the spec already requires the eventual foreground hero to come
only from the interactive-selection signal, never from raw cart state, so
the generic "cart marker" this service renders today was already going to
be retired by the P1 visualizer work. This task just moves that
retirement earlier.

- [ ] **Step 1: Rewrite `visualization.service.spec.ts`**

Replace the full contents of
`apps/bff/src/modules/visualization/visualization.service.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Product } from "../catalog/catalog.types";
import type { Order } from "../orders/orders.types";
import { VisualizationService } from "./visualization.service";

const VALID_TYPES = new Set(["cube", "sphere", "marker"]);
const VALID_STATUSES = new Set(["ok", "warn", "error", "idle"]);
const VALID_ORDER_STATUSES = new Set(["pending", "preparing", "prepared", "cancelled"]);

const PRODUCTS: Product[] = [
  {
    productId: "prod_espresso",
    sku: "SKU-ESP-01",
    name: "Espresso",
    description: "Single shot.",
    category: "drink",
    price: { amountMinor: 180, currency: "EUR" },
    inventory: 120,
  },
  {
    productId: "prod_backpack",
    sku: "SKU-BPK-01",
    name: "Backpack",
    description: "Canvas backpack.",
    category: "accessory",
    price: { amountMinor: 4500, currency: "EUR" },
    inventory: 8,
  },
];

const ORDERS: Order[] = [
  {
    orderId: "ord_demo",
    customerName: "Demo Customer",
    status: "pending",
    lines: [
      {
        productId: "prod_espresso",
        name: "Espresso",
        quantity: 2,
        unitPrice: { amountMinor: 180, currency: "EUR" },
        lineTotal: { amountMinor: 360, currency: "EUR" },
      },
    ],
    total: { amountMinor: 360, currency: "EUR" },
    placedAt: "2026-05-14T12:00:00.000Z",
    updatedAt: "2026-05-14T12:00:00.000Z",
  },
];

function makeSvc({
  products = PRODUCTS,
  orders = ORDERS,
  assetConfig = null,
  assetModel = null,
}: {
  products?: Product[] | (() => never);
  orders?: Order[] | (() => never);
  assetConfig?: Record<string, number> | null;
  assetModel?: { assetUrl: string; assetFormat: string } | null;
} = {}) {
  const catalog = {
    list: typeof products === "function" ? vi.fn().mockImplementation(products) : vi.fn().mockReturnValue({ items: products }),
  };
  const ordersService = {
    listAll: typeof orders === "function" ? vi.fn().mockImplementation(orders) : vi.fn().mockReturnValue(orders),
  };
  const assets = {
    getConfig: vi.fn().mockReturnValue(assetConfig),
    getPrimaryModel: vi.fn().mockReturnValue(assetModel),
  };
  return new VisualizationService(catalog as any, ordersService as any, assets as any);
}

describe("VisualizationService", () => {
  describe("legacy items[]", () => {
    it("returns items from catalog and orders", () => {
      const { items } = makeSvc().list();
      // 2 products + 1 order
      expect(items.length).toBe(3);
    });

    it("every item conforms to the VisualizationItem DTO shape", () => {
      const { items } = makeSvc().list();
      for (const item of items) {
        expect(typeof item.id).toBe("string");
        expect(item.id.length).toBeGreaterThan(0);
        expect(typeof item.label).toBe("string");
        expect(item.label.length).toBeGreaterThan(0);
        expect(VALID_TYPES.has(item.type)).toBe(true);
        expect(typeof item.value).toBe("number");
        expect(Number.isFinite(item.value)).toBe(true);
        expect(VALID_STATUSES.has(item.status)).toBe(true);
        expect(Number.isFinite(item.positionHint.x)).toBe(true);
        expect(Number.isFinite(item.positionHint.y)).toBe(true);
        expect(Number.isFinite(item.positionHint.z)).toBe(true);
        expect(typeof item.metadata).toBe("object");
      }
    });

    it("product items are cubes", () => {
      const { items } = makeSvc().list();
      const productItems = items.filter((i) => i.id.startsWith("viz_product_"));
      expect(productItems).toHaveLength(2);
      expect(productItems.every((i) => i.type === "cube")).toBe(true);
    });

    it("product status reflects inventory level", () => {
      const { items } = makeSvc().list();
      const espresso = items.find((i) => i.id === "viz_product_prod_espresso");
      const backpack = items.find((i) => i.id === "viz_product_prod_backpack");
      expect(espresso?.status).toBe("ok");   // inventory 120
      expect(backpack?.status).toBe("warn"); // inventory 8 < 20
    });

    it("order items are spheres with status mapped from order status", () => {
      const { items } = makeSvc().list();
      const orderItem = items.find((i) => i.id === "viz_order_ord_demo");
      expect(orderItem?.type).toBe("sphere");
      expect(orderItem?.status).toBe("warn"); // pending → warn
    });

    it("cancelled order maps to error status", () => {
      const cancelled: Order = { ...ORDERS[0], status: "cancelled" };
      const { items } = makeSvc({ orders: [cancelled] }).list();
      expect(items.find((i) => i.id === "viz_order_ord_demo")?.status).toBe("error");
    });

    it("all positions are within room bounds", () => {
      const { items } = makeSvc({ products: PRODUCTS.concat(...Array(5).fill(PRODUCTS[0])) }).list();
      for (const item of items) {
        expect(item.positionHint.x).toBeGreaterThanOrEqual(-2.5);
        expect(item.positionHint.x).toBeLessThanOrEqual(2.5);
        expect(item.positionHint.z).toBeGreaterThanOrEqual(-2.5);
        expect(item.positionHint.z).toBeLessThanOrEqual(2.5);
        expect(item.positionHint.y).toBeGreaterThan(0);
      }
    });

    it("output is deterministic across calls with the same inputs", () => {
      const svc = makeSvc();
      const first = svc.list();
      const second = svc.list();
      expect(second.items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));
      expect(second.items.map((i) => i.positionHint)).toEqual(first.items.map((i) => i.positionHint));
    });

    it("returns orders when catalog throws (partial failure)", () => {
      const svc = makeSvc({ products: () => { throw new Error("catalog down"); } });
      const { items } = svc.list();
      expect(items.some((i) => i.id.startsWith("viz_order_"))).toBe(true);
      expect(items.some((i) => i.id.startsWith("viz_product_"))).toBe(false);
    });

    it("returns catalog when orders throws (partial failure)", () => {
      const svc = makeSvc({ orders: () => { throw new Error("orders down"); } });
      const { items } = svc.list();
      expect(items.some((i) => i.id.startsWith("viz_product_"))).toBe(true);
      expect(items.some((i) => i.id.startsWith("viz_order_"))).toBe(false);
    });

    it("attaches assetConfig as a JSON string to drink products", () => {
      const params = { bodyH: 0.36, texSize: 16 };
      const { items } = makeSvc({ assetConfig: params }).list();
      const espresso = items.find((i) => i.id === "viz_product_prod_espresso");
      expect(espresso?.metadata.assetConfig).toBe(JSON.stringify(params));
    });

    it("attaches GLB assetUrl + assetFormat to drink products when a primary model exists", () => {
      const { items } = makeSvc({
        assetModel: { assetUrl: "/viz/models/cup.glb", assetFormat: "glb" },
      }).list();
      const espresso = items.find((i) => i.id === "viz_product_prod_espresso");
      expect(espresso?.metadata.assetUrl).toBe("/viz/models/cup.glb");
      expect(espresso?.metadata.assetFormat).toBe("glb");
    });

    it("omits asset metadata when no config or model is registered", () => {
      const { items } = makeSvc().list();
      const espresso = items.find((i) => i.id === "viz_product_prod_espresso");
      expect(espresso?.metadata.assetConfig).toBeUndefined();
      expect(espresso?.metadata.assetUrl).toBeUndefined();
    });
  });

  describe("scene (semantic contract)", () => {
    it("returns a scene next to items[]", () => {
      const response = makeSvc().list();
      expect(response.scene).toBeDefined();
      expect(response.scene.products).toBeInstanceOf(Array);
      expect(response.scene.recentOrders).toBeInstanceOf(Array);
      expect(response.scene.orderAggregates).toBeDefined();
      expect(typeof response.scene.latestActivityAt).toBe("number");
    });

    it("scene.products carries one entry per catalog product with derived status", () => {
      const { scene } = makeSvc().list();
      expect(scene.products).toHaveLength(2);
      const espresso = scene.products.find((p) => p.productId === "prod_espresso");
      const backpack = scene.products.find((p) => p.productId === "prod_backpack");
      expect(espresso?.status).toBe("ok");
      expect(backpack?.status).toBe("warn");
      expect(espresso?.price).toEqual({ amountMinor: 180, currency: "EUR" });
    });

    it("scene.products attaches typed asset + assetConfig when AssetsService provides them", () => {
      const params = { bodyH: 0.36 };
      const model = { assetUrl: "/viz/models/cup.glb", assetFormat: "glb" };
      const { scene } = makeSvc({ assetConfig: params, assetModel: model }).list();
      const espresso = scene.products.find((p) => p.productId === "prod_espresso");
      expect(espresso?.asset).toEqual({ url: "/viz/models/cup.glb", format: "glb" });
      expect(espresso?.assetConfig).toEqual(params);
    });

    it("scene.products omits asset and assetConfig when none are registered", () => {
      const { scene } = makeSvc().list();
      const espresso = scene.products.find((p) => p.productId === "prod_espresso");
      expect(espresso?.asset).toBeUndefined();
      expect(espresso?.assetConfig).toBeUndefined();
    });

    it("scene.recentOrders carries SceneOrder entries with vizStatus mapping", () => {
      const { scene } = makeSvc().list();
      expect(scene.recentOrders).toHaveLength(1);
      const ord = scene.recentOrders[0];
      expect(ord.orderId).toBe("ord_demo");
      expect(VALID_ORDER_STATUSES.has(ord.status)).toBe(true);
      expect(ord.vizStatus).toBe("warn"); // pending → warn
      expect(ord.lineCount).toBe(1);
    });

    it("scene.recentOrders is capped at the RECENT_ORDER_WINDOW (10) most recent by updatedAt", () => {
      const many: Order[] = Array.from({ length: 14 }, (_, i) => ({
        ...ORDERS[0],
        orderId: `ord_${String(i).padStart(2, "0")}`,
        updatedAt: new Date(2026, 0, i + 1).toISOString(),
      }));
      const { scene } = makeSvc({ orders: many }).list();
      expect(scene.recentOrders).toHaveLength(10);
      // Newest first.
      expect(scene.recentOrders[0].orderId).toBe("ord_13");
      expect(scene.recentOrders[9].orderId).toBe("ord_04");
    });

    it("scene.orderAggregates math: totalCount + olderCount + statusCounts", () => {
      const orders: Order[] = [
        { ...ORDERS[0], orderId: "ord_a", status: "pending" },
        { ...ORDERS[0], orderId: "ord_b", status: "preparing" },
        { ...ORDERS[0], orderId: "ord_c", status: "prepared" },
        { ...ORDERS[0], orderId: "ord_d", status: "cancelled" },
        { ...ORDERS[0], orderId: "ord_e", status: "pending" },
      ];
      const { scene } = makeSvc({ orders }).list();
      expect(scene.orderAggregates.totalCount).toBe(5);
      expect(scene.orderAggregates.olderCount).toBe(0); // 5 ≤ window 10
      expect(scene.orderAggregates.statusCounts).toEqual({
        pending: 2,
        preparing: 1,
        prepared: 1,
        cancelled: 1,
      });
    });

    it("scene.orderAggregates.olderCount accounts for orders beyond the recent window", () => {
      const many: Order[] = Array.from({ length: 14 }, (_, i) => ({
        ...ORDERS[0],
        orderId: `ord_${i}`,
        updatedAt: new Date(2026, 0, i + 1).toISOString(),
      }));
      const { scene } = makeSvc({ orders: many }).list();
      expect(scene.orderAggregates.totalCount).toBe(14);
      expect(scene.orderAggregates.olderCount).toBe(4);
    });

    it("scene.cart is always null — the cart is session-scoped and this service has no request context", () => {
      const { scene } = makeSvc().list();
      expect(scene.cart).toBeNull();
    });

    it("scene.latestActivityAt is the newest order updatedAt", () => {
      const { scene } = makeSvc().list();
      expect(scene.latestActivityAt).toBe(Date.parse(ORDERS[0].updatedAt));
    });

    it("scene survives catalog throwing (returns empty products)", () => {
      const svc = makeSvc({ products: () => { throw new Error("catalog down"); } });
      const { scene } = svc.list();
      expect(scene.products).toEqual([]);
      expect(scene.recentOrders.length).toBeGreaterThan(0);
    });

    it("scene survives orders throwing (returns empty recent + zeroed aggregates)", () => {
      const svc = makeSvc({ orders: () => { throw new Error("orders down"); } });
      const { scene } = svc.list();
      expect(scene.recentOrders).toEqual([]);
      expect(scene.orderAggregates).toEqual({
        totalCount: 0,
        olderCount: 0,
        statusCounts: { pending: 0, preparing: 0, prepared: 0, cancelled: 0 },
      });
      expect(scene.products.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run visualization.service.spec.ts`
Expected: FAIL — `makeSvc` now constructs `VisualizationService` with only
3 args, but the real class still expects 4 (`cart` in the third position).

- [ ] **Step 3: Rewrite `visualization.service.ts`**

Replace the full contents of
`apps/bff/src/modules/visualization/visualization.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import type { OrderStatus } from "@mini-commerce/shared-types";
import { AssetsService } from "../assets/assets.service";
import type { AssetModelRef, AssetParams } from "../assets/assets.types";
import { CatalogService } from "../catalog/catalog.service";
import type { Product } from "../catalog/catalog.types";
import { OrdersService } from "../orders/orders.service";
import type { Order } from "../orders/orders.types";
import type {
  OrderAggregates,
  PositionHint,
  SceneCart,
  SceneOrder,
  SceneProduct,
  VisualizationDataResponse,
  VisualizationItem,
  VisualizationItemStatus,
  VisualizationScene,
} from "./visualization.types";

// EOC-2: cap on the number of orders the BFF surfaces individually. Anything
// beyond this window collapses into `orderAggregates.olderCount` so the
// visualizer's permanent geometry stays bounded as history grows.
const RECENT_ORDER_WINDOW = 10;

function emptyStatusCounts(): Record<OrderStatus, number> {
  return { pending: 0, preparing: 0, prepared: 0, cancelled: 0 };
}

// `metadata` is Readonly<Record<string, string | number>>, so AssetConfig
// rides as a JSON string and the GLB ref is split into two string fields.
// Legacy `items[]` path only — the new `scene` payload carries typed objects.
function assetMetadata(
  config: AssetParams | null,
  model: AssetModelRef | null,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (config) out.assetConfig = JSON.stringify(config);
  if (model) {
    out.assetUrl = model.assetUrl;
    out.assetFormat = model.assetFormat;
  }
  return out;
}

// Layout: two non-overlapping sectors within the 6×6 room.
//   Products (cubes)  — back-left quadrant,  x ∈ [-2.2, 0.6],  z ∈ [-2.2, 0.6]
//   Orders  (spheres) — right strip,          x ∈ [ 1.4, 2.3],  z ∈ [-2.0, …]
// All values stay within the clamp range the frontend applies (±2.5).

function productPosition(index: number): PositionHint {
  return {
    x: -2.2 + (index % 3) * 1.4,
    y: 0.35,
    z: -2.2 + Math.floor(index / 3) * 1.4,
  };
}

function orderPosition(index: number): PositionHint {
  return {
    x: 1.4 + (index % 2) * 0.9,
    y: 0.5,
    z: -2.0 + Math.floor(index / 2) * 1.5,
  };
}

function productStatus(inventory: number): VisualizationItemStatus {
  if (inventory === 0) return "error";
  if (inventory < 20) return "warn";
  return "ok";
}

function orderStatus(status: Order["status"]): VisualizationItemStatus {
  switch (status) {
    case "pending":
      return "warn";
    case "preparing":
    case "prepared":
      return "ok";
    case "cancelled":
      return "error";
    default:
      return "idle";
  }
}

// `updatedAt` is epoch ms. The visualizer compares these across items to pick
// the "latest user action" hero. Products use 0 so the catalogue can never
// outrank an order event for the spotlight.
function fromProduct(
  product: Product,
  index: number,
  config: AssetParams | null,
  model: AssetModelRef | null,
): VisualizationItem {
  return {
    id: `viz_product_${product.productId}`,
    label: product.name,
    type: "cube",
    value: product.price.amountMinor,
    status: productStatus(product.inventory),
    positionHint: productPosition(index),
    metadata: {
      category: product.category,
      price: product.price.amountMinor,
      currency: product.price.currency,
      inventory: product.inventory,
      source: "catalog",
      updatedAt: 0,
      ...assetMetadata(config, model),
    },
  };
}

function fromOrder(order: Order, index: number): VisualizationItem {
  const updatedAtEpoch = Date.parse(order.updatedAt);
  const customerDisplay = order.customerName ?? "(no name)";
  return {
    id: `viz_order_${order.orderId}`,
    label: `${order.orderId} · ${customerDisplay}`,
    type: "sphere",
    value: order.total.amountMinor,
    status: orderStatus(order.status),
    positionHint: orderPosition(index),
    metadata: {
      orderStatus: order.status,
      customerName: customerDisplay,
      lineCount: order.lines.length,
      total: order.total.amountMinor,
      currency: order.total.currency,
      placedAt: order.placedAt,
      source: "orders",
      updatedAt: Number.isFinite(updatedAtEpoch) ? updatedAtEpoch : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Scene builders — EOC-2 typed shape. The visualizer chooses meshes, colors,
// and positions; the BFF only describes meaning.
// ---------------------------------------------------------------------------

function toSceneProduct(
  product: Product,
  config: AssetParams | null,
  model: AssetModelRef | null,
): SceneProduct {
  return {
    productId: product.productId,
    name: product.name,
    category: product.category,
    inventory: product.inventory,
    price: product.price,
    status: productStatus(product.inventory),
    ...(model
      ? { asset: { url: model.assetUrl, format: model.assetFormat } }
      : {}),
    ...(config ? { assetConfig: config } : {}),
  };
}

function toSceneOrder(order: Order): SceneOrder {
  return {
    orderId: order.orderId,
    customerName: order.customerName,
    status: order.status,
    vizStatus: orderStatus(order.status),
    total: order.total,
    lineCount: order.lines.length,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
  };
}

function aggregateOrders(orders: ReadonlyArray<Order>): OrderAggregates {
  const counts = emptyStatusCounts();
  for (const o of orders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  }
  const recentCount = Math.min(orders.length, RECENT_ORDER_WINDOW);
  return {
    totalCount: orders.length,
    olderCount: orders.length - recentCount,
    statusCounts: counts,
  };
}

function maxOrderUpdatedAt(orders: ReadonlyArray<Order>): number {
  let max = 0;
  for (const o of orders) {
    const t = Date.parse(o.updatedAt);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

@Injectable()
export class VisualizationService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
    private readonly assets: AssetsService,
  ) {}

  list(): VisualizationDataResponse {
    return {
      items: [...this.catalogItems(), ...this.orderItems()],
      scene: this.buildScene(),
    };
  }

  private catalogItems(): VisualizationItem[] {
    try {
      return this.catalog.list().items.map((product, index) =>
        fromProduct(
          product,
          index,
          this.assets.getConfig(product.category),
          this.assets.getPrimaryModel(product.category),
        ),
      );
    } catch {
      return [];
    }
  }

  private orderItems(): VisualizationItem[] {
    try {
      return this.orders.listAll().map(fromOrder);
    } catch {
      return [];
    }
  }

  // EOC-2 — typed semantic scene. Partial-failure rules match the legacy
  // catalogItems/orderItems blocks: each source is independent; a thrown
  // read from one source leaves the other intact.
  //
  // `scene.cart` is always null. The cart became session-scoped (cart/
  // session evolution) and this poll/SSE-driven service has no request
  // context to resolve a session from. CUP-004/CUP-005 (canonical scene
  // projection, foreground hero) define what eventually replaces it; there
  // is no cart-derived scene item until then.
  private buildScene(): VisualizationScene {
    let products: SceneProduct[] = [];
    try {
      products = this.catalog.list().items.map((p) =>
        toSceneProduct(
          p,
          this.assets.getConfig(p.category),
          this.assets.getPrimaryModel(p.category),
        ),
      );
    } catch {
      products = [];
    }

    let allOrders: ReadonlyArray<Order> = [];
    try {
      allOrders = this.orders.listAll();
    } catch {
      allOrders = [];
    }
    const sortedOrders = [...allOrders].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    const recentOrders = sortedOrders
      .slice(0, RECENT_ORDER_WINDOW)
      .map(toSceneOrder);
    const orderAggregates = aggregateOrders(sortedOrders);
    const ordersLatest = maxOrderUpdatedAt(sortedOrders);

    const cart: SceneCart | null = null;

    return {
      products,
      recentOrders,
      orderAggregates,
      cart,
      latestActivityAt: ordersLatest,
    };
  }
}
```

- [ ] **Step 4: Update `visualization.module.ts`**

Replace the full contents of
`apps/bff/src/modules/visualization/visualization.module.ts`:

```ts
// Visualization module — feeds the visualizer-3d service with DTO data.
//
// Responsibility: expose a read-only HTTP contract that the visualizer can
// consume. The visualizer never reads the database; it always goes through
// this module.
//
// Public surface:
//   - GET /visualization-data — aggregates catalog and orders into a flat
//     VisualizationItem[] the frontend renders as 3D primitives.

import { Module } from "@nestjs/common";
import { DomainEventsModule } from "../../core/domain-events/domain-events.module";
import { AssetsModule } from "../assets/assets.module";
import { CatalogModule } from "../catalog/catalog.module";
import { OrdersModule } from "../orders/orders.module";
import { VisualizationController } from "./visualization.controller";
import { VisualizationService } from "./visualization.service";

@Module({
  imports: [DomainEventsModule, CatalogModule, OrdersModule, AssetsModule],
  controllers: [VisualizationController],
  providers: [VisualizationService],
  exports: [VisualizationService],
})
export class VisualizationModule {}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run visualization.service.spec.ts`
Expected: PASS, 25/25 (13 legacy items[] + 12 scene).

Run: `pnpm --filter @mini-commerce/bff exec tsc --noEmit`
Expected: no errors (confirms no other file still constructs
`VisualizationService` with a 4th `cart` argument or imports `CartModule`
into `VisualizationModule` — there are none per the plan's research, but
this is the check that proves it).

- [ ] **Step 6: Commit**

```bash
git add apps/bff/src/modules/visualization/
git commit -m "feat(bff): retire the cart-derived scene item; VisualizationService no longer depends on CartService"
```

---

### Task 7: `scripts/pg/http.py` + `scripts/pg/smoke.py` — cookie-jar aware

**Files:**
- Modify: `scripts/pg/http.py`
- Modify: `scripts/pg/smoke.py`

**Interfaces:**
- Produces: `request_json(..., cookie_jar: Optional[http.cookiejar
  .CookieJar] = None)` — a new optional trailing parameter, fully
  backward-compatible (every other caller in `scripts/pg/` — `hack.py` —
  is unaffected since it never passes it).

- [ ] **Step 1: Add `cookie_jar` support to `request_json`**

In `scripts/pg/http.py`, add the import at the top (after the existing
`import socket`):

```python
import http.cookiejar
```

Replace the `request_json` function:

```python
def request_json(
    url: str,
    method: str = "GET",
    body: Optional[dict] = None,
    expect_status: Optional[int] = None,
    timeout: float = 5.0,
    cookie_jar: Optional[http.cookiejar.CookieJar] = None,
) -> Tuple[int, Optional[dict]]:
    data: Optional[bytes] = None
    headers = {"accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["content-type"] = "application/json"

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    handlers = [urllib.request.HTTPCookieProcessor(cookie_jar)] if cookie_jar is not None else []
    opener = urllib.request.build_opener(*handlers)
    try:
        with opener.open(req, timeout=timeout) as resp:
            status = resp.status
            raw = resp.read()
    except urllib.error.HTTPError as err:
        # Server responded — still meaningful for status assertions.
        status = err.code
        raw = err.read() if err.fp is not None else b""
    except (urllib.error.URLError, socket.timeout) as err:
        raise HttpError(str(err)) from err

    if expect_status is not None and status != expect_status:
        raise HttpError(f"Expected HTTP {expect_status}, got {status}")

    if not raw:
        return status, None
    try:
        return status, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return status, None
```

(Only the function body changed — `read_sse_data_frame` and `_Monotonic`
are untouched.)

- [ ] **Step 2: Verify `hack.py` (the other caller) still works unmodified**

Run: `pnpm --filter @mini-commerce/bff exec tsc --noEmit` is not relevant
here (Python file) — instead run the orchestrator's own test suite:
`pnpm pg:test` (or `python3 -m pytest scripts/pg/tests` — check
`scripts/pg/tests/` for the exact invocation the repo uses; CLAUDE.md
documents `pnpm pg:test`).
Expected: PASS — `hack.py` never passes `cookie_jar`, so
`build_opener()` with zero extra handlers behaves identically to the
previous direct `urllib.request.urlopen` call (Python's `build_opener()`
always includes the standard base handler set).

- [ ] **Step 3: Thread a shared cookie jar through `smoke.py`**

Replace the full contents of `scripts/pg/smoke.py`:

```python
"""smoke — hit every active endpoint and verify status codes + SSE frame.
Mirrors playground.mjs:331 and ./dev:279. The endpoint list, expected
statuses, and SSE frame assertion are byte-equivalent.
"""

from __future__ import annotations

import http.cookiejar
from typing import Callable, List, Optional, Tuple

from pg.ansi import bold, dim, fail, green, header, pass_, red
from pg.http import HttpError, read_sse_data_frame, request_json
from pg.paths import API_BASE


def _check(label: str, fn: Callable[[], None]) -> bool:
    try:
        fn()
        pass_(label)
        return True
    except HttpError as err:
        fail(f"{label}  — {err}")
        return False
    except Exception as err:  # noqa: BLE001
        fail(f"{label}  — {err}")
        return False


def _expect(
    method: str,
    path: str,
    status: int,
    body: dict | None = None,
    cookie_jar: Optional[http.cookiejar.CookieJar] = None,
) -> Callable[[], None]:
    def go() -> None:
        request_json(
            f"{API_BASE}{path}",
            method=method,
            body=body,
            expect_status=status,
            cookie_jar=cookie_jar,
        )
    return go


def _resolve_cart_item_id(cookie_jar: http.cookiejar.CookieJar) -> str:
    try:
        _, payload = request_json(
            f"{API_BASE}/cart", expect_status=200, cookie_jar=cookie_jar,
        )
        if isinstance(payload, dict):
            items = payload.get("items") or []
            if items and isinstance(items[0], dict):
                value = items[0].get("itemId")
                if isinstance(value, str) and value:
                    return value
    except HttpError:
        pass
    return "ci_001"


def run() -> int:
    header("Playground Smoke Test")
    print(dim(f"Target: {API_BASE}"))
    print()

    results: List[bool] = []
    # One shared cookie jar for the whole run — cart/session evolution
    # made the cart per-session, so every check in this sequence must
    # reuse the same session (the same simulated "one browser") for the
    # add → mutate-rejected → checkout flow to mean anything.
    jar = http.cookiejar.CookieJar()

    results.append(_check("GET  /health", _expect("GET", "/health", 200, cookie_jar=jar)))
    results.append(_check("GET  /catalog/products",
                          _expect("GET", "/catalog/products", 200, cookie_jar=jar)))
    results.append(_check("GET  /catalog/products/prod_espresso",
                          _expect("GET", "/catalog/products/prod_espresso", 200, cookie_jar=jar)))
    results.append(_check("POST /cart/items",
                          _expect("POST", "/cart/items", 201,
                                  body={"productId": "prod_espresso", "quantity": 1},
                                  cookie_jar=jar)))
    results.append(_check("POST /cart/items (2nd, rejected — cart occupied)",
                          _expect("POST", "/cart/items", 409,
                                  body={"productId": "prod_espresso", "quantity": 1},
                                  cookie_jar=jar)))
    results.append(_check("GET  /cart", _expect("GET", "/cart", 200, cookie_jar=jar)))

    item_id = _resolve_cart_item_id(jar)
    results.append(_check(
        "PATCH /cart/items/:id (rejected — quantity change not allowed)",
        _expect("PATCH", f"/cart/items/{item_id}", 409, body={"quantity": 3}, cookie_jar=jar),
    ))
    results.append(_check(
        "DELETE /cart/items/:id (rejected — removal not allowed once selected)",
        _expect("DELETE", f"/cart/items/{item_id}", 409, cookie_jar=jar),
    ))
    results.append(_check(
        "POST /checkout (rejected — customerName not accepted)",
        _expect("POST", "/checkout", 400, body={"customerName": "Smoke Customer"}, cookie_jar=jar),
    ))
    results.append(_check(
        "POST /checkout",
        _expect("POST", "/checkout", 201, body={}, cookie_jar=jar),
    ))
    results.append(_check("GET  /orders/ord_demo",
                          _expect("GET", "/orders/ord_demo", 200, cookie_jar=jar)))
    results.append(_check(
        "POST /orders/ord_demo/manage (mark_prepared)",
        _expect("POST", "/orders/ord_demo/manage", 202, body={"action": "mark_prepared"}, cookie_jar=jar),
    ))

    def viz_data() -> None:
        _, payload = request_json(f"{API_BASE}/visualization-data", expect_status=200, cookie_jar=jar)
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list) or not payload["items"]:
            raise HttpError("Expected non-empty items array")
    results.append(_check("GET  /visualization-data", viz_data))

    def viz_scene() -> None:
        _, payload = request_json(f"{API_BASE}/visualization-data", expect_status=200, cookie_jar=jar)
        if not isinstance(payload, dict):
            raise HttpError("Expected an object payload")
        scene = payload.get("scene")
        if not isinstance(scene, dict):
            raise HttpError("Expected scene to be an object (EOC-2)")
        for key in ("products", "recentOrders", "orderAggregates", "latestActivityAt"):
            if key not in scene:
                raise HttpError(f"scene missing key: {key}")
        if not isinstance(scene["products"], list):
            raise HttpError("scene.products must be a list")
        if not isinstance(scene["recentOrders"], list):
            raise HttpError("scene.recentOrders must be a list")
        aggregates = scene["orderAggregates"]
        if not isinstance(aggregates, dict) or "totalCount" not in aggregates or "statusCounts" not in aggregates:
            raise HttpError("scene.orderAggregates malformed")
        # cart key is allowed to be null when itemCount=0
        if "cart" not in scene:
            raise HttpError("scene missing key: cart")
    results.append(_check("GET  /visualization-data (scene shape)", viz_scene))

    def sse() -> None:
        ok = read_sse_data_frame(f"{API_BASE}/visualization-updates", max_seconds=3.0)
        if not ok:
            raise HttpError("No SSE data frame received")
    results.append(_check("GET  /visualization-updates (SSE)", sse))

    print()
    passed = sum(1 for ok in results if ok)
    total = len(results)
    if passed == total:
        print(green(f"All {total} smoke checks passed."))
        print()
        return 0
    print(red(f"{passed}/{total} smoke checks passed."))
    print()
    print(dim("Ensure the BFF is running: ./dev up"))
    print()
    return 1
```

(This is the same 15-check sequence already on `main` — the only change is
every `_expect(...)` call now passes `cookie_jar=jar`, `_resolve_cart_item_id`
takes and uses the jar, and `jar = http.cookiejar.CookieJar()` is created
once at the top of `run()`.)

- [ ] **Step 4: Run smoke against a live BFF**

Run: `./dev up` (if not already running) then `./dev smoke`
Expected: `All 15 smoke checks passed.` — this now proves session
continuity end-to-end (the add/mutate-rejected/checkout sequence only
makes sense if every request in it shares one session).

- [ ] **Step 5: Commit**

```bash
git add scripts/pg/http.py scripts/pg/smoke.py
git commit -m "feat(pg): thread a shared cookie jar through the smoke sequence"
```

---

### Task 8: e2e — prove session isolation against the real BFF

**Files:**
- Create: `tests/e2e/tests/session-isolation.spec.ts`

**Interfaces:**
- Consumes: `StorefrontPage` (`tests/e2e/pages/StorefrontPage.ts`, unchanged
  — its methods already fit a full add → checkout flow against a real
  backend).

This is the one e2e spec in the suite that talks to the real BFF instead
of mocking `/api/bff/*` — every other current spec is unaffected by this
whole plan (none of them reach the real BFF, so none of them exercise real
cookie behavior either way).

- [ ] **Step 1: Write the spec**

Create `tests/e2e/tests/session-isolation.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { StorefrontPage } from '../pages/StorefrontPage';

// Exercises the REAL BFF — no route mocking. Requires `./dev up` running
// (Postgres + BFF healthy) before this spec executes; it is not covered
// by webServer in playwright.config.ts (that only starts the web app).
//
// Proves cart/session evolution: two independent browser contexts (each
// gets its own cookie jar from Playwright) can each hold and check out
// their own Cup of Coffee at the same time, with neither seeing a 409
// from the other's cart — which would happen today if the cart were
// still one global singleton.
test.describe('Session isolation (real BFF)', () => {
  test('two independent browser sessions can shop concurrently without colliding', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      const storefrontA = new StorefrontPage(await contextA.newPage());
      const storefrontB = new StorefrontPage(await contextB.newPage());

      await storefrontA.gotoCatalog();
      await storefrontB.gotoCatalog();

      await expect(storefrontA.catalogHeading()).toBeVisible();
      await expect(storefrontB.catalogHeading()).toBeVisible();

      // Session A adds the one product.
      await storefrontA.addProductToCart('Cup of Coffee');
      await expect(storefrontA.cartButton()).toHaveAccessibleName(
        'Shopping cart with 1 items',
      );

      // Session B is a completely independent browser context — this
      // would 409 today if the cart were still a single global singleton.
      await storefrontB.addProductToCart('Cup of Coffee');
      await expect(storefrontB.cartButton()).toHaveAccessibleName(
        'Shopping cart with 1 items',
      );

      // Session A checks out independently.
      await storefrontA.openCart();
      await storefrontA.proceedToCheckoutFromCartDrawer();
      await expect(storefrontA.placeOrderButton()).toBeEnabled();
      await storefrontA.placeOrder();
      await expect(storefrontA.orderSuccessAlert()).toBeVisible();
      const orderIdA = storefrontA.currentOrderId();

      // Session B's cart was never touched by A's checkout and can still
      // check out on its own.
      await storefrontB.openCart();
      await storefrontB.proceedToCheckoutFromCartDrawer();
      await expect(storefrontB.placeOrderButton()).toBeEnabled();
      await storefrontB.placeOrder();
      await expect(storefrontB.orderSuccessAlert()).toBeVisible();
      const orderIdB = storefrontB.currentOrderId();

      expect(orderIdA).not.toBe(orderIdB);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
```

- [ ] **Step 2: Run it**

Ensure `./dev up` is running (Postgres + BFF healthy — `./dev status` to
check), then from `tests/e2e/`:

Run: `pnpm exec playwright test session-isolation.spec.ts`
Expected: PASS, 1/1.

If it fails with connection errors, confirm `./dev up` is actually running
and the BFF is healthy before treating it as a real failure.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tests/session-isolation.spec.ts
git commit -m "test(e2e): prove two browser sessions can shop concurrently"
```

---

### Task 9: Docs — web-entry-point spoke + CLAUDE.md phase status

**Files:**
- Modify: `docs/architecture/web-entry-point.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Session cookie" section to the architecture spoke**

In `docs/architecture/web-entry-point.md`, insert a new section
immediately after the existing `## \`/api/bff\` proxy (web → BFF)` section
(i.e., right before `## \`/viz\` proxy (web → visualizer)`):

```markdown
## Session cookie (cart/session evolution)

- The BFF mints and reads an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie
  named `sid` on every cart/checkout request (`SessionService` in
  `apps/bff/src/core/session/`). Each session id keys its own cart in
  `CartService`'s in-memory `Map` — carts are no longer a single global
  singleton.
- No code in `apps/web` sets, reads, or forwards this cookie explicitly.
  Because the browser only ever talks to its own origin (`/api/bff/*`,
  same-origin through the proxy), `fetch()`'s default `credentials:
  'same-origin'` mode carries it automatically in both directions — the
  `Set-Cookie` the BFF issues reaches the browser, and the browser sends
  `Cookie` back on every subsequent `/api/bff/*` call, with zero
  configuration on the web app's side.
- Direct callers that bypass the proxy (`scripts/pg/smoke.py`, the `/dev`
  console's own fetches — which still go through the same-origin proxy,
  so this doesn't apply to them — and k6) see the BFF's bare route paths
  (`/cart/items`, not `/api/bff/cart/items`), which is exactly why the
  cookie's `Path` is `/` rather than a proxy-shaped prefix: a narrower
  path would silently stop matching for anyone not going through
  Next.js's rewrite.
- k6 does not currently maintain a cookie jar across requests within a
  scenario, so each of its calls lands in a fresh, empty session — a
  known, accepted gap tracked under the spec's CUP-009 (k6 stays out of
  this repo's scope; see `docs/superpowers/specs/2026-09-08-cart-session-evolution-design.md`).
```

- [ ] **Step 2: Update CLAUDE.md's Phase 2 status line**

Change:

```markdown
- **Phase 2** (in progress, ~done): Prisma+Postgres persistence, OpenTelemetry,
  unified Python orchestrator, observability stack, SSE for the visualizer,
  shared HTTP contracts. Open: cart/session evolution.
```

to:

```markdown
- **Phase 2** (in progress, ~done): Prisma+Postgres persistence, OpenTelemetry,
  unified Python orchestrator, observability stack, SSE for the visualizer,
  shared HTTP contracts, per-session carts.
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/web-entry-point.md CLAUDE.md
git commit -m "docs: document the session cookie; close CLAUDE.md's cart/session item"
```

---

### Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full BFF unit suite**

Run: `pnpm --filter @mini-commerce/bff test`
Expected: PASS. Tally: `catalog.service.spec.ts` 11, `cart.service.spec.ts`
15, `checkout.service.spec.ts` 11, `orders.service.spec.ts` 29,
`orders.controller.spec.ts` 6, `visualization.service.spec.ts` 25,
`health.service.spec.ts` 2, `assets.service.spec.ts` 7,
`workflow-traffic.service.spec.ts` 5, `workflow-traffic.controller.spec.ts`
5, `session.service.spec.ts` 4 — 120 total. (Was 122 before this plan:
+4 `session.service.spec.ts`, new file, Task 1; +4 `cart.service.spec.ts`
11→15, Task 2; −10 `visualization.service.spec.ts` 35→25, Task 6 — legacy
`items[]` loses 8 cart-marker/partial-failure tests, the scene block nets
−2 after two like-for-like replacements (cart-null and latestActivityAt
tests each swapped for a narrower equivalent, plus two pure removals);
`checkout.service.spec.ts` unchanged at 11, Task 4 only adds a `sessionId`
argument to existing calls, no new tests. 122+4+4−10 = 120 — verify the
actual total printed matches file-by-file rather than trusting this
arithmetic blindly.)

- [ ] **Step 2: Repo-wide typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS, 0 errors (pre-existing warnings elsewhere are not this
plan's concern).

- [ ] **Step 3: Integration suite**

Run: `pnpm --filter @mini-commerce/integration-tests run test:integration`
Expected: PASS, 3/3 — `checkout.integration.spec.ts` calls
`OrdersService.create()` directly (not through `CartService`/
`CheckoutService`), so it needs no changes and should be unaffected.

- [ ] **Step 4: Smoke**

Run: `./dev up && ./dev smoke`
Expected: `All 15 smoke checks passed.`

- [ ] **Step 5: Full e2e suite**

From `tests/e2e/`, with `./dev up` running:
Run: `pnpm exec playwright test`
Expected: PASS across every spec, including the new
`session-isolation.spec.ts`. Every other spec still mocks its own routes
and is unaffected by this plan.

- [ ] **Step 6: Manual browser walkthrough**

With `./dev up web` running (rebuild the image first if it's stale — see
the single-cup P0 plan's Task 16 report for why that matters):

1. Open two different browser profiles (or one regular + one incognito
   window) to `http://localhost:3000`.
2. In window 1: add the Cup of Coffee, confirm the cart shows 1 item.
3. In window 2: add the Cup of Coffee — confirm it succeeds (does **not**
   409), and window 2's cart independently shows 1 item.
4. Check out in window 1. Confirm window 2's cart is untouched (still
   shows its own 1 item) after refreshing window 2.
5. Check out in window 2 — confirm it succeeds independently.
6. Confirm `GET /orders` (or the `/orders` page) lists both orders.

- [ ] **Step 7: Final commit (if any stragglers)**

Only if Steps 1–6 turned up fixes not yet committed:

```bash
git add -A
git commit -m "chore: fix stragglers from cart/session evolution verification pass"
```

---

## Self-Review

**Spec coverage** — every section of the design spec maps to a task:
session identity & transport → Task 1; `CartService` per-session state →
Task 2; controllers/module wiring → Tasks 3, 5; `CheckoutService` →
Task 4; `VisualizationService`'s forced retirement of the cart scene item
→ Task 6; Tooling impact (`smoke.py`) → Task 7; Testing (isolation e2e) →
Task 8; the spec's own cross-references (CLAUDE.md, architecture doc) →
Task 9. Definition of Done items are each covered: two sessions
concurrently (Task 8 + Task 10 Step 6), no-cookie clean start (Task 2's
`getOrCreate`, tested in Task 2 Step 1's new "session never seen before"
test), orders/inventory untouched (verified by Task 4/6 leaving
`OrdersService` and inventory code completely unedited), smoke passing
(Task 7), green suite (Task 10).

**Placeholder scan** — no TBD/TODO/"add proper handling" anywhere in the
tasks; every step has literal, complete code.

**Type consistency** — `SessionService.resolveSessionId(req: Request, res:
Response): string` has the identical signature everywhere it's declared
(Task 1) and called (Tasks 3, 5). `CartService`'s method signatures
(`sessionId` always the leading parameter) are consistent between Task 2's
implementation and Task 3's controller call sites. `CheckoutService
.checkout(sessionId, payload)`'s parameter order matches between Task 4's
implementation and Task 5's controller call site.

**Scope check** — this plan implements only the design spec (session
scoping for cart/checkout, `VisualizationService`'s forced cart-scene
retirement, tooling/doc updates). It does not touch `OrdersService`,
`Product.inventory`, k6, or any interactive-selection/hero/rain logic —
those remain explicitly out of scope per the spec's own Non-goals section
and are left for the later CUP-003+ brainstorm this document was written
to unblock.
