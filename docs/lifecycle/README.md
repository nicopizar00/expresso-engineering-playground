# Software Development Lifecycle

This document describes how work flows through the playground — from idea
to merged change. It is intentionally lightweight, suited to a small team
or a single engineer iterating on a fictional product.

## 1. Phases

1. **Frame** — capture the problem in a ticket (see §4 on Jira/Confluence
   alignment) and, if architectural, draft an ADR.
2. **Design** — propose an approach in the ticket or ADR; get one round of
   feedback before coding.
3. **Build** — implement on a short-lived feature branch.
4. **Validate** — run the relevant test layers locally; rely on CI for the
   rest. Update documentation in the same PR as the code.
5. **Merge** — squash to a single commit on `main`. CI must be green.
6. **Observe** — after deployment, validate via observability (traces,
   metrics, logs). For this playground, the equivalent is checking that
   smoke tests and performance smoke runs stay green.

## 2. Branching

- Trunk-based development on `main`.
- Short-lived feature branches: `feat/<kebab-title>`, `fix/<kebab-title>`,
  `chore/<kebab-title>`, `docs/<kebab-title>`.
- No long-lived release branches.

## 3. Pull requests

- Small. Reviewable in under 30 minutes.
- Linked to a ticket and to the ADR (if any).
- CI must pass. Test plan must be filled in.

## 4. Jira / Confluence alignment

The playground does not depend on any specific external tool. To stay
compatible with common workflows:

- **Tickets** (the planning system, whether Jira, Linear, GitHub Issues)
  carry the *intent* and *acceptance criteria*. PR descriptions link back
  to them.
- **Confluence-style spaces** (the long-form documentation system) carry
  cross-cutting context that does not fit in a ticket — strategies,
  retros, deep-dive analyses. The in-repo `docs/` folder is the
  playground's equivalent.
- **ADRs** are the bridge: they record decisions that touch both planning
  (why now?) and documentation (what changed?).

## 5. Release strategy (future)

Deployment is intentionally out of scope for this iteration. When it lands:

- Each `apps/*` produces a versioned artifact.
- A release is a Git tag plus a set of artifacts.
- Rollbacks are a re-deploy of a previous artifact, not a revert PR.

## 6. Definition of done

A change is done when:

- Tests at every relevant layer of the pyramid have been updated.
- Documentation in `docs/` has been updated if behavior or architecture
  changed.
- Observability is updated if the change introduces new failure modes
  worth seeing in dashboards.
- The ADR is updated or added if the change reflects a new architectural
  decision.
