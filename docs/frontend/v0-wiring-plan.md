# v0.app Wiring Plan — Mini Commerce / Expresso Web App

How v0.app-generated UI is going to land in `apps/web/` without coupling
the generated components to the BFF wire format, and without breaking the
already-working developer playground at `/`.

> Companion to [`docs/project-state/frontend-wiring-status.md`](../project-state/frontend-wiring-status.md).
> Both documents are owned by frontend wiring; update them together.

---

## Intended frontend experience

A simple but polished mini-commerce demo that lets a visitor:

1. **Land** on a home / catalog page and see a small grid of espresso-themed
   products, each with a name, category, price, and stock state.
2. **Inspect** a product (if a detail view ships) — full description and
   inventory.
3. **Add** items to a cart, with visible feedback (toast / drawer / count
   badge in header).
4. **View the cart** — line items, quantities, line totals, cart total.
5. **Checkout** by entering a customer name; optionally an idempotency key.
6. **See the placed order** with status, lines, total, and timestamps.
7. **Manage the order** (cancel / update status / mark prepared) and watch
   the status transition.
8. **Glance at API health** without leaving the app (badge in header,
   linkable to a `/dev` page).
9. Encounter **clear loading, empty, and error states** for every async
   action — not a JSON dump.

The visual language is set by v0.app. The wiring, types, and state are
hand-written and stay outside any generated component.

## Available BFF endpoints to consume

Source of truth: `apps/bff/src/modules/<domain>/*.controller.ts`. All
relative to `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:3001`).

| API client method | HTTP | Path | Request body | Response |
|---|---|---|---|---|
| `getHealth()` | `GET` | `/health` | — | `HealthReport` |
| `getProducts()` | `GET` | `/catalog/products` | — | `{ items: Product[] }` |
| `getProductById(id)` | `GET` | `/catalog/products/:id` | — | `Product` (404 → throw) |
| `addCartItem({ productId, quantity })` | `POST` | `/cart/items` | `AddCartItemDto` | `Cart` (201) |
| `getCart()` | `GET` | `/cart` | — | `Cart` |
| `checkout({ customerName, idempotencyKey? })` | `POST` | `/checkout` | `CheckoutDto` | `CheckoutResponse` (201) |
| `getOrderById(id)` | `GET` | `/orders/:id` | — | `Order` (404 → throw) |
| `manageOrder(id, { action, nextStatus?, reason? })` | `POST` | `/orders/:id/manage` | `ManageOrderDto` | `ManageOrderResponse` (202) |

Out of scope for the consumer UI (kept for the visualizer service):
- `GET /visualization-data` — read by `apps/visualizer-3d`, not by `apps/web`.

Endpoints **not** present in the BFF — do not invent them:
- ❌ No `GET /orders` list endpoint. The order id must be carried from
  the checkout response or pasted by hand.
- ❌ No customers or auth endpoints (`CustomersModule` /
  `NotificationsModule` are placeholders).
- ❌ No cart deletion / item-remove endpoint yet.

## Expected data contracts

Today these live next to their controllers in `apps/bff/src/modules/<domain>/*.types.ts`
and `*.dto.ts`. They are stable enough to lift into `@mini-commerce/contracts`.

### `Money` (already in `@mini-commerce/shared-types`)

```ts
{ amountMinor: number; currency: string }  // integer cents — never a float
```

### `Product`

```ts
{
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: 'drink' | 'food' | 'accessory';
  price: Money;
  inventory: number;
}
```

### `Cart`

```ts
{
  cartId: string;
  items: CartItem[];      // itemId, productId, name, unitPrice, quantity, lineTotal
  itemCount: number;
  total: Money;
  updatedAt: string;      // ISO timestamp
}
```

### `CheckoutResponse`

```ts
{
  orderId: string;
  cartId: string;
  customerName: string;
  status: 'pending';      // narrowed: a fresh order is always pending
  total: Money;
  placedAt: string;
}
```

### `Order`

```ts
{
  orderId: string;
  customerName: string;
  status: 'pending' | 'preparing' | 'prepared' | 'cancelled';
  lines: OrderLine[];     // productId, name, quantity, unitPrice, lineTotal
  total: Money;
  placedAt: string;
  updatedAt: string;
}
```

### `ManageOrderResponse`

```ts
{
  orderId: string;
  action: 'cancel' | 'update_status' | 'mark_prepared';
  previousStatus: OrderStatus;
  status: OrderStatus;
  acceptedAt: string;
}
```

### `HealthReport`

```ts
{
  status: 'ok';
  service: 'bff';
  version: string;
  uptimeSeconds: number;
  checks: { db: 'skipped' | 'ok' | 'down' };
}
```

These shapes are the boundary. v0-generated components must consume them
through **view models** — never directly.

