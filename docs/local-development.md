# Local Development Guide

This guide explains how to run the mini-commerce engineering playground
locally, validate the environment, and interact with the web app.

---

## Purpose

The playground ships a Docker-only `./dev` command and a host-enabled
`pnpm pg:*` utility layer. Both converge on `python3 -m pg` and cover the same
local-stack operations from the **repository root**.

For the full container inventory see
[`architecture/containers.md`](architecture/containers.md). For the request
topology see
[`architecture/web-entry-point.md`](architecture/web-entry-point.md). This
guide focuses on **host-mode operations** and troubleshooting.

> Catalog and orders are persisted through Prisma/PostgreSQL. The cart is
> intentionally stored in BFF process memory and resets when that process
> restarts.

---

## Prerequisites

| Tool | Version | Required for | Install |
|---|---|---|---|
| Docker Desktop | ≥ 4.x | The stack (always) | https://docs.docker.com/desktop |
| Python | ≥ 3.9 | The orchestrator (always) | System Python on macOS works |
| Node.js | ≥ 20 | Host-mode dev + `pnpm pg:*` (optional) | https://nodejs.org or `nvm` |
| pnpm | 9.x | Same as above | `npm install -g pnpm@9` |

Verify everything at once:

```bash
pnpm pg:doctor       # or: ./dev doctor
```

The doctor checks Docker reachability, Python version, root `.env`, and port
collisions on `BFF_PORT` / `WEB_PORT`. Node and pnpm are reported as
informational — they only matter for the host-mode path below.

---

## Install dependencies

```bash
pnpm install
```

This installs all workspace packages (BFF, web app, shared packages) in a
single command via pnpm workspaces.

---

## Set up environment

```bash
cp .env.example .env
```

The Compose stack and wrapper commands load this root configuration. You rarely
need to edit it:

- The browser reaches the BFF through the web app's own `/api/bff` proxy, so no
  `NEXT_PUBLIC_API_BASE_URL` is required (it is an optional override only).
- Compose sets the internal proxy targets (`BFF_INTERNAL_URL`,
  `VISUALIZER_INTERNAL_URL`) to the in-container service names automatically.
  Leave them unset in `.env` so host dev (`pnpm pg:dev:host`) falls back to
  `localhost`.

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
| `/visualizer` | Embed the Three.js visualizer via the `/viz` proxy (start with `pnpm pg:up viz` or `full`). |
| `/performance` | Mock-only Performance Playground (no live telemetry). |
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
  ✓ POST /cart/items (2nd)
  ✓ GET  /cart
  ✓ PATCH /cart/items/:id
  ✓ DELETE /cart/items/:id
  ✓ POST /checkout
  ✓ GET  /orders/ord_demo
  ✓ POST /orders/ord_demo/manage (mark_prepared)
  ✓ GET  /visualization-data
  ✓ GET  /visualization-updates (SSE frame)

All 13 smoke checks passed.
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

The browser calls the web app's own `/api/bff` proxy (same origin), so there is
no browser CORS dependency for the main app.

1. Confirm the BFF is running: `pnpm pg:smoke`.
2. Confirm the proxy resolves: `curl -s -o /dev/null -w '%{http_code}'
   http://localhost:3000/api/bff/health` should return `200`.
3. In Docker, the proxy target is `BFF_INTERNAL_URL=http://bff:3001`; for host
   dev it falls back to `http://localhost:3001`. If you set
   `NEXT_PUBLIC_API_BASE_URL`, it overrides the proxy — unset it to use the
   proxy.

---

### pnpm install fails

```bash
node --version   # must be >= 20
pnpm --version   # must be 9.x
```

If pnpm is missing: `npm install -g pnpm@9`

---

## Reference

Full command matrix (with `./dev`, `pnpm pg:*`, `task` side by side, plus the
`hack` debugging affordances) lives in
[`cli-reference.md`](cli-reference.md).
