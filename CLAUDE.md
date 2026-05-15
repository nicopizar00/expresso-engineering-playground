# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An engineering playground for a fictional mini-commerce store (catalog → cart → checkout → orders). Despite the directory name, there is no travel booking domain — see `docs/adr/0002-mini-commerce-domain.md`. The goal is to iterate software engineering practices (modularity, testing, observability, distributed systems) in a realistic but low-stakes context.

The codebase is a **deliberate skeleton**: business logic is mocked (in-memory), and every stub/TODO marks a planned mechanical next step toward Phase 3 distributed services.

## Commands

### Developer loop

```bash
pnpm pg:up        # Start postgres + otel-collector (Docker)
pnpm pg:dev       # Start web + bff in watch mode (host-side)
pnpm pg:smoke     # Hit all 9 endpoints and assert 200/201
pnpm pg:down      # Stop Docker stack
```

### Build / test / check

```bash
pnpm build        # turbo run build (all packages)
pnpm test         # turbo run test (Vitest unit tests across all packages)
pnpm typecheck    # turbo run typecheck (tsc --noEmit across all packages)
```

`pnpm lint` and `pnpm format` are stubbed (TODOs).

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

### Infrastructure scripts

```bash
pnpm pg:doctor    # Validate Node, pnpm, Docker prerequisites
pnpm pg:seed      # Populate DB (stubbed)
pnpm pg:reset     # Drop + recreate DB (stubbed)
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

### Docker Compose

Main stack (`infra/docker/compose.yaml`): `postgres`, `bff`, `otel-collector`. The `visualizer-3d` service is behind the `visualizer` profile — start it with `--profile visualizer`.

Performance runs use a separate file (`infra/docker/compose.performance.yaml`) so they don't mutate the main stack. k6 containers join the `mini_commerce_default` network to reach the otel-collector.

### Testing approach

- **Unit tests**: Vitest, colocated as `*.spec.ts` next to source. NestJS `Test.createTestingModule` for service/controller tests with mocked dependencies.
- **Integration, contract (Pact), E2E (Playwright)**: infrastructure wired but test bodies are TODOs.
- **Performance**: k6 scenarios in `tests/performance/k6/`; smoke profile is the only runnable one.

Quality gates (CI vision, `docs/quality-strategy/`): lint → unit → build → contract → E2E smoke → perf smoke.

### Phase roadmap context

- **Phase 1** (shipped): NestJS monolith, in-memory data stores.
- **Phase 2** (in progress): Prisma + Postgres wired for the catalog (products persist; `POST /catalog/products` supported). Orders and cart still in-memory — see `docs/next-steps/orders-persistence.md`. OpenTelemetry SDK + domain events still pending.
- **Phase 3**: Extract modules into independent services; promote contracts package to first-class boundary; replace in-process events with a broker.

Open follow-ups live in `docs/next-steps/` — also see `docs/next-steps/orchestrator.md` for the Docker-first orchestrator wire-up.

The monorepo is shaped so Phase 3 extraction is mechanical: module → service, `imports` → HTTP/event calls, `exports` → published contracts.
