# State-Driven Visualization

> Captured 2026-05-16. Current branch: `expresso-frontend-build`.

This document describes how persisted domain state flows from the database
through the BFF and into the 3D visualization.

---

## What the 3D visualizer renders

The visualizer-3d app is a standalone nginx/Three.js static app. It renders
three categories of domain objects, each from a different service:

| Shape | Source | BFF service |
|---|---|---|
| Cube | Products (catalog) | `CatalogService.list()` |
| Sphere | Orders | `OrdersService.listAll()` |
| Marker | Cart | `CartService.get()` |

All three are aggregated by `VisualizationService.list()` and served at
`GET /visualization-data`. The visualizer fetches this endpoint on load.
It never reads the database directly.

## Which endpoints mutate state

| Method + path | What it mutates | Persistence |
|---|---|---|
| `POST /catalog/products` | Creates a product | Prisma/PostgreSQL |
| `POST /cart/items` | Adds to cart | In-memory (intentional) |
| `POST /checkout` | Creates an order from cart contents | Prisma/PostgreSQL |
| `POST /orders/:id/manage` | Updates order status | Prisma/PostgreSQL |

## Which endpoints are read-only

All GET endpoints are side-effect-free:

- `GET /health`
- `GET /catalog/products`
- `GET /catalog/products/:id`
- `GET /cart`
- `GET /orders` ← new in this iteration
- `GET /orders/:id`
- `GET /visualization-data`

This is the stable contract future k6 scenarios rely on: GET = safe to repeat;
POST = creates or mutates state.

## How browser actions affect persisted domain state

```
Browser → POST /cart/items      → CartService (in-memory)
Browser → POST /checkout        → CheckoutService → OrdersService.create()
                                                  → Prisma.order.create()
                                                  → cache.push(order)
                                                  → CartService.clear()
Browser → POST /orders/:id/manage → OrdersService.manage()
                                  → Prisma.order.update()
                                  → cache[idx] = updated order
```

After a successful `POST /checkout`:
1. The order exists in PostgreSQL.
2. `OrdersService` appends it to its in-memory cache.
3. The next `GET /visualization-data` call returns a new sphere for the order.
4. If the visualizer is open, reloading the iframe (or navigating to `/visualizer`)
   fetches fresh data and renders the new sphere.

## How persisted state reaches the visualizer

`VisualizationService.orderItems()` calls `orders.listAll()` synchronously.
`OrdersService.listAll()` reads from a warm in-memory cache populated at
module init via `onModuleInit()` (Prisma `findMany`). The cache is updated
on every `create()` and `manage()` call — no full DB re-read is needed.

This means:
- Orders created before BFF starts are loaded from DB on startup.
- Orders created after BFF starts are immediately visible via the cache.
- The visualizer sees new orders on its next page load (or iframe reload).
- No polling, no websockets — the visualizer is a snapshot fetcher.

## What is intentionally manual or refresh-based

- **Cart** is in-memory and resets on BFF restart. This is a deliberate Phase 1
  constraint. The visualizer shows a single cart marker, not historical state.
- **Visualizer refresh** is manual (iframe reload or page navigation). There is no
  push mechanism. This is sufficient for playground use and leaves the architecture
  clean for future k6 polling scenarios.

## What this prepares for k6

1. k6 can safely call `GET /catalog/products` + `GET /orders` to verify state.
2. k6 can call `POST /cart/items` + `POST /checkout` to create orders and then
   assert they appear in `GET /orders` and `GET /visualization-data`.
3. Every write endpoint has a stable, documented read counterpart.
4. The synchronous `OrdersService.listAll()` means `GET /visualization-data`
   always returns current order state without waiting for an async DB query.

## Still out of scope for k6

- Cart persistence (in-memory by design; k6 scenarios create fresh sessions)
- Visualizer scene rendering (Three.js, not HTTP)
- Order notifications, domain events, or pub/sub