## Minimum screens / UI sections required

| Surface | Lives at | v0 generates? | Notes |
|---|---|---|---|
| **App shell** (header + cart count + health badge) | `apps/web/app/layout.tsx` + `components/system/AppShell.tsx` | ✅ Yes | Hand-wire `useCart()` count and health pull. |
| **Home / Catalog page** | `apps/web/app/page.tsx` (eventually) | ✅ Yes | Drop in `ProductCatalogGrid`. Today the page is the playground cards — move them to `/dev` when ready. |
| **Product detail** | `apps/web/app/catalog/[productId]/page.tsx` | ✅ Yes | Fed by `getProductById`. |
| **Cart drawer** | `components/cart/CartDrawer.tsx` | ✅ Yes | Slide-over; consumes `useCart()`. |
| **Cart page (fallback)** | `apps/web/app/cart/page.tsx` | ✅ Yes | Same data, full-page layout for mobile / share. |
| **Checkout form** | `apps/web/app/checkout/page.tsx` | ✅ Yes | Single `customerName` field + submit; show inline errors. |
| **Order confirmation / detail** | `apps/web/app/orders/[orderId]/page.tsx` | ✅ Yes | Summary + manage panel. |
| **Order management panel** | `components/orders/OrderManagePanel.tsx` | ✅ Yes | Cancel / update_status / mark_prepared. |
| **System (loading / empty / error)** | `components/system/{LoadingSkeleton,EmptyState,ErrorBanner}.tsx` | ✅ Yes | Reused across all screens. |
| **Health badge** | `components/system/HealthBadge.tsx` | ✅ Yes | Polls `/health` on a slow interval. |
| **Developer playground** | `apps/web/app/dev/page.tsx` | ❌ No | Migrate today's cards here as-is. |

## Where v0.app-generated UI should be integrated

- **Only inside `apps/web/src/components/<domain>/`.** v0 components import
  *from* `lib/view-models/` and `types/`; never from `lib/api/`.
- **Routes** (`apps/web/app/...`) stay hand-written: they wire data
  fetching, server / client boundaries, and Suspense. They render v0
  components but do not embed v0-generated logic.
- **No v0 component owns network state or HTTP calls.** That belongs in
  route components or in `useX()` hooks under `lib/`.

## What must remain hand-wired in code

- The API client (`apps/web/src/lib/api/expresso-api.ts`).
- View-model adapters (`apps/web/src/lib/view-models/`).
- Route components in `apps/web/app/...` (data fetching, server actions,
  navigation).
- Shared TypeScript types (eventually in `@mini-commerce/contracts`).
- Env handling (`NEXT_PUBLIC_API_BASE_URL`).
- The `/dev` playground page.

## What should remain as placeholder only in this iteration

- The v0-generated components themselves — directory stubs (`README.md`
  per folder) are fine until v0 is run.
- Routes other than `/` — do not add empty `page.tsx` files yet; create
  them when their v0 component arrives.
- `apps/web/src/lib/view-models/` — empty folder + brief README until
  the first component requires an adapter.

## What should not be generated by v0.app

- The HTTP client.
- TypeScript contract types.
- The cart context / `useCart()` hook (state shape is determined by the
  BFF, not the design).
- Anything that reads from the database — the BFF is the only data source.
- The `/dev` playground page (it is intentionally utilitarian).
- ADRs, READMEs, or other docs.

## TODO marker conventions

When adding TODOs in `apps/web/`, use one of the six tags below so they
can be grepped later:

| Tag | Meaning |
|---|---|
| `TODO(v0)` | Will be replaced by v0.app-generated UI. |
| `TODO(api-wire)` | Needs to be pointed at the centralized API client. |
| `TODO(state)` | Replace local state with shared / context state. |
| `TODO(error-handling)` | Needs a user-facing error surface. |
| `TODO(types)` | Replace ad-hoc type with one from `@mini-commerce/contracts` / `shared-types`. |
| `TODO(ux)` | Loading, empty, or polish state to add via the v0 design system. |

Each TODO must point to an actual future step. Do not spam.

## Verification before asking v0.app for UI

1. `pnpm pg:doctor` passes.
2. `pnpm pg:up` (or `./dev up`) brings up Postgres + BFF cleanly.
3. `pnpm pg:smoke` returns nine green checks.
4. `pnpm --filter @mini-commerce/web typecheck` passes.
5. `apps/web/src/lib/api/expresso-api.ts` exposes the eight functions
   listed above and is consumed by `app/page.tsx`.
6. Wire-format types are imported from `@mini-commerce/contracts` (not
   redeclared inline).
7. `tests/e2e/` has at least a placeholder Playwright spec for the
   browse → add → checkout flow.

Only after these are green should v0.app be asked to generate UI.
