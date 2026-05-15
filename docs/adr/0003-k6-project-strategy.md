# 0003. k6 project strategy: adopt git subtree from nicopizar00/k6-ts-docker

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

That upstream repository, `nicopizar00/k6-ts-docker`, exists and is stable
enough to act as the source. The decision now is how to bring it in:

1. Vendor a copy (snapshot, no upstream link).
2. Pull in via `git subtree` (preserves history, supports future syncs).
3. Treat the existing scaffold as the canonical source and grow from there.

## Decision

Adopt **git subtree** from `nicopizar00/k6-ts-docker@main` under the prefix
`tests/performance/k6/`. The placeholder scenarios currently in this tree
will be replaced by the subtree import; the playground-side glue (`config/`,
`.env.example`, Docker runner) is preserved.

## Consequences

**Easier:**

- Upstream history is preserved in the monorepo — `git log` traces scenario
  changes back to their origin commit.
- Scenarios authored in the dedicated k6 repo can be pulled in with a single
  `git subtree pull` rather than a manual copy.
- The playground stays cloneable in one step with no additional remotes
  required at clone time.

**Harder:**

- Subtree maintenance (split/push/pull cycles) is unfamiliar to developers
  who have not used `git subtree` before.
- Divergence between the monorepo and upstream must be managed deliberately;
  ad-hoc edits in both trees without a pull/push cycle will cause conflicts.
- The `tests/performance/k6/` prefix becomes load-bearing — renaming it
  requires a `git subtree split` to rewrite the upstream pointer.

## Alternatives considered

- **Scaffold-only (grow in place)** — rejected: the scaffold was built as a
  placeholder for an import, and `nicopizar00/k6-ts-docker` now exists as the
  intended upstream. Keeping the scaffold forecloses the subtree path and
  discards upstream history without a concrete benefit.
- **Vendored copy** — rejected: loses upstream history and makes future
  re-syncs a manual diff exercise. Suitable only if the upstream is unstable
  or if the team wants zero coupling — neither is true here.
