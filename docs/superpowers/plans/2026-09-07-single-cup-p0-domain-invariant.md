# Single-Cup P0 Domain Invariant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the product stack (BFF + Web App) enforce the P0 slice of the
single-cup spec: the public catalog exposes exactly one product ("Cup of
Coffee"), the cart can only ever be empty or hold that one cup at quantity 1,
and Place Order is anonymous and terminal (no customer/recipient name is
collected, required, or synthesized anywhere in the flow).

**Architecture:** No new services or endpoints. Existing modules
(`catalog`, `cart`, `checkout`, `orders`) get their domain invariants
tightened at the service layer (not just the UI), backed by a Prisma schema
change (`Order.customerName` becomes nullable) and a reseed to a single
product. The shared `@mini-commerce/contracts` package and the Web App
follow the same contract change. Visualizer rendering, the interactive-
selection contract, always-on rain, and k6 scenario reduction are explicitly
**out of scope** — they belong to CUP-003 through CUP-010 (P1/P2) in the
spec's own backlog tiering.

**Tech Stack:** NestJS + Prisma + PostgreSQL (BFF), Next.js + React (Web),
Vitest (BFF unit + integration), Playwright (e2e), pnpm/turbo workspace.

**Spec:**
[`docs/specs/synchronized-single-cup-order-visualizer-and-live-rain.md`](../../specs/synchronized-single-cup-order-visualizer-and-live-rain.md)
— sections `CUP-001` and `CUP-002`, plus the P0 backlog tier under
"Prioritized implementation backlog". Executors should read those two
sections before starting.

## Global Constraints

- The only catalog product is named exactly `Cup of Coffee` (spec: Locked
  product decisions). Reuse the existing `prod_espresso` productId — do not
  invent a second product record.
- The only allowed quantity is `1` everywhere in the cart/checkout path.
- The only allowed cart states are empty or exactly one Cup of Coffee at
  quantity `1`.
- Checkout is anonymous: the Place Order request MUST contain no customer,
  recipient, or other human-name field, and such a field MUST be **rejected**
  (HTTP 400), not silently stripped or synthesized. This repo's BFF already
  runs a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted:
  true, transform: true })` (`apps/bff/src/main.ts:26`) — dropping
  `customerName` from `CheckoutDto` is sufficient to make the pipe reject it.
- The domain/service layer MUST enforce every invariant above
  transactionally — UI constraints alone are not sufficient (spec:
  CUP-001 Requirements).
- Existing fulfillment endpoints/statuses (`POST /orders/:id/manage`) MAY
  remain reachable; this plan does not touch `OrdersService.manage`.
- **Out of scope, do not touch:** any file under `tests/performance/k6/**`
  (scenario reduction is CUP-009, P1, and these scenario files may be
  migrating to a separate `k6-ts-docker` repo — confirm with the user before
  ever touching them), the interactive-selection contract (CUP-003), the
  Visualizer/BFF projection and rendering (CUP-004 through CUP-007), and the
  workflow-traffic removal (CUP-008).

---

## File Structure

**BFF:**
- `apps/bff/prisma/schema.prisma` — `Order.customerName` becomes nullable.
- `apps/bff/prisma/migrations/20260907130000_make_order_customer_name_optional/migration.sql`
  — new migration, `DROP NOT NULL`.
- `apps/bff/prisma/seed.ts` — seeds exactly one product, deletes any stale
  products from earlier seed runs.
- `apps/bff/src/modules/cart/cart.service.ts` — `add()`/`updateQuantity()`/
  `remove()` enforce the empty-or-one-cup invariant.
- `apps/bff/src/modules/cart/cart.service.spec.ts` — tests for the new
  rejections; the old multi-add/quantity-change/remove-success tests are
  replaced.
- `apps/bff/src/modules/catalog/catalog.controller.ts` — drop the
  `POST /catalog/products` route (unreachable, per spec's "existing generic
  structures MAY remain but MUST be unreachable" allowance).
- `apps/bff/src/modules/checkout/checkout.dto.ts` — drop `customerName`.
- `apps/bff/src/modules/checkout/checkout.types.ts` — `CheckoutResponse
  .customerName` becomes `string | null`.
- `apps/bff/src/modules/checkout/checkout.service.ts` — stops forwarding a
  customer name to `OrdersService.create`.
- `apps/bff/src/modules/checkout/checkout.service.spec.ts` — payloads drop
  `customerName`; assertions updated.
- `apps/bff/src/modules/orders/orders.types.ts` — `Order.customerName` and
  `CreateOrderInput.customerName` become `string | null` / optional.
- `apps/bff/src/modules/orders/orders.service.ts` — `create()` stores
  `null` when no name is supplied.

**Shared contracts:**
- `packages/contracts/src/index.ts` — `CheckoutRequest` drops
  `customerName`; `Order.customerName` and `CheckoutResponse.customerName`
  become `string | null`.

**Web app:**
- `apps/web/src/lib/api/mock-data.ts` — `createMockOrder()` drops its
  `customerName` parameter (demo-mode compile fix; the 7-product demo
  catalog itself is out of scope — it is a dev-only fixture, not "the public
  catalog" the spec constrains).
- `apps/web/app/checkout/page.tsx` — removes the name input and the
  `!customerName.trim()` disablement; submits `{}` (or `{ idempotencyKey }`).
- `apps/web/src/components/catalog/ProductQuickView.tsx` — removes the
  quantity stepper; always adds quantity `1`.
- `apps/web/src/components/cart/CartDrawer.tsx` — `CartItemRow` drops the
  quantity stepper and the remove button (both now always fail server-side
  once a cup is selected).
- `apps/web/app/orders/page.tsx`, `apps/web/app/orders/[orderId]/page.tsx`
  — drop the "Customer" field from order display (order is anonymous).

**e2e (Playwright, `tests/e2e/`):**
- `tests/e2e/pages/StorefrontPage.ts` — drop the name-input/orderCustomer
  helpers.
- `tests/e2e/tests/checkout-happy-path.spec.ts` — drop name-fill steps.
- `tests/e2e/tests/frontend-certification.spec.ts` — drop the quantity-
  stepper interaction and the name-fill step.
- `tests/e2e/tests/visual-integrity.spec.ts` — drop the quantity-stepper and
  remove-button interactions and the name-fill step.

**Not touched by this plan** (verified during research): `tests/integration
/src/checkout.integration.spec.ts` (calls `OrdersService.create` directly
with a `customerName` string, which stays valid once the field is optional),
`apps/bff/src/modules/orders/orders.service.spec.ts` and `orders.controller
.spec.ts` (already pass a string customerName, still valid), `tests/e2e
/tests/purchase.spec.ts` and `homepage-workspace.spec.ts` (no name-field or
quantity-stepper interactions).

---

### Task 1: Prisma schema — make `Order.customerName` nullable

**Files:**
- Modify: `apps/bff/prisma/schema.prisma`
- Create: `apps/bff/prisma/migrations/20260907130000_make_order_customer_name_optional/migration.sql`

**Interfaces:**
- Produces: the generated `@prisma/client` `Order` type gets
  `customerName: string | null`, which Task 8/9's TypeScript changes depend
  on.

- [ ] **Step 1: Edit the schema**

In `apps/bff/prisma/schema.prisma`, inside `model Order`, change:

```prisma
  customerName     String
```

to:

```prisma
  // Anonymous checkout (CUP-002): no name is collected or required. Nullable
  // rather than removed so historical orders keep their stored value.
  customerName     String?
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/bff/prisma/migrations/20260907130000_make_order_customer_name_optional/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "customerName" DROP NOT NULL;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm --filter @mini-commerce/bff run prisma:generate`
Expected: succeeds, no DB connection required for `generate`.

- [ ] **Step 4: Verify the generated type**

Run: `grep -A2 "customerName" apps/bff/node_modules/.prisma/client/index.d.ts | head -6`
Expected: shows `customerName: string | null` on the `Order` model type.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/prisma/schema.prisma apps/bff/prisma/migrations/20260907130000_make_order_customer_name_optional
git commit -m "feat(bff): make Order.customerName nullable for anonymous checkout"
```

---

### Task 2: Seed — expose exactly one product, "Cup of Coffee"

**Files:**
- Modify: `apps/bff/prisma/seed.ts`

**Interfaces:**
- Produces: after running, `Product` table contains exactly one row
  (`productId: "prod_espresso"`, `name: "Cup of Coffee"`). Tasks 3+ assume
  this is the only seeded product.

- [ ] **Step 1: Replace the `PRODUCTS` array and add cleanup**

In `apps/bff/prisma/seed.ts`, replace lines 5–13 (the `PRODUCTS` array) with:

```ts
const PRODUCTS = [
  {
    productId: "prod_espresso",
    sku: "SKU-ESP-01",
    name: "Cup of Coffee",
    description: "The one orderable product in this slice.",
    category: "drink",
    priceAmountMinor: 180,
    priceCurrency: "EUR",
    inventory: 120,
  },
];
```

Then, inside `async function main()`, immediately before the `for (const
product of PRODUCTS)` loop, add a cleanup step so a dev DB seeded by an
older version of this script converges to the single-product invariant:

```ts
  // CUP-001: the public catalog MUST return exactly one product. Delete any
  // product seeded by an older version of this script — OrderLine stores a
  // denormalized productId/name snapshot, so this is safe even if historical
  // orders reference a productId that no longer exists in Product.
  await prisma.product.deleteMany({
    where: { productId: { not: "prod_espresso" } },
  });
```

- [ ] **Step 2: Run the seed against the local dev DB**

Run: `./dev up` (starts Postgres if not already running), then
`pnpm --filter @mini-commerce/bff run prisma:migrate` (applies Task 1's
migration), then `pnpm --filter @mini-commerce/bff run prisma:seed`
Expected: log line `Seeded 1 products.`

- [ ] **Step 3: Verify via the running BFF**

Run: `curl -s http://localhost:3001/catalog/products | jq '.items | length, .[0].name'`
Expected: `1` then `"Cup of Coffee"`.

- [ ] **Step 4: Commit**

```bash
git add apps/bff/prisma/seed.ts
git commit -m "feat(bff): seed exactly one product, Cup of Coffee"
```

---

### Task 3: `CartService` — enforce the empty-or-one-cup invariant

This is the core CUP-001 domain enforcement. Because `CartService` is an
in-process singleton and `add()`/`updateQuantity()`/`remove()` run
synchronously start-to-finish (no `await` between the invariant check and
the mutation), Node's single-threaded event loop makes the check-then-set
atomic across concurrent HTTP requests without any extra locking — this is
what satisfies the spec's "a concurrent double-add cannot leave more than
one cup selected" acceptance criterion.

**Files:**
- Modify: `apps/bff/src/modules/cart/cart.service.ts`
- Test: `apps/bff/src/modules/cart/cart.service.spec.ts`

**Interfaces:**
- Consumes: `CatalogService.getById(productId): Product` (throws
  `NotFoundException` for unknown ids — unchanged, and now doubles as the
  "reject any other product identity" check for free since the catalog only
  contains one product after Task 2).
- Produces: `CartService.add()` throws `BadRequestException` for
  `quantity !== 1`, `ConflictException` when the cart already holds an item;
  `updateQuantity()`/`remove()` throw `ConflictException` whenever the
  target item exists (only `NotFoundException` for a genuinely unknown
  `itemId` is unchanged).

- [ ] **Step 1: Write the failing tests**

In `apps/bff/src/modules/cart/cart.service.spec.ts`, add these imports at
the top (alongside the existing `NotFoundException` import):

```ts
import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";
```

Replace the `describe("add()", ...)` block's body with:

```ts
  describe("add()", () => {
    it("returns a cart with the added item", () => {
      const cart = service.add({ productId: "prod_espresso", quantity: 1 });
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.productId).toBe("prod_espresso");
      expect(cart.items[0]!.quantity).toBe(1);
      expect(cart.items[0]!.lineTotal).toEqual({ amountMinor: 180, currency: "EUR" });
    });

    it("emits a domain event", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("throws NotFoundException for an unknown product", () => {
      catalog.getById.mockImplementation(() => {
        throw new NotFoundException("product not found");
      });
      expect(() => service.add({ productId: "prod_unknown", quantity: 1 })).toThrow(
        NotFoundException,
      );
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when quantity is not 1", () => {
      expect(() => service.add({ productId: "prod_espresso", quantity: 2 })).toThrow(
        BadRequestException,
      );
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("throws ConflictException on a second add while the cart is occupied", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      expect(() => service.add({ productId: "prod_espresso", quantity: 1 })).toThrow(
        ConflictException,
      );
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get().items).toHaveLength(1);
    });
  });
```

Replace the `describe("updateQuantity()", ...)` block's body with:

```ts
  describe("updateQuantity()", () => {
    it("throws ConflictException once the cup is selected, regardless of requested quantity", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      const itemId = service.get().items[0]!.itemId;
      expect(() => service.updateQuantity(itemId, 2)).toThrow(ConflictException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get().items[0]!.quantity).toBe(1);
    });

    it("throws NotFoundException for an unknown itemId", () => {
      expect(() => service.updateQuantity("ci_999", 1)).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });
```

Replace the `describe("remove()", ...)` block's body with:

```ts
  describe("remove()", () => {
    it("throws ConflictException once the cup is selected", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      const itemId = service.get().items[0]!.itemId;
      expect(() => service.remove(itemId)).toThrow(ConflictException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get().items).toHaveLength(1);
    });

    it("throws NotFoundException for an unknown itemId", () => {
      expect(() => service.remove("ci_999")).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run cart.service.spec.ts`
Expected: FAIL — the new `BadRequestException`/`ConflictException`
expectations fail because `CartService` still allows multi-add and
quantity/remove mutations.

- [ ] **Step 3: Implement the invariant in `CartService`**

In `apps/bff/src/modules/cart/cart.service.ts`, add the exception imports:

```ts
import { ConflictException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
```

Replace the start of `add()` (before the existing `const product = ...`
line) so the method reads:

```ts
  add(payload: AddCartItemDto): Cart {
    // CUP-001: the only allowed quantity is 1, and the only allowed cart
    // states are empty or one cup. No `await` runs between these checks and
    // the mutation below, so Node's single-threaded execution makes this
    // atomic across concurrent requests without extra locking.
    if (payload.quantity !== 1) {
      throw new BadRequestException("quantity must be exactly 1");
    }
    if (this.items.length > 0) {
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
      itemId: `ci_${String(this.nextItemSeq).padStart(3, "0")}`,
      productId: product.productId,
      name: product.name,
      unitPrice: product.price,
      quantity: payload.quantity,
      lineTotal,
    };
    this.nextItemSeq += 1;
    this.items = [...this.items, item];
    this.lastChangedEpoch = Date.now();
    this.logger.log(
      `cart add product=${product.productId} qty=${payload.quantity}`,
    );
    const cart = this.snapshot();
    this.domainEvents.emit();
    return cart;
  }
```

Replace `updateQuantity()` entirely with:

```ts
  // CUP-001: once the one cup is selected, the only normal product action is
  // Place Order. Quantity change is rejected transactionally at this layer,
  // not just hidden in the UI.
  updateQuantity(itemId: string, quantity: number): Cart {
    const exists = this.items.some((item) => item.itemId === itemId);
    if (!exists) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    throw new ConflictException(
      `cannot change quantity to ${quantity}; once selected, only Place Order is allowed`,
    );
  }
```

Replace `remove()` entirely with:

```ts
  // CUP-001: removal is rejected once the cup is selected — the cart can
  // only be cleared by a successful Place Order (see `clear()`, called
  // internally by CheckoutService).
  remove(itemId: string): Cart {
    const exists = this.items.some((item) => item.itemId === itemId);
    if (!exists) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    throw new ConflictException(
      "removal is not allowed once the cup is selected; place the order or wait for it to clear",
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run cart.service.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/bff/src/modules/cart/cart.service.ts apps/bff/src/modules/cart/cart.service.spec.ts
git commit -m "feat(bff): enforce empty-or-one-cup invariant in CartService"
```

---

### Task 4: `CatalogController` — remove the product-creation route

**Files:**
- Modify: `apps/bff/src/modules/catalog/catalog.controller.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /catalog/products` is unreachable (404). `CatalogService
  .create()` and `CreateProductDto` are left in place — `catalog.service
  .spec.ts` still exercises `create()` directly, per the spec's "existing
  generic structures MAY remain... but MUST be unreachable as broader public
  behavior" allowance.

- [ ] **Step 1: Remove the route**

In `apps/bff/src/modules/catalog/catalog.controller.ts`, delete the
`@Post("products")` handler (lines 20–23):

```ts
  @Post("products")
  create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.catalog.create(dto);
  }
```

Remove the now-unused `Body`, `Post`, and `CreateProductDto` imports, leaving:

```ts
import { Controller, Get, Param } from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import type { Product, ProductsResponse } from "./catalog.types";
```

- [ ] **Step 2: Verify the BFF still builds and the remaining unit tests pass**

Run: `pnpm --filter @mini-commerce/bff exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @mini-commerce/bff exec vitest run catalog.service.spec.ts`
Expected: PASS — unchanged, since `create()` is still called directly.

- [ ] **Step 3: Manually confirm the route is gone**

Run (with `./dev up` running): `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/catalog/products -H 'content-type: application/json' -d '{}'`
Expected: `404`.

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/modules/catalog/catalog.controller.ts
git commit -m "fix(bff): remove the unreachable-by-design product-creation route"
```

---

### Task 5: `orders.types.ts` / `orders.service.ts` — nullable/optional customer name

**Files:**
- Modify: `apps/bff/src/modules/orders/orders.types.ts`
- Modify: `apps/bff/src/modules/orders/orders.service.ts`

**Interfaces:**
- Produces: `Order.customerName: string | null`; `CreateOrderInput
  .customerName?: string | null`. `OrdersService.create()` stores `null`
  when the caller omits the field.
- Consumed by: Task 6 (`CheckoutService`), unchanged by
  `orders.service.spec.ts` / `orders.controller.spec.ts` (both already pass
  a string, which remains a valid value).

- [ ] **Step 1: Widen the types**

In `apps/bff/src/modules/orders/orders.types.ts`, change:

```ts
export interface Order {
  readonly orderId: string;
  readonly customerName: string;
```

to:

```ts
export interface Order {
  readonly orderId: string;
  // CUP-002: checkout is anonymous. Null once a Place Order request supplies
  // no name; historical orders may still carry a stored value.
  readonly customerName: string | null;
```

and change:

```ts
export interface CreateOrderInput {
  readonly customerName: string;
```

to:

```ts
export interface CreateOrderInput {
  readonly customerName?: string | null;
```

- [ ] **Step 2: Store `null` explicitly in `create()`**

In `apps/bff/src/modules/orders/orders.service.ts`, inside the
`tx.order.create({ data: { ... } })` call, change:

```ts
                customerName: input.customerName,
```

to:

```ts
                customerName: input.customerName ?? null,
```

- [ ] **Step 3: Verify existing order tests still pass unchanged**

Run: `pnpm --filter @mini-commerce/bff exec vitest run orders.service.spec.ts orders.controller.spec.ts`
Expected: PASS — these already pass a string `customerName`, which remains
a valid value under the widened type.

- [ ] **Step 4: Commit**

```bash
git add apps/bff/src/modules/orders/orders.types.ts apps/bff/src/modules/orders/orders.service.ts
git commit -m "feat(bff): widen Order.customerName to string | null"
```

---

### Task 6: `CheckoutDto` / `CheckoutService` — anonymous, terminal Place Order

**Files:**
- Modify: `apps/bff/src/modules/checkout/checkout.dto.ts`
- Modify: `apps/bff/src/modules/checkout/checkout.types.ts`
- Modify: `apps/bff/src/modules/checkout/checkout.service.ts`
- Test: `apps/bff/src/modules/checkout/checkout.service.spec.ts`

**Interfaces:**
- Consumes: `OrdersService.create(input: CreateOrderInput)` (Task 5's
  widened type — `customerName` is no longer required).
- Produces: `POST /checkout` accepts `{ idempotencyKey?: string }` only.
  Supplying `customerName` (or any other unlisted field) is rejected with
  400 by the existing global `ValidationPipe({ forbidNonWhitelisted: true
  })` — no new validator code is needed for the rejection itself.

- [ ] **Step 1: Write the failing tests**

In `apps/bff/src/modules/checkout/checkout.service.spec.ts`, replace the
`ORDER` fixture's `customerName: "Test Customer"` with `customerName: null`,
and replace the `describe("checkout()", ...)` block's `const PAYLOAD = {
customerName: "Test Customer" };` line with:

```ts
    const PAYLOAD = {};
```

Then update these three tests inside that `describe` block:

Replace:

```ts
    it("calls orders.create with lines derived from cart items", async () => {
      await service.checkout(PAYLOAD);
      expect(orders.create).toHaveBeenCalledOnce();
      expect(orders.create).toHaveBeenCalledWith({
        customerName: "Test Customer",
        lines: [
```

with:

```ts
    it("calls orders.create with lines derived from cart items and no customer name", async () => {
      await service.checkout(PAYLOAD);
      expect(orders.create).toHaveBeenCalledOnce();
      expect(orders.create).toHaveBeenCalledWith({
        lines: [
```

(leave the rest of that test body — the `lines`/`unitPrice`/`lineTotal`
object and closing brackets — unchanged).

Replace:

```ts
    it("returns the expected CheckoutResponse shape", async () => {
      const response = await service.checkout(PAYLOAD);
      expect(response).toMatchObject({
        orderId: "ord_001",
        cartId: "cart_demo",
        customerName: "Test Customer",
        status: "pending",
        total: { amountMinor: 360, currency: "EUR" },
      });
      expect(typeof response.placedAt).toBe("string");
    });
```

with:

```ts
    it("returns the expected CheckoutResponse shape", async () => {
      const response = await service.checkout(PAYLOAD);
      expect(response).toMatchObject({
        orderId: "ord_001",
        cartId: "cart_demo",
        customerName: null,
        status: "pending",
        total: { amountMinor: 360, currency: "EUR" },
      });
      expect(typeof response.placedAt).toBe("string");
    });
```

The remaining tests in the file (`throws BadRequestException...`, `clears
the cart...`, `emits a domain event...`, `passes idempotencyKey...`,
`replays an existing order...`, `does not surface 'cart is empty'...`) do
not reference `customerName` and need no changes — but since `PAYLOAD` is
now `{}`, confirm the `{ ...PAYLOAD, idempotencyKey: "..." }` spreads still
read correctly (they do, unchanged).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mini-commerce/bff exec vitest run checkout.service.spec.ts`
Expected: FAIL — `CheckoutDto` still requires `customerName`, so the type
doesn't compile / the service still forwards it.

- [ ] **Step 3: Drop `customerName` from `CheckoutDto`**

Replace the full contents of `apps/bff/src/modules/checkout/checkout.dto.ts`
with:

```ts
import { IsOptional, IsUUID } from "class-validator";

// CUP-002: checkout is anonymous. No customer, recipient, or other human
// name field is accepted — the global ValidationPipe's
// forbidNonWhitelisted rejects any request body that includes one.
export class CheckoutDto {
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
```

- [ ] **Step 4: Widen `CheckoutResponse.customerName`**

In `apps/bff/src/modules/checkout/checkout.types.ts`, change:

```ts
  readonly customerName: string;
```

to:

```ts
  readonly customerName: string | null;
```

- [ ] **Step 5: Stop forwarding a customer name in `CheckoutService`**

In `apps/bff/src/modules/checkout/checkout.service.ts`, in the `checkout()`
method, change:

```ts
    const order = await this.orders.create({
      customerName: payload.customerName,
      lines,
      total,
      clientRequestId: payload.idempotencyKey,
    });
```

to:

```ts
    const order = await this.orders.create({
      lines,
      total,
      clientRequestId: payload.idempotencyKey,
    });
```

And in the private `toResponse()` helper, change the parameter type from:

```ts
  private toResponse(order: { orderId: string; customerName: string; total: CheckoutResponse["total"]; placedAt: string }): CheckoutResponse {
```

to:

```ts
  private toResponse(order: { orderId: string; customerName: string | null; total: CheckoutResponse["total"]; placedAt: string }): CheckoutResponse {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run checkout.service.spec.ts`
Expected: PASS.

- [ ] **Step 7: Manually confirm rejection of a supplied name**

With `./dev up` running:

Run: `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/checkout -H 'content-type: application/json' -d '{"customerName":"Someone"}'`
Expected: `400` (rejected by `forbidNonWhitelisted`, cart is also empty at
this point so either 400 reason is acceptable — the key assertion is it is
never a 2xx).

- [ ] **Step 8: Commit**

```bash
git add apps/bff/src/modules/checkout/checkout.dto.ts apps/bff/src/modules/checkout/checkout.types.ts apps/bff/src/modules/checkout/checkout.service.ts apps/bff/src/modules/checkout/checkout.service.spec.ts
git commit -m "feat(bff): make Place Order anonymous and reject a supplied name"
```

---

### Task 7: `@mini-commerce/contracts` — update the shared wire types

**Files:**
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `CheckoutRequest` has no `customerName` field. `Order
  .customerName` and `CheckoutResponse.customerName` are `string | null`.
  These are the types `apps/web` imports; Task 8 depends on this.

- [ ] **Step 1: Edit the types**

In `packages/contracts/src/index.ts`, change:

```ts
export interface Order {
  readonly orderId: string;
  readonly customerName: string;
```

to:

```ts
export interface Order {
  readonly orderId: string;
  readonly customerName: string | null;
```

Change:

```ts
export interface CheckoutRequest {
  readonly customerName: string;
  readonly idempotencyKey?: string;
}
```

to:

```ts
export interface CheckoutRequest {
  readonly idempotencyKey?: string;
}
```

Change:

```ts
export interface CheckoutResponse {
  readonly orderId: string;
  readonly cartId: string;
  readonly customerName: string;
```

to:

```ts
export interface CheckoutResponse {
  readonly orderId: string;
  readonly cartId: string;
  readonly customerName: string | null;
```

- [ ] **Step 2: Build the package and verify no local type errors**

Run: `pnpm --filter @mini-commerce/contracts run build` (or `typecheck` if
that script exists instead — check `packages/contracts/package.json`
first and use whichever is defined)
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): drop CheckoutRequest.customerName, widen Order.customerName"
```

---

### Task 8: Web — `expresso-api.ts` / `mock-data.ts` compile fix

This task exists purely to keep the Web App compiling against Task 7's
contract change before the UI tasks (9–12) land. The 7-product demo-mode
catalog is intentionally left alone — it is a dev-only fixture behind
`NEXT_PUBLIC_DEMO_MODE`, not "the public catalog" CUP-001 constrains.

**Files:**
- Modify: `apps/web/src/lib/api/mock-data.ts`

**Interfaces:**
- Produces: `createMockOrder()` takes no arguments and stores `customerName:
  null`, matching the new `Order` type.

- [ ] **Step 1: Drop the parameter**

In `apps/web/src/lib/api/mock-data.ts`, change:

```ts
export function createMockOrder(customerName: string): CheckoutResponse {
```

to:

```ts
export function createMockOrder(): CheckoutResponse {
```

Inside that function, change both occurrences of `customerName,` (the
`order` object literal and the returned `CheckoutResponse` literal) to
`customerName: null,`.

- [ ] **Step 2: Update the caller**

In `apps/web/src/lib/api/expresso-api.ts`, change:

```ts
    return createMockOrder(input.customerName);
```

to:

```ts
    return createMockOrder();
```

- [ ] **Step 3: Verify the web app typechecks**

Run: `pnpm --filter @mini-commerce/web run typecheck` (if no such script,
run `pnpm --filter @mini-commerce/web exec tsc --noEmit`)
Expected: no errors referencing `mock-data.ts`, `expresso-api.ts`, or
`customerName` (later tasks fix the remaining call sites in page
components).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/mock-data.ts apps/web/src/lib/api/expresso-api.ts
git commit -m "fix(web): drop the mock checkout's customerName parameter"
```

---

### Task 9: Web — checkout page: remove the name field, submit anonymously

**Files:**
- Modify: `apps/web/app/checkout/page.tsx`

**Interfaces:**
- Consumes: `expressoApi.checkout(input: CheckoutInput)` — `CheckoutInput`
  no longer has `customerName` (Task 7).

- [ ] **Step 1: Drop the `customerName` state and disablement**

In `apps/web/app/checkout/page.tsx`, remove the line:

```ts
  const [customerName, setCustomerName] = useState('');
```

Change `handleSubmit`'s guard and call from:

```ts
    if (!customerName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await expressoApi.checkout({
        customerName: customerName.trim(),
      });
```

to:

```ts
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await expressoApi.checkout({});
```

- [ ] **Step 2: Remove the name input and its "Customer Information" section**

Delete the entire "Customer Information" header block:

```tsx
          <div 
            className="flex items-center gap-2 px-5 py-4 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <User className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
              Customer Information
            </span>
          </div>
```

and the label/input block:

```tsx
            <div>
              <label
                htmlFor="customerName"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                Your Name
              </label>
              <input
                type="text"
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                required
                autoFocus
                className="w-full px-4 py-3 rounded-lg border text-sm transition-all"
                style={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                }}
              />
              <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                This name will appear on your order confirmation.
              </p>
            </div>
```

- [ ] **Step 3: Update the submit button's disabled condition**

Change:

```tsx
            <button
              type="submit"
              disabled={isSubmitting || !customerName.trim()}
```

to:

```tsx
            <button
              type="submit"
              disabled={isSubmitting}
```

- [ ] **Step 4: Drop the now-unused `User` icon import**

Change the `lucide-react` import list to remove `User` (it was only used by
the section header just deleted):

```ts
import {
  ShoppingBag,
  CreditCard,
  Loader2,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Shield,
} from 'lucide-react';
```

- [ ] **Step 5: Typecheck and manually verify in the browser**

Run: `pnpm --filter @mini-commerce/web run typecheck`
Expected: no errors.

Run: `./dev up web`, open `http://localhost:3000`, add the Cup of Coffee to
the cart, go to `/checkout`.
Expected: no name field is present; "Place Order" is enabled immediately;
clicking it succeeds and lands on `/orders/:orderId`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/checkout/page.tsx
git commit -m "feat(web): remove the checkout name field; Place Order is anonymous"
```

---

### Task 10: Web — `ProductQuickView`: remove the quantity stepper

**Files:**
- Modify: `apps/web/src/components/catalog/ProductQuickView.tsx`

**Interfaces:**
- Produces: `addItem({ productId, quantity: 1 })` is always called with a
  literal `1` — no stepper, no local `quantity` state.

- [ ] **Step 1: Drop the quantity state and `maxQuantity`**

Remove:

```ts
  const [quantity, setQuantity] = useState(1);
```

and:

```ts
  const maxQuantity = Math.min(20, product.inventory);
```

- [ ] **Step 2: Call `addItem` with a literal quantity of 1**

Change:

```ts
      await addItem({ productId: product.productId, quantity });
```

to:

```ts
      await addItem({ productId: product.productId, quantity: 1 });
```

- [ ] **Step 3: Remove the quantity selector block**

Delete the entire block:

```tsx
          {/* Quantity selector */}
          {!isOutOfStock && (
            <div className="flex items-center gap-4">
              <label 
                className="text-sm font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                Quantity
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="p-2 rounded-md transition-colors disabled:opacity-50"
                  style={{ 
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--foreground)',
                  }}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span 
                  className="text-lg font-semibold w-12 text-center"
                  style={{ color: 'var(--foreground)' }}
                >
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                  className="p-2 rounded-md transition-colors disabled:opacity-50"
                  style={{ 
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--foreground)',
                  }}
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 4: Simplify the Add-to-Cart button label**

