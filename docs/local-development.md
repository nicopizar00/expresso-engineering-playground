# Local Development Guide

This guide explains how to run the mini-commerce engineering playground
locally, validate the environment, and interact with the web app.

---

## Purpose

The playground ships both a Docker-only `./dev` command and a host-enabled
`pnpm pg:*` utility layer. Both cover starting applications, validating
endpoints, and tearing down the stack from the **repository root**.

The stack consists of:

| Component       | Technology          | Default URL                  |
|-----------------|---------------------|------------------------------|
| Web app         | Next.js (App Router)| http://localhost:3000        |
| BFF / API       | NestJS              | http://localhost:3001        |
| PostgreSQL      | Postgres 16 (Docker)| localhost:5432               |
| OTel Collector  | OpenTelemetry       | localhost:4317 / 4318        |

> Catalog and orders are persisted through Prisma/PostgreSQL. The cart is
> intentionally stored in BFF process memory and resets when that process
> restarts.

---

## Prerequisites

| Tool             | Version       | Install reference                            |
|------------------|---------------|----------------------------------------------|
| Node.js          | >= 20.0.0     | https://nodejs.org or use `nvm`              |
| pnpm             | 9.x           | `npm install -g pnpm@9`                      |
| Docker Desktop   | >= 4.x        | https://docs.docker.com/desktop              |

Verify all prerequisites at once:

```bash
pnpm pg:doctor
```

---

## Install dependencies

```bash
pnpm install
```

This installs all workspace packages (BFF, web app, shared packages) in a
single command via pnpm workspaces.

---

## Validate the environment

```bash
pnpm pg:doctor
```

The doctor command checks:

- Node.js version (>= 20 required)
- pnpm availability
- Docker and Docker Compose availability
- `apps/web/.env.local` existence (warns if missing)
- Whether ports 3000 and 3001 are already occupied

### Set up environment

```bash
cp .env.example .env
```

Edit `.env` if the BFF runs on a non-default port:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

The Compose stack and wrapper commands load this root configuration. The web
app falls back to `http://localhost:3001` in host mode.

---

## Start local infrastructure

```bash
pnpm pg:up
```

This starts **PostgreSQL**, the **OpenTelemetry Collector**, and the **BFF**
using Docker Compose (`infra/docker/compose.yaml`). Migrations and seed data
are applied as part of the startup flow.

To verify Postgres is healthy:

```bash
docker compose -f infra/docker/compose.yaml ps
```

---

## Start the web app

```bash
pnpm pg:up web
```

This adds the containerized web app on http://localhost:3000. For hot reload
in containers use `pnpm pg:dev`; for host-mode application processes use
`pnpm pg:dev:host`.

---

## Open and interact with the web app

```bash
pnpm pg:open
```

This prints all local URLs. Open http://localhost:3000 in a browser.

The web app exposes the customer flow plus development diagnostics:

| Route | Purpose |
|-------|---------|
| `/` | Browse the seeded catalog and add items to the cart. |
| `/cart` | Inspect cart lines and proceed to checkout. |
| `/checkout` | Place an order with a fictional customer name. |
| `/orders` | List persisted orders. |
| `/orders/<orderId>` | View and manage a persisted order. |
| `/visualizer` | Embed the standalone Three.js visualizer. |
| `/dev` | Inspect API wiring and demo-mode behavior. |

### Suggested manual run-through

1. Browse the catalog on `/` and add one or more items.
2. Review totals on `/cart` and continue to checkout.
3. Enter a fictional customer name on `/checkout`.
4. Confirm the resulting order detail page and update its status.
5. Visit `/orders` to confirm the order appears in the persisted list.
6. Open `/visualizer` to inspect the BFF-projected scene.

---

## Run the local smoke validation

```bash
pnpm pg:smoke
```

The smoke test calls the core mini-commerce endpoints in sequence. This is a
developer validation check, not a performance test. Cart and checkout share
in-memory cart state, so its write flow runs sequentially.

Example output:

