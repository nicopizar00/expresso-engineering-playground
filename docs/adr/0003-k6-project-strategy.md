# 0003. k6 project strategy: scaffold is the canonical source

- **Status:** Accepted
- **Date:** 2026-05-14
- **Deciders:** Playground maintainers

## Context

The previous iteration scaffolded `tests/performance/k6/` with a complete
directory layout (`scenarios/{smoke,load,stress}/`, `config/`, `data/`,
`reports/`, `docs/`), a working smoke scenario walking the full BFF happy
path, and a Docker-based runner. The scaffold's README and the smoke scenario
header both referred to an "existing k6 project" that would be imported later
— either vendored as a copy or pulled in via `git subtree` from an upstream
repository.

When the time came to do that import, the premise turned out to be wrong.
There is no external k6 project to import: the scaffold was built as a
stand-in, and it has since grown into a functioning starting point in its
own right. The decision now is whether to:

1. Vendor a copy from some upstream source.
2. Pull in an upstream repo via `git subtree`.
3. Treat the existing scaffold as the canonical source and grow from there.

The forces in play:

- Single-team playground — no external consumers and no upstream to track.
- The scaffold already covers the BFF surface end-to-end, so a swap-in would
  buy little and would break the working `pnpm pg:perf:smoke` flow.
- Both subtree and vendoring introduce maintenance overhead (re-syncs,
  divergence drift) without a counterparty to sync with.

## Decision

The scaffold under `tests/performance/k6/` **is** the k6 project. No import
is performed. All future scenarios (load, stress, soak, spike, etc.) are
authored directly in this tree and evolve alongside the BFF.

## Consequences

**Easier:**

- One source of truth for performance scenarios. Changes to BFF endpoints
  and the corresponding k6 scenarios travel together in a single PR.
- No subtree mechanics or vendoring rituals to learn or document.
- `pg:perf:smoke` continues to work without disruption — the scaffold was
  built to be invoked exactly this way.

**Harder:**

- Scenarios must be kept in sync with the BFF API contract by hand. There
  is no upstream from which to pull contract updates, so contract drift is
  caught only by the smoke run itself.
- The directory layout (`scenarios/smoke/`, `scenarios/load/`,
  `scenarios/stress/`) becomes a stable, load-bearing convention. Future
  scenario additions should slot into one of these buckets rather than
  inventing new top-level folders.
- Any cross-repo k6 utility we eventually want to share will need to be
  extracted into a published package; this ADR explicitly forecloses the
  subtree path.

## Alternatives considered

- **Vendored copy from an external source** — rejected: no upstream project
  exists to copy from. Inventing one to satisfy the import step would be
  ceremony with no payoff.
- **`git subtree` from an upstream repo** — rejected for the same reason,
  with the additional cost of subtree maintenance (split/push/pull cycles)
  that is not justified for a single-team playground with no shared
  consumers.