Change:

```tsx
              <>
                <Plus className="h-5 w-5" />
                <span>
                  Add to Cart
                  {quantity > 1 && ` (${quantity})`}
                </span>
              </>
```

to:

```tsx
              <>
                <Plus className="h-5 w-5" />
                <span>Add to Cart</span>
              </>
```

- [ ] **Step 5: Drop the now-unused `Minus` import**

Change the `lucide-react` import list to remove `Minus`:

```ts
import { X, Coffee, UtensilsCrossed, Package, Plus, Check, Loader2, AlertCircle } from 'lucide-react';
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @mini-commerce/web run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/catalog/ProductQuickView.tsx
git commit -m "feat(web): remove the quantity stepper from the product quick view"
```

---

### Task 11: Web — `CartDrawer`: remove quantity stepper and remove button

Once a cup is in the cart, `PATCH /cart/items/:id` and
`DELETE /cart/items/:id` now always 409 (Task 3). Presenting controls whose
only possible outcome is a rejection contradicts CUP-001's "the only normal
product action is Place Order" — so the controls are removed, not merely
left to fail.

**Files:**
- Modify: `apps/web/src/components/cart/CartDrawer.tsx`

**Interfaces:**
- Consumes: `useCart()` — `updateItem`/`removeItem` remain in
  `CartViewModel` (Task 12 does not touch `CartProvider.tsx`; they are just
  no longer called from this component).

