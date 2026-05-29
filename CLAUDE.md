# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreements

- **Commit authorship**: Never add `Co-Authored-By: Claude`, `Generated with Claude Code`, or any other Claude/Anthropic attribution to commit messages, PR descriptions, or generated docs. The repo owner authors all attribution.

## What this repo is

An engineering playground for a fictional mini-commerce store (catalog → cart → checkout → orders). Despite the directory name, there is no travel booking domain — see `docs/adr/0002-mini-commerce-domain.md`. The goal is to iterate software engineering practices (modularity, testing, observability, distributed systems) in a realistic but low-stakes context.

The codebase is an evolving **modular monolith**: catalog and orders are
Prisma/PostgreSQL-backed, the cart is intentionally in-memory and
single-user, and remaining stubs/TODOs mark mechanical next steps toward
Phase 3 distributed services.

## Commands

### Developer loop

Two equivalent CLIs — pick one based on what's installed:

| Goal | Docker-only (`./dev`) | pnpm wrapper |
|---|---|---|
| Start core stack | `./dev up` | `pnpm pg:up core` |
| Start + web app | `./dev up web` | `pnpm pg:up web` |
| Start everything | `./dev up full` | `pnpm pg:up full` |
| Hot-reload dev | `./dev dev` | `pnpm pg:dev` |
| Service status | `./dev status` | `pnpm pg:status` |
| Follow logs | `./dev logs` | `pnpm pg:logs` |
| Smoke test | `./dev smoke` | `pnpm pg:smoke` |
| Seed database | `./dev seed` | `pnpm pg:seed` |
| Stop services | `./dev down` | `pnpm pg:down` |
| Print URLs | `./dev open` | `pnpm pg:open` |

**`./dev`** — requires Docker Desktop only (bash is built-in on macOS). Migrations and seeds run inside containers; no Node or pnpm on the host.

**`pnpm pg:*`** — requires Node ≥ 20 + pnpm 9 on the host in addition to Docker.

```bash
# Fresh setup: copy .env template to .env (gitignored)
cp .env.example .env

# Start infrastructure stack (Docker-only path)
./dev up            # postgres + otel-collector + bff (auto-migrates + seeds)
./dev up web        # + Next.js web app
./dev up full       # + visualizer-3d (all services)

# Development: hot-reload via docker compose watch (bff + web in containers)
./dev dev           # docker compose watch (recommended)
pnpm pg:dev:host    # turbo run dev on host (escape hatch — requires pnpm)

# Inspection
./dev status        # service health table
./dev logs          # follow docker compose logs
./dev open          # print local URLs

# Testing + cleanup
./dev smoke         # hit all 9 endpoints and assert 200/201
./dev seed          # run prisma db seed
./dev down          # stop services cleanly
```

### Build / test / check

```bash
pnpm build        # turbo run build (all packages)
pnpm test         # turbo run test (Vitest unit tests across all packages)
pnpm typecheck    # turbo run typecheck (tsc --noEmit across all packages)
```

`pnpm lint` and `pnpm format` are stubbed (TODOs).

### Task wrappers (optional)

