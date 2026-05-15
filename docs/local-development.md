# Local Development Guide

This guide explains how to run the mini-commerce engineering playground
locally, validate the environment, and interact with the web app.

---

## Purpose

The playground ships a developer utility layer (`pnpm pg:*`) that wraps
common local tasks: starting infrastructure, running applications, validating
endpoints, and tearing down the stack. All commands run from the **repository
root**.

The stack consists of:

| Component       | Technology          | Default URL                  |
|-----------------|---------------------|------------------------------|
| Web app         | Next.js (App Router)| http://localhost:3000        |
| BFF / API       | NestJS              | http://localhost:3001        |
| PostgreSQL      | Postgres 16 (Docker)| localhost:5432               |
| OTel Collector  | OpenTelemetry       | localhost:4317 / 4318        |

> All BFF responses are currently **mocked in-memory**. PostgreSQL is
> provisioned and reachable but not yet read by the BFF. This changes once
> Prisma persistence lands.

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

### Set up environment files

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local` if the BFF runs on a non-default port:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

The web app falls back to `http://localhost:3001` if the variable is not set,
so this step is optional for the default local setup.

---

## Start local infrastructure

```bash
pnpm pg:up
```

This starts **PostgreSQL** and the **OpenTelemetry Collector** in the
background using Docker Compose (`infra/docker/compose.yaml`).

To verify Postgres is healthy:

```bash
docker compose -f infra/docker/compose.yaml ps
```

---

## Start the web app and BFF

```bash
pnpm pg:dev
```

This delegates to `turbo run dev`, which starts all workspace applications
in parallel with hot-reload:

- **BFF** on http://localhost:3001 (`apps/bff`, NestJS)
- **Web app** on http://localhost:3000 (`apps/web`, Next.js)

Wait for both services to print their startup messages before opening the
browser.

---

## Open and interact with the web app

```bash
pnpm pg:open
```

This prints all local URLs. Open http://localhost:3000 in a browser.

The playground UI exposes seven panels, intentionally utilitarian — the goal
is to validate the BFF endpoints, not to be a polished storefront:

| Panel                  | Action                                          |
|------------------------|-------------------------------------------------|
| Health Check           | `GET /health`                                   |
| Catalog — Load Products| `GET /catalog/products` (renders a product list) |
| Cart — Add Item        | `POST /cart/items` (picks from the loaded list) |
| Cart — View            | `GET /cart`                                     |
| Checkout               | `POST /checkout` (converts cart to order)       |
| Order — Lookup         | `GET /orders/:id` (`ord_demo` is pre-seeded)    |
| Order — Manage         | `POST /orders/:id/manage` (cancel / update_status / mark_prepared) |

Each panel shows the raw JSON response from the BFF directly below the
action button. All data is fictional.

### Suggested manual run-through

1. Click **GET /health** — confirm the BFF is up.
2. Click **GET /catalog/products** — the product list populates the dropdown
   in the Add Item panel.
3. Pick a product, set a quantity, click **POST /cart/items** — repeat to
   build up a multi-line cart.
4. Click **GET /cart** — confirm the cart total reflects the lines.
5. Set a customer name, click **POST /checkout** — note the returned
   `orderId`. The cart resets on success.
6. Paste the new `orderId` (or use `ord_demo`) into **Order Lookup** to
   inspect the order.
7. In **Order Manage**, try each action: `mark_prepared`, `update_status`
   (with `nextStatus`), and `cancel`. Each returns the previous + new status.

---

## Run the local smoke validation

```bash
pnpm pg:smoke
```

The smoke test calls all the mini-commerce endpoints in sequence and prints
`✓ PASS` or `✗ FAIL` for each. This is a developer validation check, not a
performance test. Cart and checkout share in-memory state, so the checks
run sequentially rather than in parallel.

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

All 8 smoke checks passed.
```

The smoke test requires the BFF to be running (`pnpm pg:dev` or
`pnpm --filter @mini-commerce/bff dev`).

---

## How this enables performance testing with k6 (next iteration)

The smoke validation is the **prerequisite gate** before k6 is connected.
Once the endpoints above are validated, k6 scenarios can target the same
URLs via env vars and reuse the same fictional product / order ids without
any additional setup. See [`tests/performance/k6/README.md`](../tests/performance/k6/README.md)
for the integration checklist. k6 is not connected in this iteration.

---

## Seed local data

```bash
pnpm pg:seed
```

The BFF currently serves deterministic mock responses in-memory. No database
seeding is required. The order `ord_demo` is pre-seeded inside
`OrdersService` so the `/orders/:id` and `/orders/:id/manage` endpoints can
be exercised immediately without first running a checkout.

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

Run:

```bash
cp apps/web/.env.example apps/web/.env.local
```

---

### Cart is empty after restart

The cart lives in BFF process memory. Restarting the BFF (e.g. via
`pnpm pg:dev` re-launch) clears it. This is expected for this iteration and
goes away once persistence lands.

---

### API not reachable from the web app

Symptom: The web app UI shows an error in the response box.

1. Confirm the BFF is running: `pnpm pg:smoke`
2. Check `apps/web/.env.local` — `NEXT_PUBLIC_API_BASE_URL` must match the
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
| `pnpm pg:up`     | Start Postgres + OTel Collector in Docker       |
| `pnpm pg:dev`    | Start web app + BFF in watch mode               |
| `pnpm pg:smoke`  | Run endpoint smoke validation                   |
| `pnpm pg:seed`   | Explain mock data status (placeholder)          |
| `pnpm pg:reset`  | Stop containers, keep volumes                   |
| `pnpm pg:down`   | Stop Docker Compose services                    |
| `pnpm pg:logs`   | Stream Docker Compose logs                      |
| `pnpm pg:open`   | Print local URLs                                |