- [ ] **Step 1: Simplify `CartItemRow`**

Replace the whole `CartItemRow` function (from `function CartItemRow({
item }: { item: CartItemType }) {` to its closing `}`) with:

```tsx
/**
 * Individual cart item row. Once a cup is selected, the only normal product
 * action is Place Order (CUP-001) — quantity and removal controls are not
 * shown because the BFF now rejects both once an item is in the cart.
 */
function CartItemRow({ item }: { item: CartItemType }) {
  return (
    <li className="p-4">
      <div className="flex gap-4">
        {/* Product placeholder */}
        <div
          className="w-16 h-16 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--secondary)' }}
          aria-hidden="true"
        >
          <ShoppingCart
            className="h-6 w-6"
            style={{ color: 'var(--muted-foreground)' }}
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <h3
            className="font-medium text-sm truncate"
            style={{ color: 'var(--foreground)' }}
          >
            {item.name}
          </h3>
          <div className="flex items-center justify-between mt-2">
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--foreground)' }}
            >
              Qty: {item.quantity}
            </span>
            <span
              className="font-medium text-sm"
              style={{ color: 'var(--foreground)' }}
            >
              {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Drop now-unused imports**

Change the top-level import from:

```ts
import { useRef, useState } from 'react';
import { X, ShoppingCart, Minus, Plus, Trash2, ArrowRight, Loader2 } from 'lucide-react';
```

to:

```ts
import { useRef } from 'react';
import { X, ShoppingCart, ArrowRight } from 'lucide-react';
```

(`useState` was only used inside the old `CartItemRow`; `Minus`, `Plus`,
`Trash2`, `Loader2` were only used by the removed stepper/remove/pending UI.
`useRef` is still used by `CartDrawer` itself for `drawerRef`.)

Also drop the now-unused `MAX_QUANTITY` constant near the top of the file:

```ts
const MAX_QUANTITY = 20;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mini-commerce/web run typecheck`
Expected: no errors, no unused-variable warnings from `CartDrawer.tsx`.

- [ ] **Step 4: Manually verify in the browser**

Run: `./dev up web`, add the Cup of Coffee to the cart, open the cart
drawer.
Expected: the row shows the product name, "Qty: 1", and the line total —
no stepper buttons, no trash icon.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/cart/CartDrawer.tsx
git commit -m "feat(web): drop quantity/remove controls from the cart drawer"
```

