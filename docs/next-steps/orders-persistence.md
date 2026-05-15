# Orders persistence (Phase 2 follow-up)

## Goal

Move orders from the in-memory `Map<OrderId, Order>` in
`OrdersService` to Prisma + Postgres so orders survive BFF restarts.

Cart stays in-memory — that decision is explicit (single-user Phase 1
contract; out of scope for now). See the original Phase 2 plan if
revisiting.

## Why

Phase 2 shipped Prisma for the **product catalog only**. Today:

- Add a product via `POST /catalog/products` → survives restart. ✓
- Place an order via `POST /checkout` → resets on restart. ✗

The 3D visualization sphere history disappears on every BFF boot, which
limits demo continuity.

## Sub-tasks

### 1. Schema
Add `Order` + `OrderLine` models to `apps/bff/prisma/schema.prisma`:

```prisma
model Order {
  id           Int      @id @default(autoincrement())
  orderId      String   @unique
  customerName String
  status       String
  totalAmountMinor Int
  totalCurrency    String
  placedAt     DateTime
  updatedAt    DateTime @updatedAt
  lines        OrderLine[]
}

model OrderLine {
  id        Int    @id @default(autoincrement())
  orderId   String
  order     Order  @relation(fields: [orderId], references: [orderId], onDelete: Cascade)
  productId String
  name      String
  quantity  Int
  unitAmountMinor Int
  unitCurrency    String
  lineAmountMinor Int
  lineCurrency    String
}
```

Run: `pnpm --filter @mini-commerce/bff exec prisma migrate dev --name init-orders`.

### 2. Service swap — preserve sync `listAll()` / `getById()`

`VisualizationService.orderItems()` calls `orders.listAll()`
**synchronously**. The visualization service is a load-bearing contract
that must not change. Mirror the `CatalogService` pattern:

- Implement `OnModuleInit` on `OrdersService`.
- Warm a `private cache: Order[]` from
  `prisma.order.findMany({ include: { lines: true } })`.
- `listAll()` returns from `this.cache` — synchronous.
- `getById(orderId)` looks up in `this.cache` — synchronous.
- `create(...)` and `updateStatus(...)` become async: write to DB,
  refresh cache (or mutate in place).

### 3. Checkout integration

`CheckoutService.checkout()` currently calls `OrdersService.create(...)`
synchronously. After the swap, it must `await`. Verify no other callers
of `OrdersService.create` exist (none should — orders are only created
via checkout).

### 4. Seed (optional)

Decide whether to seed an `ord_demo` row. The existing
`apps/bff/prisma/seed.ts` seeds products only. Tests rely on `ord_demo`
being present (see `playground.mjs::smoke()` line 248). If the seed
stays product-only, the smoke test needs to first POST a checkout, then
hit `/orders/ord_demo`. Two options:

- **Option A**: Seed `ord_demo` in `seed.ts` too — preserves smoke flow
  as-is.
- **Option B**: Adjust the smoke flow to create its own order — cleaner
  but more wiring.

Pick one based on what feels lightest.

### 5. Tests

- Add `apps/bff/src/modules/orders/orders.service.spec.ts` covering:
  - Cache warm from DB on init.
  - `listAll()` sync, returns from cache.
  - `create()` persists and updates cache.
  - `updateStatus()` persists and updates cache.
- Visualization tests in `visualization.service.spec.ts` must **stay
  green without modification** — they mock `orders.listAll` as sync.

## Critical files

- `apps/bff/prisma/schema.prisma` — add `Order` + `OrderLine` models
- `apps/bff/src/modules/orders/orders.service.ts` — Prisma swap +
  `OnModuleInit` cache
- `apps/bff/src/modules/orders/orders.types.ts` — verify wire format
  unchanged (the in-memory `Order` interface and the DB shape should
  agree after a small mapper)
- `apps/bff/src/modules/checkout/checkout.service.ts` — `await` the
  async `create()`
- `apps/bff/src/modules/visualization/visualization.service.ts` —
  **must remain untouched**; verify only
- `apps/bff/prisma/seed.ts` — optional `ord_demo` seed
- `apps/bff/src/modules/orders/orders.service.spec.ts` *(new)*

## Verification

1. `pnpm --filter @mini-commerce/bff exec prisma migrate dev --name init-orders` runs cleanly.
2. `pnpm --filter @mini-commerce/bff test` — all green, **including the
   14 visualization tests** (unchanged).
3. `pnpm pg:smoke` — all 9 checks pass.
4. Manual: POST `/checkout`, observe order in DB, restart BFF,
   GET `/orders/<id>` → returns the order; refresh visualizer →
   sphere is still there.

## Anchors

```bash
grep -rn "next-steps/orders-persistence" .
```

Current anchors:

- `apps/bff/src/modules/orders/orders.service.ts` — swap Map for Prisma + cache
- `apps/bff/prisma/schema.prisma` — add Order + OrderLine models
- `apps/bff/src/modules/checkout/checkout.service.ts` — await async create()
