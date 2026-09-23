# Repository Bloat Reduction Design

**Date:** 2026-09-22
**Status:** Approved for planning

## Purpose

Reduce maintained code and completed planning artifacts without changing the
mini-commerce product, its public interfaces, or its test expectations. The
work favors verified deletion and genuine de-duplication over formatting or
line-packing tricks.

## Success criteria

- All eight completed implementation plans under `docs/superpowers/plans/`
  are removed; design and product specifications remain intact.
- Dead placeholder and unused code identified by both semantic analysis and
  repository reference checks is removed.
- Repeated Playwright commerce API mocks are replaced by one focused fixture,
  while each spec retains its scenario data, visualizer behavior, and
  assertions.
- Unused dependencies are removed without adding replacements.
- Formatting ignores generated output and becomes a meaningful green gate.
- The final build, static checks, unit tests, Python tests, affected Playwright
  tests, and available runtime smoke checks pass.
- Before/after maintained-line counts and structural-versus-cosmetic reduction
  are reported.

## Baseline and evidence

The repository starts at 57,408 tracked raw lines. Maintained code in the
selected extensions (`ts`, `tsx`, `js`, `mjs`, `py`, `css`, `html`, `sh`)
contains 22,932 raw lines. Documentation contains 21,893 raw lines, of which
the eight completed implementation plans account for 13,543 lines.

Read-only analysis found:

- TypeScript `noUnusedLocals` and `noUnusedParameters` checks pass for web,
  BFF, contracts, and integration code.
- Knip reported dead exports, unused dependencies, and two unreferenced empty
  BFF placeholder modules. Candidates are accepted only after repository
  reference checks rule out framework or configuration entrypoints.
- jscpd found 692 duplicated lines. The strongest low-risk cluster is the
  repeated commerce API mock across five Playwright specs.
- The selected Playwright baseline passes 19 tests with one intentionally
  skipped test.
- The isolated worktree passes 117 BFF unit tests and 48 Python orchestrator
  tests after normal dependency, Prisma-client, and submodule setup.
- `pnpm format` currently fails because package-local Prettier commands scan
  ignored generated `dist/` and `.next/` trees.

## Scope

### 1. Completed implementation plans

Delete every file under `docs/superpowers/plans/`. They are execution
checklists for already-shipped work and have no inbound repository references.
Preserve all files under both `docs/superpowers/specs/` and `docs/specs/`.

### 2. Verified dead code

Delete the empty `CustomersModule` and `NotificationsModule`. They are not
part of the Nest composition graph and contain only future-work comments.
Update `docs/architecture/bff-modules.md` so those names remain documented as
future domains rather than present modules.

Delete unused UI implementations from `ErrorBanner.tsx` while preserving the
used `PageErrorState` component. Narrow internal-only exports elsewhere when
the implementation is still used inside its own module. Remove the unused
performance-adapter configuration state and accessors; keep the mock adapter's
used data and formatting API unchanged.

### 3. Dependency cleanup

Remove dependencies only when semantic analysis and import/config searches
both show no consumer. Configuration packages imported by ESLint are not
unused merely because application source does not import them.

Expected removals are the BFF's unused `supertest`, `@types/supertest`, and
direct `tsconfig-paths` declarations, plus the root-only duplicate `next`
declaration. Regenerate the lockfile with the existing package manager; do not
upgrade unrelated packages.

### 4. Shared Playwright commerce fixture

Create `tests/e2e/fixtures/commerce-api.ts`. It owns:

- shared commerce wire types used only by the Playwright suite;
- deterministic in-memory cart and order state;
- health, catalog, cart, checkout, orders, and order-management handlers;
- JSON fulfillment and demo-mode reset helpers; and
- explicit failure options for catalog reads, add-to-cart, and checkout
  network interruption.

The fixture accepts product records and the three observed failure modes. It
derives currency from the supplied products and uses stable test-only IDs and
timestamps. It does not expose a general plugin or callback system. Unknown
BFF routes receive an explicit 404 so new frontend calls cannot silently pass
through to a real service.

Update these specs to use the fixture:

- `tests/e2e/tests/checkout-happy-path.spec.ts`
- `tests/e2e/tests/frontend-certification.spec.ts`
- `tests/e2e/tests/homepage-workspace.spec.ts`
- `tests/e2e/tests/purchase.spec.ts`
- `tests/e2e/tests/visual-integrity.spec.ts`

Product fixtures, page-object usage, visualizer HTML mocks, browser-error
collection, visual assertions, and test assertions remain local to the specs
that need them. The shared fixture must remain smaller and easier to understand
than the duplicated route handlers it replaces.

### 5. Formatting boundary

Add a root `.prettierignore` that excludes generated `.next/`, `dist/`, test
reports, coverage, dependencies, and the Punch submodule. Point each workspace
package's existing `format` script at that shared ignore file because Prettier
runs with the package as its working directory. Do not reformat unrelated
source.

### 6. Measurement record

Add a short `goal-sloc.md` retrospective containing the baseline, milestone
deltas, final verification, and the percentage of reductions attributable to
structural work versus cosmetic changes. Deleted completed plans are reported
separately from code so documentation deletion cannot disguise code results.

## Behavior-preservation boundary

The cleanup must preserve:

- every user-visible commerce, developer, performance, and visualizer feature;
- all BFF HTTP paths, response shapes, status transitions, and failure modes;
- frontend API selection between real and demo implementations;
- Playwright test names, assertions, viewport coverage, and scenario-specific
  product data;
- ordering of cart and order mutations;
- Docker, Prisma, Punch, k6, and telemetry behavior; and
- every design, ADR, next-step, UAT, and product specification; architecture
  documentation remains, with only its placeholder-module graph and rule
  updated to match shipping source.

No production component split, k6 scenario consolidation, public contract
change, dependency upgrade, or feature removal is part of this pass.

## Verification and milestones

Work proceeds in small, reversible milestones:

1. Remove completed plans and record the documentation-only delta.
2. Remove verified dead code and unused dependencies; run TypeScript checks,
   BFF unit tests, lint, and formatting.
3. Introduce the shared commerce fixture and migrate one spec at a time. Run
   each migrated spec before moving to the next.
4. Run the final verification matrix:
   - `pnpm lint`
   - `pnpm format`
   - `pnpm typecheck`
   - `pnpm build`
   - a fresh BFF Vitest run (not a Turbo cache replay)
   - `pnpm pg:test`
   - the 20 affected Playwright cases
   - `./dev smoke` when the local Docker stack is available
5. Re-run maintained-line and duplication measurements, update `goal-sloc.md`,
   and inspect the complete diff.

If a refactor changes an assertion, requires a production behavior change, or
grows the shared fixture into a general framework, revert that slice. Stop
after this pass when remaining opportunities are the excluded large-component
or k6 refactors rather than extending the scope.

## Rollback

Each milestone is committed separately after its checks pass. A failing or
over-generalized milestone can therefore be reverted without disturbing the
verified deletions that precede it.