`Taskfile.yml` at the repo root mirrors the commands above for users with [`go-task`](https://taskfile.dev) installed (`brew install go-task`). It is a thin shell-out to the `pnpm pg:*` and turbo scripts — `package.json` remains the source of truth. Use `pnpm pg:*` in docs, CI, and agent instructions; `task` is for human convenience only. Examples: `task up` → `pnpm pg:up core`, `task dev` → `pnpm pg:dev`, `task smoke` → `pnpm pg:smoke`. Run `task --list` to discover all wrappers.

### Single app / single test

```bash
pnpm --filter @mini-commerce/bff test             # BFF unit tests only
pnpm --filter @mini-commerce/bff test:watch       # Watch mode
pnpm --filter @mini-commerce/bff typecheck        # Type-check BFF
pnpm --filter @mini-commerce/web dev              # Next.js dev server (port 3000)
```

To run a single test file: `pnpm --filter @mini-commerce/bff exec vitest run path/to/file.spec.ts`

### Performance

```bash
pnpm pg:perf:smoke       # k6 smoke profile in Docker (5–10 s)
pnpm pg:perf:open-report # Open k6 HTML report
pnpm pg:perf:clean       # Delete k6 reports
```

### Validation

```bash
pnpm pg:doctor    # Validate Node, pnpm, Docker, .env prerequisites
```

## Architecture

### Monorepo layout

Turbo + pnpm workspaces. Three scopes:

- `apps/` — runnable services: `bff` (NestJS, port 3001), `web` (Next.js, port 3000), `visualizer-3d` (nginx/Three.js, port 3002, optional Docker profile)
- `packages/` — shared libraries: `shared-types` (branded domain types, Money), `contracts` (canonical HTTP TypeScript wire shapes; OpenAPI/Pact follow-ups), `config` (eslint/tsconfig), `test-utils`
- `tests/` — cross-app test suites: `integration/`, `contract/`, `e2e/` (all stubbed), `performance/k6/` (smoke runnable)

### BFF module pattern

Every domain feature lives in `apps/bff/src/modules/<domain>/` with four files:

```
<domain>.module.ts      # NestJS @Module — wires providers, imports, exports
<domain>.service.ts     # Business logic (@Injectable)
<domain>.controller.ts  # HTTP routes (@Controller)
<domain>.types.ts       # DTOs / wire-format types
```

Modules only depend on each other through `exports: [Service]`. Never import a service from another module's internal files — only from the module's barrel or the module itself.

Active domain modules (registered in `AppModule`): `HealthModule`, `CatalogModule`, `CartModule`, `CheckoutModule`, `OrdersModule`, `VisualizationModule`. `CustomersModule` and `NotificationsModule` are placeholders.

### Inter-module dependencies

```
VisualizationModule ← (reads) CatalogModule, CartModule, OrdersModule
                    ← DomainEventsModule (subscribes to changed$ for SSE)
CheckoutModule      ← CartModule + OrdersModule + DomainEventsModule
CartModule          ← CatalogModule + DomainEventsModule
OrdersModule        ← DomainEventsModule
```

`DomainEventsModule` lives in `apps/bff/src/core/domain-events/` — a neutral infrastructure
concern (analogous to `PrismaModule`). Domain modules import it explicitly; the
visualization layer subscribes to its `changed$` observable to push SSE snapshots.
It is NOT `@Global()` — each module that needs it declares the import, keeping
test isolation clean.

To add a dependency: import the provider module in `imports: [...]` and constructor-inject the exported service.

### Cross-cutting concerns (BFF)

Applied globally in `main.ts`:
- `LoggingInterceptor` — logs every request (method, path, status)
- `HttpExceptionFilter` — normalizes error responses
- `ValidationPipe` (`class-validator`) — validates all incoming DTOs
- `initTelemetry()` — configures OpenTelemetry auto-instrumentation and OTLP
  trace export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set

### Data model invariants

- **Money**: always `{ amountMinor: number, currency: string }` — integer cents, never floats.
- **Branded types** in `@mini-commerce/shared-types`: `ProductId`, `CartItemId`, `OrderId`, `CustomerId`. Use them; don't substitute plain `string`.
- **Cart** is single-user, in-process, resets on BFF restart (no DB). This is intentional for Phase 1.

### Visualization endpoint

`GET /visualization-data` is a read-only aggregator: the BFF pulls from domain services and reshapes into `VisualizationItem[]`. The `visualizer-3d` frontend **never reads the database directly** — all data flows through this endpoint. This boundary is load-bearing for Phase 3 service extraction.

### Docker Compose & local env

**Root `.env`** (gitignored, copy from `.env.example`):
```env
POSTGRES_USER=playground
POSTGRES_PASSWORD=playground
POSTGRES_DB=mini_commerce_playground
DATABASE_URL=postgres://playground:playground@localhost:5432/mini_commerce_playground
BFF_PORT=3001
WEB_PORT=3000
VIZ_PORT=3002
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```
All `pnpm pg:*` commands load this automatically.

**Main stack** (`infra/docker/compose.yaml`): 
- Always-on: `postgres`, `bff`, `otel-collector`
- Profiled (opt-in): `web` (profile: `web`), `visualizer-3d` (profile: `viz` or `visualizer`)
- Activated via `pnpm pg:up <target>` where target is `core` | `web` | `viz` | `full`

**Dev override** (`infra/docker/compose.dev.yaml`):
- Used only by `pnpm pg:dev` (docker compose watch)
- Switches bff + web to dev stages (nest --watch, next dev)
- Syncs source changes into containers for hot-reload

**Performance stack** (`infra/docker/compose.performance.yaml`):
- Separate file (doesn't mutate main stack)
- k6 containers join `mini_commerce_default` network to reach otel-collector

### Testing approach

- **Unit tests**: Vitest, colocated as `*.spec.ts` next to source. NestJS `Test.createTestingModule` for service/controller tests with mocked dependencies.
- **Integration, contract (Pact), E2E (Playwright)**: infrastructure wired but test bodies are TODOs.
- **Performance**: k6 runnable smoke, checkout-flow, and read-heavy scenarios
  live in `tests/performance/k6/`; the larger load/stress tracks remain future work.

Quality gates (CI vision, `docs/quality-strategy/`): lint → unit → build → contract → E2E smoke → perf smoke.

### Phase roadmap context

- **Phase 1** (shipped): NestJS modular monolith and deterministic commerce flow.
- **Phase 2** (in progress): 
  - ✅ Orchestrator: `pnpm pg:*` unified CLI, Docker-first dev loop (`pg:dev` = docker compose watch), auto-migrate + seed on `pg:up`
  - ✅ Catalog and orders persistence: Prisma + Postgres, with seeded data and order listing
  - ✅ OpenTelemetry SDK: OTLP HTTP trace export, auto-instrumentation, and order spans
  - ✅ Shared TypeScript HTTP contracts consumed by `apps/web`
  - ✅ Visualizer real-time SSE: `GET /visualization-updates` pushes snapshots on domain mutations; polling fallback when SSE unavailable
  - ⏳ Domain events and cart/session evolution; cart remains in-memory intentionally
- **Phase 3**: Extract modules into independent services; expand contract
  enforcement (OpenAPI/Pact); replace in-process events with a broker.

### Next steps workflow

**Track iterations in `docs/next-steps/`:**
- Each iteration (orders-persistence, etc.) has a detailed `.md` with sub-tasks, critical files, and verification steps
- Anchor inline TODOs to specific docs: `TODO(next-steps/<topic>)` — grep to find them
  ```bash
  grep -rn "next-steps/" .  # Find all anchored TODOs
  ```

**To pick the next iteration:**
1. Read `docs/next-steps/README.md` for overview
2. Pick a `.md` (e.g., `orders-persistence.md`)
3. Use `EnterPlanMode` to design, then implement step-by-step
4. Update this file + memory when complete