---

### Task 12: Web — order pages: drop the "Customer" field

**Files:**
- Modify: `apps/web/app/orders/page.tsx`
- Modify: `apps/web/app/orders/[orderId]/page.tsx`

**Interfaces:**
- Consumes: `Order.customerName: string | null` (Task 7) — after this task,
  nothing in `apps/web` reads `order.customerName`.

- [ ] **Step 1: Drop it from the orders list row**

In `apps/web/app/orders/page.tsx`, change:

```tsx
        <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
          {order.customerName} - {new Date(order.placedAt).toLocaleString()}
        </p>
```

to:

```tsx
        <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
          {new Date(order.placedAt).toLocaleString()}
        </p>
```

- [ ] **Step 2: Drop it from the order detail page**

In `apps/web/app/orders/[orderId]/page.tsx`, remove the "Customer"
`dt`/`dd` pair from the `<dl>`:

```tsx
            <div>
              <dt style={{ color: 'var(--muted-foreground)' }}>Customer</dt>
              <dd
                className="font-medium mt-0.5"
                style={{ color: 'var(--foreground)' }}
              >
                {order.customerName}
              </dd>
            </div>
```

and change the grid from `sm:grid-cols-2` to a 3-item layout — leave the
`grid` class as `grid sm:grid-cols-2` (still fine visually with 3 items
wrapping into a 2x2), no class change is needed.

