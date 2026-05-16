# Mini Commerce Engineering Playground

A professional, opinionated playground for experimenting with software
engineering, the software development lifecycle, software quality engineering,
performance engineering, software architecture, DevOps, observability, and
AI-assisted engineering practices.

The domain is a **fictional mini-commerce store**: a small catalog of
products, a cart, a checkout, and an order lifecycle. No real company names,
internal services, credentials, URLs, or proprietary details are used
anywhere in this repository.

---

## Local Quick Start

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Validate prerequisites (Node >=20, pnpm, Docker)
pnpm pg:doctor

# 3. Start Postgres + OTel Collector in Docker
pnpm pg:up

# 4. Start the web app (port 3000) and BFF (port 3001) in watch mode
pnpm pg:dev

# 5. Open in a browser
open http://localhost:3000

# 6. Run the endpoint smoke validation
pnpm pg:smoke
```

See [docs/local-development.md](./docs/local-development.md) for the full
setup guide, environment configuration, and troubleshooting.

---

## Testing the main features

Once the stack is running (`pnpm pg:up` + `pnpm pg:dev`), the following
recipes exercise every feature currently implemented. They are ordered from
fastest sanity check to deepest end-to-end flow.

### A. One-shot health check (≈ 5 seconds)

```bash
pnpm pg:status      # show container health table
pnpm pg:smoke       # hit all 9 BFF endpoints and assert 200/201/202
```

`pg:smoke` walks: `/health` → `/catalog/products` →
`/catalog/products/:id` → `POST /cart/items` → `/cart` → `POST /checkout` →
`/orders/:id` → `POST /orders/:id/manage` → `/visualization-data`. If it
exits green, every wired endpoint works.

### B. Click-through in the web app (≈ 2 minutes)

The Next.js app at <http://localhost:3000> implements the full
catalog → cart → checkout → orders → visualizer journey.

| Step | Route | What to do | What you should see |
|------|-------|------------|---------------------|
| 1 | `/` | Browse the seeded catalog (7 products) | Product grid with espresso, latte, sandwich, cookie, water, notebook, backpack |
| 2 | `/` → product card | Click "Add to cart" | Cart counter increments |
| 3 | `/cart` | Review items and totals | Line items, subtotal in EUR, "Proceed to checkout" CTA |
| 4 | `/checkout` | Enter a customer name and submit | Redirect to `/orders/:orderId` with the new order |
| 5 | `/orders/:orderId` | Trigger management actions | `mark_prepared` and `cancel` transitions update the order status live |
| 6 | `/orders` | View the orders list | Newly placed order plus the pre-seeded `ord_demo` |
| 7 | `/visualizer` | View the 3D scene (embedded iframe) | Cubes (products), cone (cart), spheres (orders) — see §C for standalone view |
| 8 | `/dev` | Inspect API client wiring | Dev-only diagnostics page |

> The cart is **single-user, in-process** and resets when the BFF restarts —
> this is intentional for Phase 1. Orders persist in Postgres and survive
> restarts.

### C. Standalone 3D Visualizer (≈ 1 minute)

The Three.js visualizer is a separate Docker service that consumes
`GET /visualization-data` from the BFF — no DB access.

```bash
./scripts/visualizer-up.sh   # or: pnpm pg:up viz
open http://localhost:3002
```

Then, to **see BFF state reflected in 3D**:

1. In another tab, add cart items / place an order via the web app (§B) or
   curl (§D).
2. Back on <http://localhost:3002>, click **"Reload data"** in the HUD.
3. The scene rebuilds: products = cubes, cart = cone, orders = spheres,
   colored by status (green = ok, orange = warn, red = error).

> The visualizer does **not** auto-poll — reload is manual on purpose. See
> [`apps/visualizer-3d/README.md`](./apps/visualizer-3d/README.md).

### D. BFF endpoints via curl (≈ 1 minute)

Exercise the API surface directly. Substitute your own IDs as needed.

```bash
# Health
curl -s http://localhost:3001/health | jq

# Catalog
curl -s http://localhost:3001/catalog/products | jq
curl -s http://localhost:3001/catalog/products/prod_espresso | jq

