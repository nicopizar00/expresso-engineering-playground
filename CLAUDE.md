# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An engineering playground for a fictional mini-commerce store (catalog → cart → checkout → orders). Despite the directory name, there is no travel booking domain — see `docs/adr/0002-mini-commerce-domain.md`. The goal is to iterate software engineering practices (modularity, testing, observability, distributed systems) in a realistic but low-stakes context.

The codebase is a **deliberate skeleton**: business logic is mocked (in-memory), and every stub/TODO marks a planned mechanical next step toward Phase 3 distributed services.

## Commands

### Developer loop

```bash
# Fresh setup: copy .env template to .env (gitignored)
cp .env.example .env

# Start infrastructure stack
pnpm pg:up core       # postgres + otel-collector + bff (auto-migrates + seeds)
pnpm pg:up web        # + Next.js web app
pnpm pg:up full       # + visualizer-3d (all services)
pnpm pg:up viz        # start visualizer only

# Development: hot-reload via docker compose watch (bff + web in containers)
pnpm pg:dev           # docker compose watch (recommended)
pnpm pg:dev:host      # turbo run dev on host (escape hatch)

# Inspection
pnpm pg:status        # service health table
pnpm pg:logs          # follow docker compose logs
pnpm pg:open          # print local URLs

# Testing + cleanup
pnpm pg:smoke         # hit all 9 endpoints and assert 200/201
pnpm pg:seed          # run prisma db seed
pnpm pg:reset         # stop all containers (volumes preserved)
pnpm pg:down          # stop services cleanly
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
- `packages/` — shared libraries: `shared-types` (branded domain types, Money), `contracts` (OpenAPI/Pact stubs), `config` (eslint/tsconfig), `test-utils`
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
CheckoutModule      ← CartModule + OrdersModule
CartModule          ← CatalogModule
```

To add a dependency: import the provider module in `imports: [...]` and constructor-inject the exported service.

### Cross-cutting concerns (BFF)

Applied globally in `main.ts`:
- `LoggingInterceptor` — logs every request (method, path, status)
- `HttpExceptionFilter` — normalizes error responses
- `ValidationPipe` (`class-validator`) — validates all incoming DTOs

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
- **Performance**: k6 scenarios in `tests/performance/k6/`; smoke profile is the only runnable one.

Quality gates (CI vision, `docs/quality-strategy/`): lint → unit → build → contract → E2E smoke → perf smoke.

### Phase roadmap context

- **Phase 1** (shipped): NestJS monolith, in-memory data stores.
- **Phase 2** (in progress): 
  - ✅ Orchestrator: `pnpm pg:*` unified CLI, Docker-first dev loop (`pg:dev` = docker compose watch), auto-migrate + seed on `pg:up`
  - ⏳ Orders persistence: Prisma + Postgres for orders (currently in-memory). See `docs/next-steps/orders-persistence.md`
  - ⏳ OpenTelemetry SDK + domain events
  - Catalog already persists via Prisma; cart still in-memory (intentional Phase 1 contract)
- **Phase 3**: Extract modules into independent services; promote contracts package to first-class boundary; replace in-process events with a broker.

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
