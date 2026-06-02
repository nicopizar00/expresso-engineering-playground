# Mini Commerce Engineering Playground

A small, runnable mini-commerce store (catalog → cart → checkout →
orders → 3D visualizer) used as a sandbox for software engineering,
testing, observability, and performance practices. This README is a
**linear walkthrough**: paste the commands in a terminal, in order, and
you will have the full stack running in about 10 minutes. The only
host-side tools you need are **Docker** and **Homebrew** (or your
Linux distro's package manager).

For host-mode development (Node + pnpm + Turborepo), see
[`docs/local-development.md`](./docs/local-development.md). For a side-by-side
view of every CLI option (`./dev`, `pnpm pg:*`, `task`), see
[`docs/cli-reference.md`](./docs/cli-reference.md).

---

## Prerequisites

### macOS

```bash
brew install --cask docker     # Docker Desktop (bundles Compose v2)
brew install jq                # JSON pretty-printing for the curl walkthrough
```

Open **Docker Desktop** once after install so the daemon starts. Subsequent
terminal commands will then work without launching it manually.

### Linux

Install Docker Engine + the Compose v2 plugin via the official guide at
<https://docs.docker.com/engine/install/>. Add your user to the `docker`
group, log out and back in, then:

```bash
sudo apt install jq        # Debian/Ubuntu (use dnf / pacman / apk on others)
```

### Verify

```bash
docker --version           # Docker version 24.x or newer
docker compose version     # Docker Compose version v2.x
jq --version               # jq-1.6 or newer
```

If all three commands print a version line, you're ready.

---

## Quick Start (5 minutes)

From a freshly cloned repo, in the repo root:

```bash
cp .env.example .env       # one-time setup — gitignored local config
./dev doctor               # validate prerequisites (Docker + Python ≥ 3.9)
./dev up                   # postgres + otel-collector + bff
./dev smoke                # hit every BFF endpoint, assert 200/201, and check an SSE frame
```

Expected final line:

```
All 13 smoke checks passed.
```

If you got that, the stack is live at <http://localhost:3001>. Open the
health endpoint to confirm:

```bash
curl -s http://localhost:3001/health | jq
```

---

## Walkthrough (≈ 20 minutes)

Each step builds on the previous one. Run them in order; nothing
requires Node, pnpm, or any host language runtime.

### Step 1 — Start the core stack

```bash
./dev up
```

This brings up three containers:

| Service          | Port  | Role                                       |
| ---------------- | ----- | ------------------------------------------ |
| `postgres`       | 5432  | Catalog and orders persistence             |
| `otel-collector` | 4317  | OTLP gRPC ingest (placeholder pipeline)    |
| `bff`            | 3001  | NestJS API (`/health`, `/catalog/*`, …)    |

On first run, `./dev up` also runs `prisma migrate deploy` and
`prisma db seed` **inside the BFF container** — no host Prisma needed.

Verify with the browser at <http://localhost:3001/health> or:

```bash
curl -s http://localhost:3001/health | jq
```

### Step 2 — Explore the BFF via curl

The BFF speaks the catalog → cart → checkout → orders flow over HTTP.
Run these one by one; each prints the response you'll see in subsequent
steps.

```bash
# Catalog
curl -s http://localhost:3001/catalog/products | jq
curl -s http://localhost:3001/catalog/products/prod_espresso | jq

# Cart (single-user, in-process — resets on BFF restart)
curl -s -X POST http://localhost:3001/cart/items \
  -H 'Content-Type: application/json' \
  -d '{"productId":"prod_espresso","quantity":2}' | jq
curl -s http://localhost:3001/cart | jq

# Checkout — returns the new orderId
ORDER_ID=$(curl -s -X POST http://localhost:3001/checkout \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Walkthrough Buyer"}' | jq -r '.orderId')
echo "Created order: $ORDER_ID"

# Orders
curl -s http://localhost:3001/orders | jq
curl -s "http://localhost:3001/orders/$ORDER_ID" | jq
curl -s -X POST "http://localhost:3001/orders/$ORDER_ID/manage" \
  -H 'Content-Type: application/json' \
  -d '{"action":"mark_prepared"}' | jq

# Visualization feed (read-only aggregator used by the 3D scene)
curl -s http://localhost:3001/visualization-data | jq '.items | length'
```

The cart is intentionally in-process and clears on BFF restart. Orders
are persisted in Postgres and survive restarts.

### Step 3 — Add the web app

```bash
./dev up web
```

Then open <http://localhost:3000> and walk this path:

| # | Route               | Action                              | Expected result                                  |
| - | ------------------- | ----------------------------------- | ------------------------------------------------ |
| 1 | `/`                 | Browse the seeded catalog           | 7 products: espresso, latte, sandwich, cookie, water, notebook, backpack |
| 2 | `/` → product card  | Click **Add to cart**               | Cart counter increments                          |
| 3 | `/cart`             | Review items + totals               | Line items, EUR subtotal, **Proceed to checkout** CTA |
| 4 | `/checkout`         | Enter a customer name, submit       | Redirect to `/orders/<orderId>`                  |
| 5 | `/orders/<orderId>` | Trigger `mark_prepared` / `cancel`  | Status badge updates live                        |
| 6 | `/orders`           | View orders list                    | The new order plus the seeded `ord_demo`         |
| 7 | `/visualizer`       | Embedded 3D scene                   | Iframe loads the standalone visualizer          |
| 8 | `/performance`      | Explore simulated load scenarios    | Mock-data KPIs and request-flow visualization    |
| 9 | `/dev`              | Dev-only diagnostics                | API client wiring, demo-mode toggle, and Performance link |

### Step 4 — Add the 3D visualizer

```bash
./dev up viz       # only the visualizer
./dev up full      # visualizer + Prisma Studio + observability
```

Open <http://localhost:3002>. The visualizer connects to SSE for live
domain-state updates; the HUD reports `live (sse) · N items` or falls
back to polling if the SSE stream is unavailable.

The visualizer reads only `GET /visualization-data` and `GET /visualization-updates`;
it never connects to Postgres directly. This boundary is load-bearing for the
Phase 3 service extraction — see
[`docs/architecture/bff-modules.md`](./docs/architecture/bff-modules.md).

### Step 5 — Add the observability stack (optional)

```bash
./dev up obs
./dev hack trace GET /catalog/products    # span tree from Tempo
```

Open <http://localhost:3030> (admin/admin) for Grafana with the `BFF
Overview` dashboard. Topology and current limits are in
[`docs/architecture/observability.md`](./docs/architecture/observability.md).

### Step 6 — Inner-loop development with hot reload

```bash
./dev dev
```

This switches the BFF and web containers to their `dev` Docker stages
and starts `docker compose watch`. Editing `apps/bff/src/**` syncs
into the container, where `nest start --watch` rebuilds. Editing
`apps/web/app/**` or `apps/web/src/**` triggers `next dev` HMR.

Try it: open `apps/bff/src/modules/health/health.controller.ts`, change
the response shape, save, then re-hit the endpoint:

```bash
curl -s http://localhost:3001/health | jq
```

`Ctrl+C` to exit watch mode (containers keep running).

### Step 7 — Run the performance smoke

```bash
./dev perf:smoke
```

This pulls `grafana/k6:latest` and runs the smoke scenario against the
local BFF (~20 seconds). The summary lands in
`tests/performance/k6/reports/`. Two larger profiles
(`checkout-flow`, `read-heavy`) live alongside it — see
[`tests/performance/k6/README.md`](./tests/performance/k6/README.md)
for how to run them and what their thresholds mean.

```bash
./dev perf:clean           # remove generated reports when done
```

### Step 8 — Teardown

```bash
./dev down                 # stop all containers (postgres volume preserved)
```

Re-running `./dev up` restores the same data. To wipe Postgres
completely:

```bash
docker compose --profile web --profile viz \
  -f infra/docker/compose.yaml down -v
```

---

## Troubleshooting

| Symptom                                          | Fix                                                        |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `Cannot connect to the Docker daemon`            | Start Docker Desktop (macOS) or `sudo systemctl start docker` (Linux). |
| `Port 3001 still occupied`                       | `lsof -ti:3001 \| xargs kill` — or change `BFF_PORT` in `.env`. |
| `./dev smoke` shows `fetch failed`               | Run `./dev status` — the bff service should be `running` + `healthy`. |
| Web app shows `ECONNREFUSED` calling the BFF     | Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` in `.env`. |
| Stale containers after a crash                   | `./dev down` then `./dev up`. For a full reset, use the `down -v` command in Step 8. |
| Need to read logs                                | `./dev logs` (Ctrl+C to stop following).                   |

---

## What's in this repo

```
apps/
  bff/             NestJS API
  web/             Next.js 14 App Router frontend
  visualizer-3d/   Static Three.js scene served via nginx
packages/          Shared TypeScript libraries
tests/             Cross-app test suites (integration, contract, e2e, performance)
infra/             Docker Compose stacks + observability configs
scripts/pg/        Python orchestrator package (driven by `./dev`)
docs/              Documentation hub — start at docs/README.md
```

The current iteration is a **modular monolith**: catalog and orders are
persisted with Prisma/PostgreSQL, while the intentionally single-user cart
remains in process memory. The folder structure is designed so the Phase 3
jump to distributed services is a relocation, not a rewrite. Full container
inventory: [`docs/architecture/containers.md`](./docs/architecture/containers.md).

---

## Further reading

- [`docs/README.md`](./docs/README.md) — documentation hub (start here for
  any non-walkthrough question).
- [`docs/cli-reference.md`](./docs/cli-reference.md) — `./dev`, `pnpm pg:*`,
  `task` side by side, plus the `hack` debugging affordances.
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code execution rules.
- [`docs/ai/README.md`](./docs/ai/README.md) — which AI assistant for which job.

---

## Optional — host-mode (Node + pnpm)

If you want to run apps directly on the host (debugger attach, IDE
integration, faster cold start for some workflows), install Node ≥ 20
and pnpm 9, then:

```bash
pnpm install
pnpm pg:doctor
pnpm pg:up
pnpm pg:dev          # docker compose watch (same as ./dev dev)
pnpm pg:dev:host     # turbo run dev on the host (no containers for apps)
```

Every `./dev <cmd>` has a `pnpm pg:<cmd>` equivalent. The full mapping
is in [`docs/cli-reference.md`](./docs/cli-reference.md). The host-mode
path is the **only** way to run `pnpm pg:perf:checkout-flow` and
`pnpm pg:perf:read-heavy` today (the `./dev` CLI ships `perf:smoke`
only).
