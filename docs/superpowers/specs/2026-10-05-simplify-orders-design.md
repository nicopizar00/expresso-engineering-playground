# Simplify orders: place-and-done, my/all listings, hot/cold — design

Date: 2026-10-05
Status: approved design, pending implementation plan

## Intent

Placing an order is the final step of the purchase. The order preparation
lifecycle (`pending → preparing → prepared`, plus `cancelled`) no longer
reflects the product and is removed from the whole stack. Shoppers need to
see their own orders and an all-orders view, each showing whether the coffee
is hot or cold.

### What the owner asked for

- "Prepare order" is no longer required; place order is enough.
- A general listing of all orders, and a user-specific listing.
- Show whether the coffee is hot or cold.

### Decisions taken during brainstorming

- Removal is whole-stack (BFF, contracts, web, visualizer, smoke, k6, e2e,
  docs), not UI-only.
- "User" means the anonymous browser session (existing `sid` cookie
  resolved by `SessionService`). No login, no name collection (CUP-002 stays).
- No cancel action. A placed order is terminal.
- `status` is deleted everywhere (approach A), including the DB column.
  Temperature (`hot` / `cold`, derived from `placedAt`) is the only state
  signal an order carries.
- The order lookup-by-id form is removed from the web app.

### Assumptions

- Orders placed before this change (seed `ord_demo`, historical rows) have no
  session and appear only in the all-orders listing.
- No pagination; `GET /orders` keeps returning every order as today.

## Data

Prisma `Order`:

- Add `sessionId String?` with `@@index([sessionId])`. Nullable for
  historical rows and seed data.
- Drop `status`.

One migration under `apps/bff/prisma/migrations/` does both. The seed stops
writing `status`. `sessionId` is server-side only and never serialized.

## BFF

### Checkout

`CheckoutService.checkout(sessionId, dto)` already receives the session id.
It passes it into `CreateOrderInput` so the created order row stores it.
Idempotent retries (`clientRequestId`) return the original order unchanged.

### Orders module

- Delete `POST /orders/:id/manage`, `ManageOrderDto`, `ManageOrderResponse`,
  the status state machine in `OrdersService.manage`, and their specs.
- Add `GET /orders/mine`: resolves the session via `SessionService`
  (minting a cookie if absent, as cart/checkout do) and returns
  `{ items: Order[] }` filtered by `sessionId`, newest first. Declared before
  `GET /orders/:id` so `mine` is not captured as an id.
- `GET /orders` (all), `GET /orders/:id`, `GET /orders/:id/status` stay.
- Wire `Order`: `orderId, customerName, lines, total, placedAt, updatedAt,
  temperature, coolsAt`. No `status`.
- `OrderStatusResponse`: `orderId, temperature, placedAt, coolsAt,
  checkedAt`. No `status`.
- The in-memory cache keeps `sessionId` on its stored record so
  `/orders/mine` filters without a DB round trip; the field is stripped when
  mapping to the wire `Order`.

### Shared types

`packages/shared-types`: delete `OrderStatus` and `OrderManageAction`.
`OrderTemperature` stays.

### Visualization

- Order item tint derives from temperature: `hot → "ok"`, `cold → "idle"`.
- `orderAggregates.statusCounts` is replaced by
  `temperatureCounts: { hot, cold }`.
- `apps/visualizer-3d/public/fallback.js` and its README follow the new
  field (only `fallback.js` reads `statusCounts` today).

## Web

### Orders section

- Two-tab toggle at the top: **My orders** (default) and **All orders**,
  backed by `expressoApi.getMyOrders()` (`GET /orders/mine`, sent with
  credentials) and `expressoApi.getOrders()`.
- Row: order id, Hot/Cold badge, placed time, total. Click opens detail.
- Each list schedules one revalidation at its soonest `coolsAt` among hot
  orders (same no-polling pattern as the detail view), so badges flip to
  Cold without a refresh.
- Empty states: My orders — "You have not placed any orders yet"; All
  orders — existing "No orders yet".
- After Place Order succeeds, the section opens the new order's detail, and
  Back returns to My orders.

### Order detail

- Remove the status badge and the Order Actions panel.
- Keep the live Hot/Cold badge flip at `coolsAt`.
- Show the "Order placed" banner only when the order was just placed in this
  session (driven by the existing `justPlacedOrderId`), not by status.

### Removals

- Lookup-by-id form.
- `expressoApi.manageOrder`, `ManageOrderInput`, status types, the mock
  manage path in `mock-data.ts`.
- DevSection manage-order form.

## Tooling and tests

- BFF (TDD): checkout stores `sessionId`; `/orders/mine` returns only the
  caller's orders and an empty list for a fresh session; `/orders/mine`
  route is not shadowed by `:id`; manage route returns 404; visualization
  emits `temperatureCounts` and temperature-based tint.
- `scripts/pg/smoke.py`: drop status assertions, assert no `status` on the
  order and status payloads, add a `/orders/mine` check that sees the order
  checked out in the same cookie jar. Smoke count in docs updated to match.
- k6: remove the `orders: manage` group from load and stress; drop manage
  from `smoke.ts`; no workflow YAML references manage today.
- e2e: fixtures and `visualizer-interaction.spec.ts` follow
  `temperatureCounts`; web UAT spec covers the My/All toggle.
- Docs: ADR-0002 addendum (lifecycle removed), `current-system.md`,
  `bff-modules.md`, UAT docs, BFF and visualizer READMEs, `CLAUDE.md` smoke
  count, and `docs/next-steps/simplify-orders.md` per the next-steps
  workflow.

## Error handling

- `/orders/mine` never errors for an unknown session; it returns
  `{ items: [] }`.
- List fetch failure shows the existing inline error banner per tab.

## Out of scope

Authentication, attaching historical orders to a session, pagination,
order cancellation.