- [ ] **Step 3: Typecheck and manually verify**

Run: `pnpm --filter @mini-commerce/web run typecheck`
Expected: no errors.

Run: `./dev up web`, place an order, view `/orders` and `/orders/:id`.
Expected: no "Customer" field is shown on either page.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/orders/page.tsx apps/web/app/orders/[orderId]/page.tsx
git commit -m "feat(web): drop the anonymous order's Customer display field"
```

---

### Task 13: e2e — `StorefrontPage.ts`: drop the name-field helpers

**Files:**
- Modify: `tests/e2e/pages/StorefrontPage.ts`

**Interfaces:**
- Produces: `customerNameInput()`, `fillCustomerName()`, and
  `orderCustomer()` are removed from the page object. Tasks 14/15 stop
  calling them.

- [ ] **Step 1: Remove the three methods**

Delete:

```ts
  customerNameInput(): Locator {
    return this.page.getByLabel("Your Name");
  }
```

```ts
  async fillCustomerName(customerName: string): Promise<void> {
    await this.customerNameInput().fill(customerName);
  }
```

```ts
  orderCustomer(customerName: string): Locator {
    return this.page.getByText(customerName, { exact: true });
  }
```

- [ ] **Step 2: Verify no remaining references in this file**

Run: `grep -n "customerName\|CustomerName" tests/e2e/pages/StorefrontPage.ts`
Expected: no output.

- [ ] **Step 3: Commit**

(Commit together with Task 14 — see that task's Step 5 — since this file
has no callers left once Task 14 lands and a standalone commit would leave
the e2e suite failing to compile in between.)

---

### Task 14: e2e — `checkout-happy-path.spec.ts`: drop name-fill steps

**Files:**
- Modify: `tests/e2e/tests/checkout-happy-path.spec.ts`

**Interfaces:**
- Consumes: `StorefrontPage` (Task 13's trimmed surface).

- [ ] **Step 1: Drop the name-field assertions from the happy-path test**

Change:

```ts
      const storefront = await prepareCheckout(page);
      const customerName = `E2E Shopper ${profile.name}`;

      await expect(storefront.checkoutSummaryHeading()).toBeVisible();
      await expect(storefront.checkoutLineItem(productUnderTest.name)).toBeVisible();
      await expect(storefront.placeOrderButton()).toBeDisabled();

      await expectActionable(storefront.customerNameInput());
      await storefront.fillCustomerName(customerName);
      await expectActionable(storefront.placeOrderButton());
      await storefront.placeOrder();

      await expect(page).toHaveURL(/\/orders\/ord_e2e_1001$/);
      await expect(storefront.orderDetailsHeading()).toBeVisible();
      await expect(storefront.orderSuccessAlert()).toBeVisible();
      await expect(storefront.orderStatus('Pending')).toBeVisible();

      const orderId = storefront.currentOrderId();
      await expect(storefront.visibleOrderId(orderId)).toBeVisible();
      await expect(storefront.orderCustomer(customerName)).toBeVisible();
      await expect(storefront.orderLineItem(productUnderTest.name)).toBeVisible();
