# Current System — Features and UX State

> Authoritative current-state snapshot captured on 2026-05-29.
> This document describes what the system _does today_. For request topology and
> proxy mechanics see [../architecture/web-entry-point.md](../architecture/web-entry-point.md).
> For _why_ decisions were made, see [../adr/README.md](../adr/README.md).

## 1. Runtime topology

The **web app is the single browser-facing entry point**. The browser only ever
talks to the web app's origin; the web server proxies to the other containers
over the internal Docker network.

| Service        | Tech                                 | Host URL                              | Profile | Role                                                        |
| -------------- | ------------------------------------ | ------------------------------------- | ------- | ----------------------------------------------------------- |
| Web app        | Next.js (App Router, standalone)     | `http://localhost:3000`               | `web`   | Product shell + browser entry point                         |
| BFF / API      | NestJS                               | `http://localhost:3001`               | core    | Domain API (catalog, cart, checkout, orders, visualization) |
| 3D visualizer  | nginx + vanilla Three.js             | `http://localhost:3002`               | `viz`   | Standalone scene; embedded via proxy                        |
| PostgreSQL     | Postgres 16                          | `localhost:5432`                      | core    | Catalog + orders persistence                                |
| OTel Collector | OpenTelemetry (`otel-contrib:0.110`) | `localhost:4317/4318`                 | core    | OTLP ingest → Tempo + Prometheus exporter                   |
| Prisma Studio  | Prisma Studio                        | `http://localhost:5555`               | `admin` | DB admin (direct writes — bypasses domain events)           |
| Tempo          | Grafana Tempo 2.6                    | `http://localhost:3200`               | `obs`   | Trace storage                                               |
| Prometheus     | Prometheus 2.55                      | `http://localhost:9090`               | `obs`   | Metrics scrape + storage                                    |
| Grafana        | Grafana 11.3                         | `http://localhost:3030` (admin/admin) | `obs`   | Dashboards, Tempo + Prom datasources pre-provisioned        |

For the full container map see [`../architecture/containers.md`](../architecture/containers.md).

Browser-facing request paths, all same-origin to the web app:

- `/` and feature routes — the Next.js UI.
- `/api/bff/*` — rewritten by the web server to the internal BFF (`bff:3001`).
- `/viz/*` — rewritten by the web server to the internal visualizer (`visualizer-3d:80`).

The BFF stays published on `:3001` for smoke tests, the `/dev` console, and the
standalone visualizer's own browser → BFF data fetch. The main web app does not
depend on that host exposure.

## 2. Feature inventory by domain

### Catalog (persisted)

- Browse the seeded product catalog with category filtering on `/`.
- Product detail via quick view.
- Endpoints: `GET /catalog/products`, `GET /catalog/products/:id`.

### Cart (in-memory, full CRUD)

- Single-user, in-process cart that resets on BFF restart (intentional).
- **Create** — add from the catalog (`POST /cart/items`).
- **Read** — cart drawer and `/cart` page (`GET /cart`).
- **Update** — quantity steppers (`PATCH /cart/items/:itemId`, clamped 1–20).
- **Delete** — remove line (`DELETE /cart/items/:itemId`).
- Quantity 1 disables the decrement control (use remove to clear a line);
  quantity 20 disables the increment control.

### Checkout (persists an order)

- Place an order with a fictional customer name on `/checkout`
  (`POST /checkout`). A successful checkout drains the cart and persists the order.

### Orders (persisted)

- Order list on `/orders` (`GET /orders`).
- Order detail and status management on `/orders/:orderId`
  (`GET /orders/:id`, `POST /orders/:id/manage`).
- Orders survive BFF restarts.

### 3D visualizer (standalone, proxied embed)

- Embedded on `/visualizer` through the same-origin `/viz/index.html` proxy,
  which reaches the visualizer container over the internal network.
- A separate "Open Standalone" link opens the host visualizer
  (`NEXT_PUBLIC_VISUALIZER_URL`, default `http://localhost:3002`) in a new tab.
- The visualizer reads `GET /visualization-data`; the web frontend owns no
  Three.js code.

### Performance Playground (mock-only)

- `/performance` renders simulated request activity for design evaluation.
- It does **not** consume live telemetry, Grafana data, or k6 output.
- The underlying infra Grafana stack now exists separately under `./dev up obs`
  (Tempo + Prometheus + Grafana). The `/performance` page is intentionally
  decoupled from it; see [`../architecture/observability.md`](../architecture/observability.md).

