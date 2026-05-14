# @travel-playground/shared-types

Cross-cutting TypeScript types for the fictional travel booking domain.

**What lives here:** types that more than one app or package needs to share
(IDs, value objects, domain enums).

**What does not live here:** wire-format contracts (those live in
`@travel-playground/contracts`), database row shapes (those stay private to
`apps/bff`), and UI-only types (those stay in `apps/web`).
