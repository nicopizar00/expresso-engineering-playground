# Frontend Integration Guardrails

This document defines how design-assisted frontend work integrates with the
mini-commerce application without changing domain ownership or API behavior.
The current storefront screens are already wired; future visual iterations
must preserve these boundaries.

## Current frontend baseline

The Next.js app currently provides:

- Catalog browsing at `/` with product cards and quick-view behavior.
- Shared cart state and the `/cart` page.
- Checkout and navigation to persisted order detail.
- A persisted orders list at `/orders` and order management at
  `/orders/[orderId]`.
- A standalone 3D visualizer embed at `/visualizer`.
- Diagnostics and demo-mode controls at `/dev`.

All HTTP traffic is owned by `apps/web/src/lib/api/expresso-api.ts`. The
client uses canonical TypeScript wire shapes from `@mini-commerce/contracts`
and can switch to deterministic frontend fixtures for demo mode.

## BFF contract available to the web app

All paths are relative to `NEXT_PUBLIC_API_BASE_URL`, defaulting locally to
`http://localhost:3001`.

| Client operation | HTTP path | Response |
|---|---|---|
| `getHealth()` | `GET /health` | `HealthReport` |
| `getProducts()` | `GET /catalog/products` | `ProductsResponse` |
| `getProductById(id)` | `GET /catalog/products/:id` | `Product` |
| `addCartItem(input)` | `POST /cart/items` | `Cart` |
| `getCart()` | `GET /cart` | `Cart` |
| `checkout(input)` | `POST /checkout` | `CheckoutResponse` |
| `getOrders()` | `GET /orders` | `OrdersResponse` |
| `getOrderById(id)` | `GET /orders/:id` | `Order` |
| `manageOrder(id, input)` | `POST /orders/:id/manage` | `ManageOrderResponse` |

`GET /visualization-data` is owned by the standalone visualizer rather than
storefront components.

The BFF does not currently support authentication, payment processing,
cart-item deletion, or cart quantity editing. Design output must not imply
that these capabilities exist.

## State and ownership rules

- Catalog and orders are persisted in PostgreSQL through the BFF.
- Cart state is intentionally single-user and in-memory; only cart copy may
  warn about reset on BFF restart.
- UI components never read databases, call infrastructure services, or invent
  API endpoints.
- Components receive props or hooks backed by the API client; raw network
  access remains outside generated visual components.
- Wire response types belong in `@mini-commerce/contracts`; local component
  types are for presentation state only.

## Design-assisted changes

Design tooling may refine layouts, tokens, responsive behavior, accessibility,
loading/empty/error states, catalog/cart/checkout/order presentation, and
visualizer embedding surfaces.

Design tooling must not change:

- API contracts or BFF implementation.
- Persistence, session, authentication, or payment behavior.
- Docker, observability, CI, or performance-test architecture.
- The statement that orders persist while the cart is transient.

## Verification for frontend changes

Before merging visual work:

1. Run `pnpm --filter @mini-commerce/web typecheck` and build the web app.
2. Run the BFF smoke flow and confirm `GET /orders` remains available.
3. Exercise browse -> cart -> checkout -> order detail -> order list.
4. Verify `/visualizer` loads or displays its environment-configuration state.
5. Confirm all repository documentation and source comments remain in English.
