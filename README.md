# Travel Booking Engineering Playground

A professional, opinionated playground for experimenting with software
engineering, the software development lifecycle, software quality engineering,
performance engineering, software architecture, DevOps, observability, and
AI-assisted engineering practices.

The domain is a **fictional travel booking platform**. No real company names,
internal services, credentials, URLs, or proprietary details are used anywhere
in this repository.

---

## 1. Purpose

This repository is intentionally **not** a production system. It is a
sandbox where engineering and quality practices can be explored end-to-end
against a realistic-looking domain:

- Designing a modular system before it grows distributed.
- Wiring up unit, integration, contract, end-to-end, and performance tests
  with clear ownership boundaries.
- Connecting an existing k6 performance engineering solution into a CI-ready
  layout.
- Exercising observability (traces, metrics, logs) with OpenTelemetry.
- Iterating on ADRs, lifecycle documentation, and quality strategy.
- Experimenting with AI-assisted engineering on a non-trivial codebase.

This first iteration is deliberately a **structural skeleton**: placeholders,
clear extension points, and `TODO`s. Business logic is intentionally absent.

---

## 2. Architecture Vision

The fictional product is a travel booking platform that lets travelers search
trips, place bookings, manage orders, and receive notifications. The
architecture is staged in three explicit phases:

### Phase 1 — Modular monolith (current target)

- A single **BFF / API** application (`apps/bff`, NestJS) hosts all domain
  modules behind clear module boundaries: `trips`, `booking`, `orders`,
  `users`, `notifications`.
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

- Selected modules (e.g. `booking`, `notifications`) are extracted into
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
│   ├── web/                  # Next.js web app placeholder
│   └── bff/                  # NestJS BFF / API placeholder
│                             # Domain modules: trips, booking, orders,
│                             # users, notifications
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
│       └── k6/               # k6 performance engineering solution
├── infra/
│   ├── docker/               # Local development Docker Compose
│   └── observability/        # OpenTelemetry collector + dashboards
├── docs/
│   ├── architecture/         # C4-style architecture notes
│   ├── adr/                  # Architecture Decision Records
│   ├── quality-strategy/     # Test pyramid, quality gates, ownership
│   └── lifecycle/            # SDLC, branching, release strategy
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

## 5. Connecting the k6 Performance Engineering Solution

The performance engineering layer is intentionally a **separate, pluggable
sub-tree** at [`tests/performance/k6/`](./tests/performance/k6/README.md).

The connection model is:

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

## 6. Planned Evolution: Modular Monolith → Distributed Services

The repository is shaped so the evolution path is mechanical, not structural:

1. **Today** — `apps/bff` hosts all domain modules in one process.
2. **Next** — module boundaries are enforced by lint rules and explicit
   interfaces; cross-module calls go through a thin service layer.
3. **Later** — contracts in `packages/contracts` are versioned, and each
   producer/consumer pair is covered by Pact tests.
4. **Eventually** — a domain module (likely `booking` or `notifications`) is
   lifted into its own deployable service. The BFF keeps its public API
   stable; only its internal wiring changes.

Each step is captured as an ADR under [`docs/adr/`](./docs/adr/).

---

## 7. Local Development Vision

Local development is designed to be **one command away** from a working
stack:

- `pnpm install` — install workspace dependencies.
- `docker compose -f infra/docker/compose.yaml up` — bring up PostgreSQL and
  the OpenTelemetry collector locally (placeholders today).
- `pnpm dev` — run `apps/web` and `apps/bff` in parallel via Turborepo.
- `pnpm test` — run the unit + integration test layer.
- `pnpm test:e2e` — run Playwright against a locally running stack.
- `pnpm test:perf:smoke` — run the k6 smoke profile.

Today these commands are wired as placeholders. The next iteration will give
them real implementations.

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

This is the **initial scaffolding iteration**. Expect:

- Files exist with realistic structure but minimal implementation.
- `TODO:` markers identify the next implementation step.
- Dependencies are intentionally absent until they earn their place.

See [`docs/lifecycle/README.md`](./docs/lifecycle/README.md) for how this
playground will evolve.
