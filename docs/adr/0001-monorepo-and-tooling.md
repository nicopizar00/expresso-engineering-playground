# 0001. Monorepo with pnpm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-05-14
- **Deciders:** Playground maintainers

## Context

The mini-commerce playground spans multiple deployables (a web app, a BFF),
shared libraries (types, contracts, test utilities), and several test layers
(unit, integration, contract, E2E, performance). A core goal is to evolve
from a modular monolith to a small set of distributed services without
restructuring the repository.

Three repository shapes were considered:

1. **Polyrepo** — one repo per deployable, one per shared library.
2. **Monorepo with npm/yarn workspaces** — viable but slower at scale.
3. **Monorepo with pnpm workspaces + Turborepo** — fast installs, content-
   addressable store, first-class task orchestration and caching.

## Decision

Adopt a **monorepo with pnpm workspaces** for package management and
**Turborepo** for task orchestration and remote-cacheable builds.

## Consequences

**Easier:**
- Cross-cutting refactors (rename a type in `shared-types`, fix all
  consumers in the same PR).
- Atomic contract changes (update OpenAPI in `packages/contracts`,
  regenerate consumers, all in one diff).
- Sharing test utilities and lint config across the workspace.

**Harder:**
- CI must be careful to only build/test the affected projects to keep PR
  feedback fast. Turborepo's `--filter` and `--since` flags will be used.
- Versioning strategy (none today; all packages are `private: true` and
  unversioned). Will revisit if any package is published.

## Alternatives considered

- **Polyrepo** rejected: too much cross-repo churn for a playground whose
  whole point is to exercise the full lifecycle.
- **Yarn workspaces** rejected: pnpm's strict-by-default node_modules
  layout catches phantom-dependency bugs early, which matches the playground's
  quality-first ethos.
- **Nx** considered: equally capable, but Turborepo's smaller surface area
  and pure-config model is a better fit for an intentionally simple skeleton.