```
Playground Smoke Test

Target: http://localhost:3001

  ✓ GET  /health
  ✓ GET  /catalog/products
  ✓ GET  /catalog/products/prod_espresso
  ✓ POST /cart/items
  ✓ GET  /cart
  ✓ POST /checkout
  ✓ GET  /orders/ord_demo
  ✓ POST /orders/ord_demo/manage (mark_prepared)
  ✓ GET  /visualization-data

All 9 smoke checks passed.
```

The smoke test requires the BFF to be running (`pnpm pg:dev` or
`pnpm --filter @mini-commerce/bff dev`).

---

## Performance testing with k6

The Docker-based k6 layer includes runnable smoke, checkout-flow, and
read-heavy scenarios targeting the same BFF. See
[`tests/performance/k6/README.md`](../tests/performance/k6/README.md) for
commands and current limitations.

---

## Seed local data

```bash
pnpm pg:seed
```

The seed task populates the persisted catalog and the `ord_demo` order in
PostgreSQL so catalog and order endpoints are usable immediately. It does not
seed the in-memory cart.

---

## Stop the environment

Stop only Docker services (keeps volumes):

```bash
pnpm pg:down
```

Stop and **reset** to a clean state (volumes are preserved; explains how to
remove them):

```bash
pnpm pg:reset
```

To completely remove Postgres data volumes (destructive):

```bash
docker compose -f infra/docker/compose.yaml down -v
```

---

## Viewing logs

Stream Docker Compose service logs (Ctrl+C to stop):

```bash
pnpm pg:logs
```

BFF and web app logs appear directly in the terminal where `pnpm pg:dev`
is running.

---

## Troubleshooting

### Port conflict: address already in use

Check what is using the port:

```bash
lsof -i :3000    # web app
lsof -i :3001    # BFF
lsof -i :5432    # Postgres
```

Stop the conflicting process or change the port:

- BFF: set `PORT=3002` in `apps/bff/.env` and update the Docker Compose
  mapping if needed.
- Web app: change the port in `apps/web/package.json` (`next dev --port 3002`)
  and update `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.local`.

---

### Docker is not running

```
docker compose up failed
```

Start Docker Desktop and retry `pnpm pg:up`. Verify with:

```bash
docker info
```

---

### Missing environment files

```
! apps/web/.env.local not found
```

Run `cp .env.example .env` from the repository root.

---

### Cart is empty after restart

The cart lives in BFF process memory. Restarting the BFF clears it. This is
expected until a deliberate session/cart persistence design is adopted;
orders are unaffected because they persist in PostgreSQL.

---

### API not reachable from the web app

Symptom: The web app UI shows an error in the response box.

1. Confirm the BFF is running: `pnpm pg:smoke`
2. Check `.env` — `NEXT_PUBLIC_API_BASE_URL` must match the
   BFF port.
3. CORS is enabled for all origins in development (`CORS_ORIGIN=*`). If you
   see CORS errors, verify the BFF started without errors:
   `pnpm --filter @mini-commerce/bff dev`

---

### pnpm install fails

```bash
node --version   # must be >= 20
pnpm --version   # must be 9.x
```

If pnpm is missing: `npm install -g pnpm@9`

---

## Reference

| Command          | What it does                                    |
|------------------|-------------------------------------------------|
| `pnpm pg:doctor` | Validate local prerequisites                    |
| `pnpm pg:up`     | Start Postgres, OTel Collector, and BFF         |
| `pnpm pg:up web` | Add the containerized web app                   |
| `pnpm pg:dev`    | Run web app and BFF with Compose watch          |
| `pnpm pg:smoke`  | Run endpoint smoke validation                   |
| `pnpm pg:seed`   | Seed persisted catalog and order demo data      |
| `pnpm pg:reset`  | Stop containers, keep volumes                   |
| `pnpm pg:down`   | Stop Docker Compose services                    |
| `pnpm pg:logs`   | Stream Docker Compose logs                      |
| `pnpm pg:open`   | Print local URLs                                |