```

to:

```ts
      const storefront = await prepareCheckout(page);

      await expect(storefront.checkoutSummaryHeading()).toBeVisible();
      await expect(storefront.checkoutLineItem(productUnderTest.name)).toBeVisible();

      await expectActionable(storefront.placeOrderButton());
      await storefront.placeOrder();

      await expect(page).toHaveURL(/\/orders\/ord_e2e_1001$/);
      await expect(storefront.orderDetailsHeading()).toBeVisible();
      await expect(storefront.orderSuccessAlert()).toBeVisible();
      await expect(storefront.orderStatus('Pending')).toBeVisible();

      const orderId = storefront.currentOrderId();
      await expect(storefront.visibleOrderId(orderId)).toBeVisible();
      await expect(storefront.orderLineItem(productUnderTest.name)).toBeVisible();
```

- [ ] **Step 2: Drop the name-field steps from the network-drop test**

Change:

```ts
      const storefront = await prepareCheckout(page, {
        checkoutFailure: 'network-drop',
      });

      await expectActionable(storefront.customerNameInput());
      await storefront.fillCustomerName('Network Failure Shopper');
      await expectActionable(storefront.placeOrderButton());
      await storefront.placeOrder();
```

to:

```ts
      const storefront = await prepareCheckout(page, {
        checkoutFailure: 'network-drop',
      });

      await expectActionable(storefront.placeOrderButton());
      await storefront.placeOrder();