# Cart (single-user, in-process)
curl -s -X POST http://localhost:3001/cart/items \
  -H 'Content-Type: application/json' \
  -d '{"productId":"prod_espresso","quantity":2}' | jq
curl -s http://localhost:3001/cart | jq

# Checkout — returns the new orderId
ORDER_ID=$(curl -s -X POST http://localhost:3001/checkout \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Test Buyer"}' | jq -r '.orderId')

# Orders
curl -s http://localhost:3001/orders | jq
curl -s "http://localhost:3001/orders/$ORDER_ID" | jq
curl -s -X POST "http://localhost:3001/orders/$ORDER_ID/manage" \
  -H 'Content-Type: application/json' \
  -d '{"action":"mark_prepared"}' | jq

# Visualizer feed
curl -s http://localhost:3001/visualization-data | jq
```

### E. Performance scenarios (k6 in Docker, ≈ 30 s – 5 min)

No host k6 install needed — these run `grafana/k6:latest` against the local
stack.

```bash
pnpm pg:perf:smoke          # 1 VU, ~20s — full happy path, regression catch
pnpm pg:perf:checkout-flow  # 1 VU, ~30s — orders persistence + status reads
pnpm pg:perf:read-heavy     # 0→30 VUs over 3m — GET-only baseline latency
pnpm pg:perf:open-report    # open the last HTML summary
pnpm pg:perf:clean          # remove generated reports
```

Reports land under `tests/performance/k6/reports/`. See
[`tests/performance/k6/README.md`](./tests/performance/k6/README.md) for
profile design and thresholds.

### F. Unit tests and type-check (≈ 30 s)

```bash
pnpm typecheck                        # tsc --noEmit across all packages
pnpm test                             # Vitest unit tests across all packages
pnpm --filter @mini-commerce/bff test # just the BFF
```

### Reset between runs

```bash
pnpm pg:reset    # drop + re-migrate + re-seed (clears orders)
pnpm pg:down     # stop containers cleanly
```

> Cart state lives in the BFF process — restarting `pg:dev` or `pg:reset`
> clears it. Orders are persisted in Postgres; only `pg:reset` (or a manual
> DB wipe) removes them.

---

## Frontend wiring status

The next open thread is wiring the Next.js web app to consume the BFF via a
centralized client (and eventually v0.app-generated UI). Two documents
track the state and plan:

- [`docs/project-state/frontend-wiring-status.md`](./docs/project-state/frontend-wiring-status.md)
  — branch comparison, backend / frontend readiness, integration gaps,
  recommended base branch, and the TODO list for v0.app wiring.
- [`docs/frontend/v0-wiring-plan.md`](./docs/frontend/v0-wiring-plan.md)
  — intended experience, endpoint contracts, screen inventory, what v0.app
  should and should not generate, and the TODO marker conventions used in
  `apps/web/`.

The starting point is the new API client at
[`apps/web/src/lib/api/expresso-api.ts`](./apps/web/src/lib/api/expresso-api.ts).

---

## 1. Purpose

This repository is intentionally **not** a production system. It is a
sandbox where engineering and quality practices can be explored end-to-end
against a realistic-looking domain:

- Designing a modular system before it grows distributed.
- Wiring up unit, integration, contract, end-to-end, and performance tests
  with clear ownership boundaries.
- Connecting an existing k6 performance engineering solution into a CI-ready
  layout (a deliberate next iteration — not yet wired).
- Exercising observability (traces, metrics, logs) with OpenTelemetry.
- Iterating on ADRs, lifecycle documentation, and quality strategy.
- Experimenting with AI-assisted engineering on a non-trivial codebase.

### Why mini-commerce?

Mini-commerce was chosen as the playground domain because it is:

- **Universally understood** — anyone has bought a coffee or a notebook,
  so the language never gets in the way of the engineering point.
- **Small but realistic** — catalog → cart → checkout → order is a complete,
  multi-step transaction with clear state transitions, but each step fits
  in a single mocked module.
- **Multi-actor** — customers, store operators, and notification consumers
  all have a natural place, which exercises module boundaries.
- **Performance-friendly** — product browse + checkout are textbook
  scenarios for k6 load profiles in a later iteration.

This first iteration is deliberately a **structural skeleton with mocked
business logic**: clear extension points, deterministic responses, and
`TODO`s. Real persistence and real payment processing are intentionally
absent.

---

## 2. Architecture Vision

The fictional product is a small store that lets customers browse a
catalog, add products to a cart, check out, and manage orders. The
architecture is staged in three explicit phases:

### Phase 1 — Modular monolith (current target)

- A single **BFF / API** application (`apps/bff`, NestJS) hosts all domain
  modules behind clear module boundaries: `catalog`, `cart`, `checkout`,
  `orders`, `customers`, `notifications`.
- A **web** application (`apps/web`, Next.js) consumes the BFF.
- Shared contracts live in `packages/contracts`; shared domain types in
  `packages/shared-types`.
- Persistence is centralized behind Prisma (PostgreSQL).

### Phase 2 — Modular monolith with strict boundaries

- Module-to-module communication moves through explicit interfaces (no
  cross-module imports of internals).
- Contract tests start enforcing producer / consumer expectations between
  the web app and the BFF.
- Observability is wired across module boundaries.

### Phase 3 — Distributed services (future)

- Selected modules (e.g. `checkout`, `notifications`) are extracted into
  independently deployable services.
- The BFF becomes an aggregation layer.
- Contracts in `packages/contracts` become the source of truth for inter-service
  communication.

The repository structure is designed so that **Phase 3 does not require a
reorganization** — only an extraction.

---

## 3. Repository Structure

```
.
├── apps/
│   ├── web/                  # Next.js web app (playground UI)
│   ├── visualizer-3d/        # Static Three.js 3D visualizer (nginx)
│   └── bff/                  # NestJS BFF / API
│                             # Domain modules: catalog, cart, checkout,
│                             # orders, customers, notifications, visualization
├── packages/
│   ├── shared-types/         # Cross-cutting TypeScript domain types
│   ├── contracts/            # API + event contracts (OpenAPI/JSON Schema/Pact)
│   ├── config/               # Shared config (eslint, tsconfig, etc.)
│   └── test-utils/           # Shared test helpers and fixtures
├── tests/
│   ├── integration/          # Cross-module integration tests (Vitest)
│   ├── contract/             # Pact consumer/provider tests
│   ├── e2e/                  # Playwright end-to-end tests
│   └── performance/
│       └── k6/               # k6 performance engineering solution (not yet wired)
├── infra/
│   ├── docker/               # Local development Docker Compose
│   └── observability/        # OpenTelemetry collector + dashboards
├── docs/
│   ├── architecture/         # C4-style architecture notes
│   ├── adr/                  # Architecture Decision Records
│   ├── quality-strategy/     # Test pyramid, quality gates, ownership
│   └── lifecycle/            # SDLC, branching, release strategy
├── scripts/
│   └── playground.mjs        # Developer utility CLI (pnpm pg:*)
└── .github/workflows/        # CI placeholders (lint, test, build, perf smoke)
```

The top-level layout maps directly to the **test pyramid** and to the
**deployment unit boundary**: each `apps/*` is a deployable, each
`packages/*` is shared library code, and each `tests/*` is a test type that
is owned and evolved independently.

---

## 4. Quality Engineering Strategy

Quality is structured as **layers of confidence**, each with a clear owner,
purpose, and runtime cost:

| Layer            | Location                  | Tooling     | Owner               | Runs                |
| ---------------- | ------------------------- | ----------- | ------------------- | ------------------- |
| Unit             | `apps/*` and `packages/*` | Vitest      | Feature engineers   | Pre-commit + CI     |
| Integration      | `tests/integration`       | Vitest      | Feature engineers   | CI                  |
| Contract         | `tests/contract`          | Pact        | Producer + consumer | CI                  |
| End-to-end       | `tests/e2e`               | Playwright  | QE                  | CI (smoke) + nightly |
| Performance      | `tests/performance/k6`    | k6          | Performance eng.    | On-demand + nightly |

Principles:

- **Shift left**: unit and integration tests run on every change.
- **Contract tests gate cross-boundary changes** before they reach E2E.
- **E2E tests stay thin**: golden paths only, not regression coverage.
- **Performance tests are first-class**, not an afterthought (see §5).
- **Observability is part of testability**: traces and metrics produced in
  test runs are usable as quality signals.

The detailed strategy lives in
[`docs/quality-strategy/`](./docs/quality-strategy/README.md).

---

## 5. Performance Engineering Foundation

The performance engineering layer lives at
[`tests/performance/k6/`](./tests/performance/k6/README.md) and is wired
into the playground today via a minimal Docker-based smoke runner.

```bash
# Terminal 1 — start the local stack
pnpm pg:dev

# Terminal 2 — run the k6 smoke profile against the local BFF
pnpm pg:perf:smoke

# Inspect or clear generated artifacts
pnpm pg:perf:open-report
pnpm pg:perf:clean
```

The smoke scenario walks the same nine endpoints as `pnpm pg:smoke`
(`/health`, `/catalog/products`, `/catalog/products/:id`, `/cart/items`,
`/cart`, `/checkout`, `/orders/:id`, `/orders/:id/manage`,
`/visualization-data`) so a regression shows up in either suite. The runner uses
`grafana/k6:latest` via
[`infra/docker/compose.performance.yaml`](./infra/docker/compose.performance.yaml)
— no local k6 install is needed.

**What is pending before full performance coverage:**

1. Import the existing k6 project into `tests/performance/k6/` (vendored
   copy or `git subtree` — see the folder README for both paths).
2. Replace the placeholder smoke scenario with the imported one and add
   real load + stress profiles.
3. Wire `pg:perf:smoke` into CI as a per-PR quality gate.
4. Export k6 metrics into the OpenTelemetry collector under
   `infra/observability/` to correlate runs with traces and logs.

### How this domain supports performance testing

The mini-commerce domain was chosen with k6 in mind:

- **`GET /catalog/products`** — read-heavy browse traffic, ideal for
  steady-state load profiles.
- **`POST /cart/items` → `GET /cart`** — write-then-read pattern that
  exercises in-process state and surfaces lock contention once persistence
  is real.
- **`POST /checkout`** — a clear write hotspot with deterministic outputs,
  perfect for measuring tail latency and error rates under stress.
- **`POST /orders/:id/manage`** — operator-side traffic that runs in
  parallel with customer traffic, mirroring real production mixes.

The connection model (planned):

1. The existing k6 solution is dropped into `tests/performance/k6/` (either
   as a subdirectory copy or as a git submodule — to be decided in an ADR).
2. Scripts target environment URLs supplied via environment variables — no
   URLs or credentials are committed.
3. A `perf-smoke` CI job runs a short, low-load k6 scenario on every PR to
   catch obvious regressions.
4. Full load, soak, and stress profiles run on-demand or on schedule, not on
   every PR.
5. Results are exported in a format consumable by the observability stack
   (e.g. OpenTelemetry / Prometheus), so dashboards correlate performance
   runs with traces and logs.

See [`tests/performance/k6/README.md`](./tests/performance/k6/README.md) for
the integration checklist.

---

## 6. How this domain evolves

The playground is shaped so the evolution path is mechanical, not structural:

1. **Modular monolith (today)** — `apps/bff` hosts all domain modules
   (catalog, cart, checkout, orders) in one process with deterministic
   mocks.
2. **Strict boundaries** — module-to-module calls move through explicit
   service interfaces; cross-module internal imports are lint-enforced.
3. **Real persistence** — Prisma + PostgreSQL replaces the in-memory mocks.
   Schema migrations land in `apps/bff/prisma/`.
4. **Contract-first APIs** — OpenAPI in `packages/contracts` becomes the
   source of truth; consumer (web) and producer (bff) are verified via
   Pact in `tests/contract`.
5. **Performance engineering** — k6 is connected at
   `tests/performance/k6/` against env-var-driven targets and exports into
   the observability pipeline.
6. **Event-driven architecture** — `NotificationsModule` consumes domain
   events (`order.placed`, `order.prepared`, `order.cancelled`) emitted via
   an outbox; first internal, then over a real broker.
7. **Observability** — the no-op OTel placeholder in
   `apps/bff/src/common/telemetry.ts` is replaced with a real SDK, and the
   collector pipeline fans out to a real backend stack.
8. **Quality gates** — CI fans out into lint / unit / integration /
   contract / E2E smoke / perf smoke jobs, each gating merges.
9. **Distributed services** — a domain module (likely `checkout` or
   `notifications`) is lifted into its own deployable. The BFF keeps its
   public API stable; only its internal wiring changes.

Each step is captured as an ADR under [`docs/adr/`](./docs/adr/).

---

## 7. Local Development

The local stack is **one command away** from running:

```bash
pnpm install
pnpm pg:up      # start Postgres + OTel Collector in Docker
pnpm pg:dev     # start web (3000) + BFF (3001) in watch mode
pnpm pg:smoke   # validate all mini-commerce endpoints
```

### Docker-first entrypoints

The architectural direction is **Docker-first**: pnpm is being phased into
an internal implementation detail of Node services. The official developer
interface is Docker Compose plus a thin set of bash scripts.

```bash
./scripts/app-up.sh         # postgres + otel-collector
./scripts/visualizer-up.sh  # only the 3D visualizer (port 3002)
./scripts/full-up.sh        # infra + visualizer

./scripts/app-down.sh
./scripts/visualizer-down.sh
./scripts/full-down.sh
```

Where the Docker-first contract is **not yet** complete (tracked as
follow-ups, not silently broken):

- `apps/web` runs on the host via `pnpm pg:dev` — a web Dockerfile is a
  separate iteration.

`apps/bff` and `apps/visualizer-3d` are both fully Docker-first today —
`./scripts/app-up.sh` brings up postgres + otel-collector + bff with a
single command, and `./scripts/full-up.sh` adds the visualizer. `pnpm
pg:dev` remains the recommended inner loop for BFF source changes
because it runs `nest start --watch` against host code, whereas the
container runs the compiled bundle.

### 3D Visualizer (visualizer-3d)

A new lightweight Three.js module lives at
[`apps/visualizer-3d/`](./apps/visualizer-3d/README.md) and runs as its own
Docker service under the `visualizer` Compose profile. It renders a
minimal white room with placeholder objects fed by `GET /visualization-data`
on the BFF — it **never** connects to the database directly. A `v0.app`
design track is reserved as a separate parallel exploration; see the
visualizer README for the placeholder boundary.

Open it at <http://localhost:3002> after `./scripts/visualizer-up.sh`.

The full guide — prerequisites, environment files, troubleshooting, command
reference — lives in [`docs/local-development.md`](./docs/local-development.md).

### Current limitations

- All BFF responses are **mocked and deterministic**; no DB reads yet.
- The cart is single-user and in-process; it resets on BFF restart.
- Observability is wired structurally only (`apps/bff/src/common/telemetry.ts`
  is a no-op placeholder).
- k6 has a runnable smoke profile (`pnpm pg:perf:smoke`) but the broader
  load / stress / soak scenarios are still pending — see
  [`tests/performance/k6/README.md`](./tests/performance/k6/README.md).

---

## 8. CI and Quality Gate Vision

CI is structured as a fan-out of independent jobs, each acting as a quality
gate:

1. **Lint** — formatting, ESLint, type-check.
2. **Unit + Integration test** — Vitest, with coverage thresholds enforced
   per package.
3. **Build** — Turborepo `build` across the workspace.
4. **Contract test** — Pact verification between web and BFF.
5. **E2E smoke** — a thin Playwright suite against an ephemeral stack.
6. **Performance smoke** — short k6 scenario against an ephemeral stack.

Heavier suites (full E2E, full performance profiles, security scans) run on
schedule, not on every PR. The pipeline placeholder lives at
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## 9. Status

This iteration is the **mini-commerce domain refactor**. Expect:

- The full catalog → cart → checkout → orders path runs locally with
  mocked, deterministic responses.
- `pnpm pg:smoke` validates every endpoint end-to-end.
- `TODO:` markers identify the next implementation step in each module.

See [`docs/lifecycle/README.md`](./docs/lifecycle/README.md) for how this
playground evolves.
