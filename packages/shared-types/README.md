# @mini-commerce/shared-types

Cross-cutting TypeScript types for the mini-commerce playground domain.

**What lives here:** types that more than one app or package needs to share
(branded IDs, value objects like `Money`, domain enums like `OrderStatus`).

**What does not live here:** wire-format contracts (those live in
`@mini-commerce/contracts`), database row shapes (those stay private to
`apps/bff`), and UI-only types (those stay in `apps/web`).