```

- [ ] **Step 3: Update the mocked `/checkout` route handler**

The inline BFF mock currently requires a `customerName` in the POST body.
Change:

```ts
    if (method === 'POST' && path === '/checkout') {
      if (options.checkoutFailure === 'network-drop') {
        return route.abort('failed');
      }

      const body = request.postDataJSON() as { customerName?: string } | null;
      const cart = buildCart(cartItems);

      if (cart.items.length === 0 || !body?.customerName?.trim()) {
        return fulfillJson(route, 400, { message: 'Invalid checkout request' });
      }

      order = {
        orderId: 'ord_e2e_1001',
        customerName: body.customerName.trim(),
        status: 'pending',
```

to:

```ts
    if (method === 'POST' && path === '/checkout') {
      if (options.checkoutFailure === 'network-drop') {
        return route.abort('failed');
      }

      const cart = buildCart(cartItems);

      if (cart.items.length === 0) {
        return fulfillJson(route, 400, { message: 'Invalid checkout request' });
      }

      order = {
        orderId: 'ord_e2e_1001',
        customerName: null,
        status: 'pending',
```

and further down, change:

```ts
      return fulfillJson(route, 200, {
        orderId: order.orderId,
        cartId: cart.cartId,
        customerName: order.customerName,
        status: order.status,
        total: order.total,
        placedAt: order.placedAt,
      });
```

to:

```ts
      return fulfillJson(route, 200, {
        orderId: order.orderId,
        cartId: cart.cartId,
        status: order.status,
        total: order.total,
        placedAt: order.placedAt,
      });
```

- [ ] **Step 4: Update the local `Order` type in this file**

Change:

```ts
type Order = {
  orderId: string;
  customerName: string;
  status: OrderStatus;
```

to:

```ts
type Order = {
  orderId: string;
  customerName: string | null;
  status: OrderStatus;
```

- [ ] **Step 5: Run the spec and commit both this file and Task 13's**

Run: `pnpm --filter e2e exec playwright test checkout-happy-path.spec.ts`
Expected: PASS (requires the Task 9 web change to already be in place — the
checkout page's Place Order button must no longer require a name).

```bash
git add tests/e2e/pages/StorefrontPage.ts tests/e2e/tests/checkout-happy-path.spec.ts
git commit -m "test(e2e): drop the anonymous checkout's name-field steps"
```

---

### Task 15: e2e — `frontend-certification.spec.ts` and `visual-integrity.spec.ts`

Both specs exercise the `ProductQuickView` quantity stepper and the "Your
Name" checkout field (Task 10/9's removed UI); `visual-integrity.spec.ts`
also exercises the cart drawer's stepper and remove button (Task 11's
removed UI).

**Files:**
- Modify: `tests/e2e/tests/frontend-certification.spec.ts`
- Modify: `tests/e2e/tests/visual-integrity.spec.ts`

- [ ] **Step 1: `frontend-certification.spec.ts` — drop the quick-view stepper click**

Change:

```ts
  const dialog = page.getByRole("dialog", { name: "Classic Espresso" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Increase quantity" }).click();
  await dialog.getByRole("button", { name: /Add to Cart/ }).click();
  await expect(dialog).toBeHidden();

  const cartButton = page.getByRole("button", {
    name: "Shopping cart with 2 items",
  });
  await expect(cartButton).toBeVisible();
  await cartButton.click();
  const cartDrawer = page.getByRole("dialog", { name: "Cart" });
  await expect(cartDrawer).toBeVisible();
  await cartDrawer.getByRole("button", { name: "Increase quantity" }).click();
  await expect(
    page.getByRole("button", { name: "Shopping cart with 3 items" }),
  ).toBeVisible();
  await cartDrawer.getByRole("link", { name: /Proceed to Checkout/ }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("Classic Espresso")).toBeVisible();
  await page.getByLabel("Your Name").fill("UAT Browser Customer");
  await page.getByRole("button", { name: "Place Order" }).click();
```

to:

```ts
  const dialog = page.getByRole("dialog", { name: "Classic Espresso" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Add to Cart/ }).click();
  await expect(dialog).toBeHidden();

  const cartButton = page.getByRole("button", {
    name: "Shopping cart with 1 items",
  });
  await expect(cartButton).toBeVisible();
  await cartButton.click();
  const cartDrawer = page.getByRole("dialog", { name: "Cart" });
  await expect(cartDrawer).toBeVisible();
  await cartDrawer.getByRole("link", { name: /Proceed to Checkout/ }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("Classic Espresso")).toBeVisible();
  await page.getByRole("button", { name: "Place Order" }).click();
```

(The category-tab clicks a few lines above this block — "Drinks"/"Food"/
"All" — are unrelated to the quantity/name changes and stay as-is; this
spec's mocked catalog fixture still has three categories and the web app's
category-filter UI is untouched by this plan.)

- [ ] **Step 2: `visual-integrity.spec.ts` — drop the quick-view stepper check**

Change:

```ts
    await expectVisualActionable(dialog.getByRole("button", { name: "Close" }));
    await expectVisualActionable(
      dialog.getByRole("button", { name: "Increase quantity" }),
    );
    await expectVisualActionable(
      dialog.getByRole("button", { name: "Add to Cart" }),
      {
        minHeight: 40,
        minWidth: 160,
      },
    );
```

to:

```ts
    await expectVisualActionable(dialog.getByRole("button", { name: "Close" }));
    await expectVisualActionable(
      dialog.getByRole("button", { name: "Add to Cart" }),
      {
        minHeight: 40,
        minWidth: 160,
      },
    );
```

- [ ] **Step 3: `visual-integrity.spec.ts` — drop the cart-drawer stepper/remove checks**

Change:

```ts
    await expectVisualActionable(
      drawer.getByRole("button", { name: "Close cart" }),
    );
    await expectVisualActionable(
      drawer.getByRole("button", { name: "Increase quantity" }),
    );
    await expectVisualActionable(
      drawer.getByRole("button", {
        name: `Remove ${productUnderTest.name} from cart`,
      }),
    );
```

to:

```ts
    await expectVisualActionable(
      drawer.getByRole("button", { name: "Close cart" }),
    );
```

- [ ] **Step 4: `visual-integrity.spec.ts` — drop the "Your Name" field check**

Change:

```ts
    await expectVisualActionable(page.getByLabel("Your Name"), {
      minHeight: 32,
      minWidth: 240,
    });
    await page.getByLabel("Your Name").fill("Visual TDD Customer");

    const placeOrder = page.getByRole("button", { name: "Place Order" });
```

to:

```ts
    const placeOrder = page.getByRole("button", { name: "Place Order" });
```

- [ ] **Step 5: Run both specs**

Run: `pnpm --filter e2e exec playwright test frontend-certification.spec.ts visual-integrity.spec.ts`
Expected: PASS (requires Tasks 9, 10, 11 already landed).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/tests/frontend-certification.spec.ts tests/e2e/tests/visual-integrity.spec.ts
git commit -m "test(e2e): drop assertions on the removed quantity/name controls"
```

---

### Task 16: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full BFF unit suite**

Run: `pnpm --filter @mini-commerce/bff test`
Expected: PASS.

- [ ] **Step 2: Repo-wide typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Integration suite (requires a local Postgres — see `tests/integration/src/db-setup.ts` for how it provisions one)**

Run: `pnpm --filter @mini-commerce/integration test` (adjust the filter name
to whatever `tests/integration/package.json` declares if different)
Expected: PASS — `checkout.integration.spec.ts` was confirmed during
research to need no changes.

- [ ] **Step 4: BFF smoke**

Run: `./dev up && ./dev smoke`
Expected: all 14 checks pass.

- [ ] **Step 5: Full e2e suite**

Run: `pnpm --filter e2e exec playwright test`
Expected: PASS, including `purchase.spec.ts` and `homepage-workspace.spec
.ts` (confirmed during research to need no changes for this plan).

- [ ] **Step 6: Manual browser walkthrough**

Run: `./dev up web`, then in a browser: load `/`, confirm exactly one
product card renders; add it to the cart; confirm the cart drawer shows no
stepper/remove controls; go to `/checkout`, confirm no name field, click
Place Order; confirm the order detail page has no "Customer" field; go back
to `/`, confirm the product is addable again (cart cleared).

- [ ] **Step 7: Final commit (if any stragglers)**

Only if Steps 1–6 turned up fixes not yet committed:

```bash
git add -A
git commit -m "chore: fix stragglers from single-cup P0 verification pass"
```

---

## Self-Review

**Spec coverage** — CUP-001 requirements: strict catalog (Task 2, 4),
reject other product identity (free via Task 2's single-product catalog +
Task 3's `catalog.getById`), reject quantity ≠ 1 / second add (Task 3),
reject removal/replacement/quantity-change after selection (Task 3),
domain-layer enforcement not just UI (Task 3 is service-layer; Tasks 9–11
are the UI mirror). CUP-002 requirements: no name field accepted (Task 6),
no name input in the Web App (Task 9), idempotency key unaffected (Task 6
leaves it in `CheckoutDto`), atomic clear-on-success (already true —
`CheckoutService.checkout()` already calls `cart.clear()`, untouched),
failed checkout creates no order/rain (already true, untouched). Acceptance
criteria for both are exercised by Task 3's and Task 6's tests plus Task 16's
manual walkthrough.

**Placeholder scan** — no TBD/TODO/"add proper handling" placeholders; every
step has literal code or a literal shell command.

**Type consistency** — `Order.customerName` is `string | null` consistently
across `orders.types.ts` (Task 5), `checkout.types.ts` (Task 6),
`packages/contracts` (Task 7), and the e2e local `Order` type (Task 14).
`CreateOrderInput.customerName` is optional consistently between
`orders.types.ts` (Task 5) and its only caller, `CheckoutService.checkout()`
(Task 6, which now omits the key entirely — compatible with an optional
field). `CartService.add()`'s new exceptions (`BadRequestException` for bad
quantity, `ConflictException` for an occupied cart) match what Task 9–11's
UI changes assume (no path in the UI ever triggers them anymore, since the
controls that would trigger them are removed).
