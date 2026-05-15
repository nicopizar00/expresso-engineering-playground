# apps/bff

NestJS Backend-for-Frontend / API for the mini-commerce engineering playground.

## Responsibility

- Aggregates domain modules behind a single HTTP surface for `apps/web`.
- Hosts the domain modules of the modular monolith (Phase 1):
  - `health`        — liveness/readiness placeholder.
  - `catalog`       — product catalog and product lookup.
  - `cart`          — single-user in-memory cart.
  - `checkout`      — converts the current cart into an order.
  - `orders`        — order record + mocked management actions.
  - `customers`     — customer profile (placeholder only).
  - `notifications` — outbound notifications (placeholder only).
- Owns persistence (PostgreSQL via Prisma — provisioned in compose, not yet
  used by the app code).
- Will emit OpenTelemetry traces, metrics, and logs (placeholder today —
  see `src/common/telemetry.ts`).

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
│   └── telemetry.ts              # OpenTelemetry init (no-op placeholder)
└── modules/
    ├── health/        # GET /health
    ├── catalog/       # GET /catalog/products, GET /catalog/products/:id
    ├── cart/          # GET /cart, POST /cart/items
    ├── checkout/      # POST /checkout
    ├── orders/        # GET /orders/:id, POST /orders/:id/manage
    ├── customers/     # placeholder (not wired into AppModule)
    └── notifications/ # placeholder (not wired into AppModule)
```

## HTTP surface (current iteration — mocked, in-memory)

| Method | Path                       | Notes                                                     |
| ------ | -------------------------- | --------------------------------------------------------- |
| GET    | `/health`                  | Liveness; `checks.db` is `"skipped"` for now.             |
| GET    | `/catalog/products`        | Deterministic catalog of seven products.                  |
| GET    | `/catalog/products/:id`    | `prod_unknown` returns 404 for error-path tests.          |
| GET    | `/cart`                    | Current cart snapshot.                                    |
| POST   | `/cart/items`              | Adds a product line; returns the updated cart.            |
| POST   | `/checkout`                | Converts the cart to an order; resets the cart.           |
| GET    | `/orders/:id`              | `ord_demo` is pre-seeded; unknown ids return 404.         |
| POST   | `/orders/:id/manage`       | Actions: `cancel`, `update_status`, `mark_prepared`.      |

## Local run

From the repo root:

```bash
# 1. Install workspace deps (one time)
pnpm install

# 2. Start Postgres in the background (BFF does not yet read from it)
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

Prisma schema lives in `prisma/schema.prisma`. The schema is intentionally
empty in this iteration. Postgres is provisioned via Docker Compose so the
connection wiring lands incrementally.

## Next iteration TODOs

- [ ] Replace mocked module bodies with Prisma-backed repositories.
- [ ] Add `@nestjs/swagger` and serve OpenAPI on `/docs` from `packages/contracts`.
- [ ] Wire OpenTelemetry SDK in `src/common/telemetry.ts` (OTLP exporter env-configurable).
- [ ] Add Pact provider verification entry point under `tests/contract`.
- [ ] Lint rule that forbids cross-module internal imports.
