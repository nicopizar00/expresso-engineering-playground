# Local Development Guide

Linear walkthrough of the local stack, from the repository root. Finish the
[README quick start](../README.md#quick-start) first. Every `./dev <cmd>` has a
`pnpm pg:<cmd>` and `task` equivalent — see [`cli-reference.md`](cli-reference.md).
Container inventory: [`architecture/containers.md`](architecture/containers.md);
request topology: [`architecture/web-entry-point.md`](architecture/web-entry-point.md).

## 1. Core stack

```bash
./dev up
```

| Service          | Port | Role                                    |
| ---------------- | ---- | --------------------------------------- |
| `postgres`       | 5432 | Catalog, orders, and auth persistence   |
| `otel-collector` | 4317 | OTLP gRPC ingest                        |
| `bff`            | 3001 | NestJS API (`/health`, `/products*`, …) |

`./dev up` runs `prisma migrate deploy` and `prisma db seed` inside the BFF
container — no host Prisma needed. `./dev seed` re-runs the seed (catalog plus
the `ord_demo` order).

## 2. BFF tour with curl

The cart is per-session and lives in BFF memory, so it resets on BFF restart;
orders persist in Postgres. Reuse one cookie jar so cart, checkout, and
`/orders?owner=session` share the anonymous session.

```bash
# Catalog
curl -s http://localhost:3001/products | jq
curl -s http://localhost:3001/products/prod_espresso | jq

# Cart
curl -s -c cookies.txt -b cookies.txt -X POST http://localhost:3001/cart/items \
  -H 'Content-Type: application/json' \
  -d '{"productId":"prod_espresso","quantity":1}' | jq
CART_ID=$(curl -s -c cookies.txt -b cookies.txt http://localhost:3001/cart | jq -r '.cartId')

# Checkout — returns the new orderId
ORDER_ID=$(curl -s -c cookies.txt -b cookies.txt -X POST http://localhost:3001/orders \
  -H 'Content-Type: application/json' \
  -d "{\"cartId\":\"$CART_ID\"}" | jq -r '.orderId')

# Orders (hot until ORDER_COOL_DOWN_SECONDS after placedAt, then cold)
curl -s http://localhost:3001/orders | jq
curl -s "http://localhost:3001/orders/$ORDER_ID/status" | jq
curl -s -c cookies.txt -b cookies.txt "http://localhost:3001/orders?owner=session" | jq

# Visualization feed (read-only aggregate used by the 3D scene)
curl -s http://localhost:3001/visualization | jq '.items | length'
```

## 3. Smoke validation

```bash
./dev smoke
```

Calls every core endpoint in sequence (developer check, not a performance
test). Expected output:

```
Playground Smoke Test

Target: http://localhost:3001

  ✓ GET  /health
  ✓ GET  /products
  ✓ GET  /products/prod_espresso
  ✓ POST /cart/items
  ✓ POST /cart/items (2nd, rejected — cart occupied)
  ✓ GET  /cart
  ✓ PATCH /cart/items/:id (rejected — quantity change not allowed)
  ✓ DELETE /cart/items/:id (rejected — removal not allowed once selected)
  ✓ POST /orders (rejected — customerName not accepted)
  ✓ POST /orders
  ✓ GET  /orders/ord_demo
  ✓ GET  /orders/ord_demo/status (typed temperature)
  ✓ GET  /orders?owner=session (session-owned)
  ✓ GET  /orders?owner=bogus (rejected)
  ✓ GET  /catalog/products (retired → 404)
  ✓ POST /auth/register
  ✓ GET  /me
  ✓ POST /orders (orderFor self)
  ✓ GET  /me/orders (latest hot)
  ✓ GET  /me/hot-status (hot count)
  ✓ GET  /visualization
  ✓ GET  /visualization (scene shape)
  ✓ GET  /visualization/events (SSE)

All 23 smoke checks passed.
```

## 4. Web app

```bash
./dev up web
```

Open <http://localhost:3000>. The browser talks only to the web app, which
proxies `/api/bff/*` to the BFF and `/viz/*` to the visualizer. The app is a
single page (`/`): a 3D visualizer stage sits above four sections switched from
the header nav.

| Section     | Purpose                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| Catalog     | Browse the seeded catalog, add to cart, check out from the inline panel. |
| Orders      | My orders (default) and All orders tabs with Hot/Cold badges; read-only. |
| Performance | Mock-only Performance Playground (no live telemetry).                    |
| API         | API wiring and demo-mode behavior.                                       |

Suggested run-through: add the cup to the cart, proceed to checkout, place the
order, and confirm the Orders section shows it with a Hot badge.

## 5. 3D visualizer

```bash
./dev up viz       # visualizer only
./dev up full      # everything: web, visualizer, Prisma Studio, observability
```

Open <http://localhost:3002>. The scene subscribes to
`GET /visualization/events` (SSE); the HUD shows `live (sse) · N objects`, or
falls back to polling `GET /visualization`. The visualizer never reads
Postgres directly — see [`architecture/bff-modules.md`](architecture/bff-modules.md).

## 6. Observability

```bash
./dev up obs
./dev hack trace GET /products    # span tree from Tempo
```

Grafana runs at <http://localhost:3030> (admin/admin) with the `BFF Overview`
dashboard. Topology: [`architecture/observability.md`](architecture/observability.md).

## 7. Hot reload

```bash
./dev dev
```

Switches the BFF and web containers to their `dev` stages and runs
`docker compose watch`. Edits under `apps/bff/src/**` trigger
`nest start --watch`; edits under `apps/web/app/**` or `apps/web/src/**`
trigger `next dev` HMR. `Ctrl+C` exits watch mode; containers keep running.

### Host mode (Node + pnpm)

For a debugger or IDE integration, run apps on the host. Requires Node ≥ 20
and pnpm 9.

```bash
pnpm install
pnpm pg:up           # infrastructure in Docker
pnpm pg:dev:host     # turbo run dev on the host
```

Leave `BFF_INTERNAL_URL` / `VISUALIZER_INTERNAL_URL` unset in `.env` so the web
proxy falls back to `localhost`.

## 8. Performance (k6)

```bash
python3 -m pip install -r vendor/punch/requirements.txt   # once
docker compose -f infra/docker/compose.performance.yaml build k6
./dev perf:http-purchase --config 1-iteration
```

Each `./dev perf:<workflow>` selects one repository-owned YAML workflow that
Punch validates and runs once through Docker Compose; reports land in
`tests/performance/k6/reports/` (`./dev perf:clean` removes them). `--config`
picks the k6 load shape from `tests/performance/k6/options/`. Workflows,
datasets, and thresholds: [`tests/performance/k6/README.md`](../tests/performance/k6/README.md).

## 9. Logs and teardown

```bash
./dev logs        # follow compose logs (Ctrl+C to stop)
./dev status      # service health
./dev down        # stop all containers; Postgres volume preserved
./dev reset       # same, and prints the destructive `down -v` command
```

## Troubleshooting

| Symptom                               | Fix                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Cannot connect to the Docker daemon` | Start Docker Desktop (macOS) or `sudo systemctl start docker` (Linux).                                                                                       |
| Port already in use                   | `lsof -ti:3001 \| xargs kill`, or change `BFF_PORT` / `WEB_PORT` / `VIZ_PORT` in `.env`.                                                                     |
| `./dev smoke` shows `fetch failed`    | `./dev status` — `bff` should be `running` + `healthy`.                                                                                                      |
| Web app cannot reach the BFF          | `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/bff/health` should print `200`. Unset `NEXT_PUBLIC_API_BASE_URL` — it overrides the proxy. |
| Cart empty after restart              | Expected: the cart lives in BFF memory. Orders persist.                                                                                                      |
| Stale containers after a crash        | `./dev down && ./dev up`.                                                                                                                                    |
| `pnpm install` fails                  | Check `node --version` (≥ 20) and `pnpm --version` (9.x); install with `npm install -g pnpm@9`.                                                              |
