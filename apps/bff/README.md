# apps/bff

NestJS Backend-for-Frontend / API for the mini-commerce engineering playground.

## Responsibility

- Aggregates domain modules behind a single HTTP surface for `apps/web`.
- Hosts the domain modules of the modular monolith:
  - `health` — liveness status; database readiness follow-up.
  - `catalog` — persisted product catalog and product creation.
  - `cart` — single-user in-memory cart.
  - `checkout` — converts the current cart into an order.
  - `orders` — persisted order listing, lookup, and management.
  - `customers` — customer profile (placeholder only).
  - `notifications` — outbound notifications (placeholder only).
- Owns catalog and order persistence through Prisma/PostgreSQL. Cart storage
  deliberately remains in BFF process memory.
- Initializes OpenTelemetry tracing through an OTLP HTTP exporter when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is configured.

## Module layout

Each module is a self-contained NestJS feature module. Modules expose a
narrow public surface (controllers + service interfaces); internals are not
imported from other modules. This is what enables Phase 3 extraction later.

```
src/
├── main.ts                       # bootstrap (telemetry → Nest → pipes/filters → listen)
├── app.module.ts                 # root composition
├── common/
│   ├── http-exception.filter.ts  # error mapper (problem+json TODO)
│   ├── logging.interceptor.ts    # request/response logging
│   └── telemetry.ts              # OpenTelemetry SDK + OTLP trace export
└── modules/
    ├── health/        # GET /health
    ├── catalog/       # GET/POST /catalog/products, GET /catalog/products/:id
    ├── cart/          # GET /cart, POST /cart/items
    ├── checkout/      # POST /checkout
    ├── orders/        # GET /orders, GET /orders/:id, POST /orders/:id/manage
    ├── customers/     # placeholder (not wired into AppModule)
    └── notifications/ # placeholder (not wired into AppModule)
```

## HTTP surface

| Method | Path                    | Notes                                                   |
| ------ | ----------------------- | ------------------------------------------------------- |
| GET    | `/health`               | Liveness; `checks.db` is `"skipped"` for now.           |
| GET    | `/catalog/products`     | Deterministic catalog of seven products.                |
| GET    | `/catalog/products/:id` | `prod_unknown` returns 404 for error-path tests.        |
| POST   | `/catalog/products`     | Creates a persisted product.                            |
| GET    | `/cart`                 | Current cart snapshot.                                  |
| POST   | `/cart/items`           | Adds a product line; returns the updated cart.          |
| PATCH  | `/cart/items/:itemId`   | Updates a line's quantity (clamped 1–20).               |
| DELETE | `/cart/items/:itemId`   | Removes a line; returns the updated cart.               |
| POST   | `/checkout`             | Converts the cart to an order; resets the cart.         |
| GET    | `/orders`               | Lists persisted orders, including seeded `ord_demo`.    |
| GET    | `/orders/:id`           | Finds a persisted order; unknown ids return 404.        |
| POST   | `/orders/:id/manage`    | Persists `cancel`, `update_status`, `mark_prepared`.    |
| GET    | `/visualization-data`   | Aggregates catalog, orders, and cart for the 3D client. |

## Local run

From the repo root:

```bash
# 1. Install workspace deps (one time)
pnpm install

# 2. Start Postgres in the background
docker compose -f infra/docker/compose.yaml up -d postgres

# 3. Run the BFF in watch mode
pnpm --filter @mini-commerce/bff dev

# Smoke test
curl http://localhost:3001/health
curl http://localhost:3001/catalog/products
```

To run everything (BFF + Postgres + otel-collector) in containers:

```bash
docker compose -f infra/docker/compose.yaml up --build
```

## Tests

```bash
pnpm --filter @mini-commerce/bff test
```

## Persistence

Prisma schema and migrations live in `prisma/`. Product and order records
are persisted in Postgres; module startup warms read caches used by the BFF
and visualization aggregator. The cart remains in-memory by design.

## Next iteration TODOs

- [ ] Add `@nestjs/swagger` and serve OpenAPI on `/docs` from `packages/contracts`.
- [ ] Add Pact provider verification entry point under `tests/contract`.
- [ ] Add a real database readiness check under `/health`.
- [ ] Define domain events for notifications and future extraction.
- [ ] Lint rule that forbids cross-module internal imports.