### Developer diagnostics

- `/dev` provides an API debug console (including a Cart Update/Remove card),
  demo-mode and mock-scenario controls, and a frontend-readiness panel.

## 3. UX state per route

| Route              | UX state                                                 | Data source         |
| ------------------ | -------------------------------------------------------- | ------------------- |
| `/`                | Catalog grid, category filter, add to cart               | BFF (proxy) or mock |
| `/cart`            | Line list, live quantity steppers, remove, order summary | BFF (proxy) or mock |
| `/checkout`        | Customer-name form, places a persisted order             | BFF (proxy) or mock |
| `/orders`          | Persisted order list                                     | BFF (proxy) or mock |
| `/orders/:orderId` | Order detail + status management                         | BFF (proxy) or mock |
| `/visualizer`      | Iframe embed of the proxied visualizer + standalone link | `/viz` proxy        |
| `/performance`     | Mock load scenarios and KPI strip (clearly labeled mock) | Mock only           |
| `/dev`             | API debug console, demo controls, readiness              | BFF (proxy) or mock |

A cart drawer is available from every route via the header cart button.

## 4. Backend HTTP surface

All paths are reached from the browser through the `/api/bff` proxy. Status is
the web-frontend consumer state.

| Method + path                | Behavior                                                                                                                                                                                       | Consumer status         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `GET /health`                | Runtime status                                                                                                                                                                                 | Wired                   |
| `GET /catalog/products`      | Reads persisted catalog                                                                                                                                                                        | Wired                   |
| `GET /catalog/products/:id`  | Reads persisted product                                                                                                                                                                        | Wired                   |
| `POST /catalog/products`     | Writes persisted product                                                                                                                                                                       | Available (diagnostics) |
| `GET /cart`                  | Reads transient cart                                                                                                                                                                           | Wired                   |
| `POST /cart/items`           | Adds a line to the transient cart                                                                                                                                                              | Wired                   |
| `PATCH /cart/items/:itemId`  | Updates a line's quantity                                                                                                                                                                      | Wired                   |
| `DELETE /cart/items/:itemId` | Removes a line                                                                                                                                                                                 | Wired                   |
| `POST /checkout`             | Drains cart, persists order                                                                                                                                                                    | Wired                   |
| `GET /orders`                | Lists persisted orders                                                                                                                                                                         | Wired                   |
| `GET /orders/:id`            | Reads persisted order                                                                                                                                                                          | Wired                   |
| `POST /orders/:id/manage`    | Persists status change                                                                                                                                                                         | Wired                   |
| `GET /visualization-data`    | Projects current domain state; carries the semantic `scene` payload (products, recentOrders capped at 10, orderAggregates, cart, latestActivityAt) plus a deprecated `items[]` for back-compat | Visualizer consumer     |

## 5. Demo mode

- Toggle in the app header or on `/dev`; persisted in `localStorage`, or forced
  with `NEXT_PUBLIC_DEMO_MODE=true`.
- In demo mode every call returns local fixtures (mock scenarios: happy,
  loading, empty, error, cart-filled, checkout-failure), so the full UI is
  explorable without a backend.

## 6. Validation status

- BFF smoke: **13/13** checks pass (`./dev smoke` / `pnpm pg:smoke`), including
  `POST`, `PATCH`, `DELETE` cart operations and an SSE frame assertion against
  `/visualization-updates`.
- Typecheck passes for `@mini-commerce/web`, `@mini-commerce/bff`, and contracts.
- The web production build (Next.js standalone) builds and runs in Docker; all
  feature routes and both proxies return `200` from the host.
- Cart CRUD verified end-to-end through the `/api/bff` proxy (add → update →
  delete) and via the UI controls.

## 7. Known gaps and non-goals (current)

- Cart is not keyed by customer or session; it is single-user and resets with
  the BFF process. This is intentional for the current phase.
- No authentication or payment processing.
- The visualizer's own browser → BFF fetch still targets the host BFF
  (`http://localhost:3001`, CORS `*`); only the embed transport is proxied.
- Contract provider verification, Playwright E2E coverage, and production
  observability dashboards remain follow-up work
  (see [../next-steps/README.md](../next-steps/README.md)).

## Related

- Architecture: [../architecture/web-entry-point.md](../architecture/web-entry-point.md)
- Run it: [../local-development.md](../local-development.md)
