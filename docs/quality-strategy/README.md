# Quality Engineering Strategy

The mini-commerce playground treats quality as a **systemic property**, not
a phase. This document captures the test pyramid, ownership model, and
quality gates.

## 1. Test pyramid

| Layer        | Goal                                              | Tool       | Location                  |
| ------------ | ------------------------------------------------- | ---------- | ------------------------- |
| Unit         | Verify a single function / class behavior.        | Vitest     | `apps/*`, `packages/*`    |
| Integration  | Verify modules collaborate across real I/O.       | Vitest     | `tests/integration`       |
| Contract     | Verify producer/consumer wire compatibility.      | Pact       | `tests/contract`          |
| E2E          | Verify golden paths in the running stack.         | Playwright | `tests/e2e`               |
| Performance  | Verify latency and throughput against SLOs.       | k6         | `tests/performance/k6`    |

The pyramid is **load-bearing**: more tests at the bottom, fewer at the top.
A failing integration test should never be replaced by an E2E test as a
shortcut — that pushes cost up.

## 2. Ownership

- **Feature engineers** own unit and integration tests for the modules
  they change (catalog, cart, checkout, orders).
- **Producer + consumer engineers jointly** own contract tests at their
  shared boundary (web ↔ bff).
- **Quality engineering** owns the E2E suite — what counts as a "golden
  path" is a quality call, not a feature call. The mini-commerce golden
  path is `load catalog → add to cart → checkout → manage order`.
- **Performance engineering** owns the k6 solution and SLO thresholds.

## 3. Quality gates

Current CI coverage:

1. **Typecheck and build** run through the workspace pipeline. Lint commands
   remain stubs until ESLint configuration lands.
2. **Unit tests** run for packages with implemented suites, including the
   active BFF module tests.
3. **Performance smoke** boots the Compose BFF stack and executes the k6 smoke
   profile.

Planned gates, not yet enforced:

- Integration tests under `tests/integration`.
- Pact contract verification under `tests/contract`.
- Playwright E2E smoke under `tests/e2e`.
- Nightly load/stress execution and dependency scanning.

## 4. Local developer validation

Before any of the layers above, `pnpm pg:smoke` provides a fast
developer-loop validation: it calls the active BFF endpoints
(`/health`, `/catalog/products`, `/catalog/products/:id`, `/cart/items`,
`/cart`, `/checkout`, `/orders/:id`, `/orders/:id/manage`) and asserts a
200/201/202 status. It is the local equivalent of a smoke E2E test and is
what the rest of the pipeline plugs into.

## 5. Testability principles

- **Modules expose narrow public surfaces.** Tests target those surfaces,
  not internals.
- **Time and randomness are injected.** Tests stay deterministic — the
  fixtures and test setup should keep persisted flows deterministic so
  contract/smoke tests do not flake.
- **Observability is testable.** Tests can assert on emitted spans or
  metrics where it adds value.
- **No real external services in CI.** Use testcontainers, contract mocks,
  or in-memory fakes from `@mini-commerce/test-utils`.

## 6. Anti-patterns to avoid

- Big E2E suites used as a substitute for missing integration tests.
- Snapshot tests on rapidly-evolving outputs.
- Shared mutable test fixtures.
- Mocks of types we own (use real implementations or in-memory fakes
  instead).
