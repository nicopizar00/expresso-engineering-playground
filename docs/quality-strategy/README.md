# Quality Engineering Strategy

The playground treats quality as a **systemic property**, not a phase. This
document captures the test pyramid, ownership model, and quality gates.

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
  they change.
- **Producer + consumer engineers jointly** own contract tests at their
  shared boundary.
- **Quality engineering** owns the E2E suite — what counts as a "golden
  path" is a quality call, not a feature call.
- **Performance engineering** owns the k6 solution and SLO thresholds.

## 3. Quality gates

Every pull request runs:

1. **Lint + typecheck** — must pass.
2. **Unit + integration tests** — must pass; coverage thresholds enforced
   per package (see each package's vitest config).
3. **Build** — must pass.
4. **Contract verification** — must pass on changes affecting
   `packages/contracts` or any API surface.
5. **E2E smoke** — a single golden-path test; must pass.
6. **Performance smoke** — short k6 scenario; threshold violations block.

Nightly:

- Full E2E suite.
- Full k6 load profile against the ephemeral stack.
- Dependency / vulnerability scan.

## 4. Testability principles

- **Modules expose narrow public surfaces.** Tests target those surfaces,
  not internals.
- **Time and randomness are injected.** Tests stay deterministic.
- **Observability is testable.** Tests can assert on emitted spans or
  metrics where it adds value.
- **No real external services in CI.** Use testcontainers, contract mocks,
  or in-memory fakes from `@travel-playground/test-utils`.

## 5. Anti-patterns to avoid

- Big E2E suites used as a substitute for missing integration tests.
- Snapshot tests on rapidly-evolving outputs.
- Shared mutable test fixtures.
- Mocks of types we own (use real implementations or in-memory fakes
  instead).
