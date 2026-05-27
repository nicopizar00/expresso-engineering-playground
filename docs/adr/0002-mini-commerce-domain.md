# 0002. Adopt a mini-commerce domain for the playground

- **Status:** Accepted
- **Date:** 2026-05-14
- **Deciders:** Playground maintainers
- **Supersedes:** the initial travel-booking framing (no prior ADR)

## Context

The first iteration of the playground used a fictional travel-booking
domain (trips, bookings, passengers, IATA codes, origin/destination). In
practice, that domain added friction to the engineering goals:

- Many engineering points required disclaiming domain detail before the
  point landed ("never mind what IATA is, focus on the module boundary").
- Trip search, multi-leg bookings, and seat holds suggested complex
  workflows that are out of scope for a structural skeleton.
- The terminology overlapped with real, recognizable companies, which
  conflicts with the playground's "no real names or proprietary details"
  rule.

The playground needs a domain that is:

- Universally understood with zero ramp-up.
- Small enough to describe end-to-end in one diagram, large enough to
  exercise module boundaries (catalog, cart, checkout, orders,
  notifications).
- Performance-friendly — read-heavy browse + write-heavy checkout
  patterns are a textbook fit for the k6 iteration that comes next.

## Decision

Adopt a **mini-commerce store** as the playground domain. The end-to-end
path is: load a small catalog of products → add items to a single-user
cart → check out → manage the resulting order (cancel, update status,
mark prepared).

Concretely:

- BFF modules: `catalog`, `cart`, `checkout`, `orders`, plus placeholders
  for `customers` and `notifications`.
- Public BFF surface: `GET /health`, `GET /catalog/products`,
  `GET /catalog/products/:id`, `POST /cart/items`, `GET /cart`,
  `POST /checkout`, `GET /orders/:id`, `POST /orders/:id/manage`.
- Order statuses: `pending`, `preparing`, `prepared`, `cancelled`.
- Management actions: `cancel`, `update_status`, `mark_prepared`.
- Persistence stays mocked and deterministic in this iteration (cart in
  process memory, orders in an in-memory map pre-seeded with `ord_demo`).
- No real payment processing, no authentication.

## Subsequent implementation note

The initial persistence choice described above was later advanced without
changing the selected mini-commerce domain: catalog and orders now persist
through Prisma/PostgreSQL and `GET /orders` lists persisted orders. Cart
remains the intentional single-user, in-process store.

## Consequences

**Easier:**

- The catalog → cart → checkout → orders flow is short enough that smoke
  validation hits every endpoint in seconds.
- Read vs. write traffic shapes are obvious (browse is read-heavy,
  checkout is write-heavy), which gives the k6 iteration a natural
  scenario layout.
- Module boundaries map 1:1 onto natural extraction candidates:
  `checkout` (transactional hotspot) and `notifications` (naturally async)
  are the obvious first Phase 3 services.
- Terminology stays fictional and recognizable without colliding with any
  real product.

**Harder:**

- All in-flight travel-domain references (types, READMEs, ADRs, the
  Docker DB name, the playground UI) have to be replaced in one
  sweep — a one-time cost.
- The cart sharing a single in-process key means the first multi-user
  iteration will require a deliberate state refactor (keying by
  customer/session). Captured as a TODO in `CartService`.

## Alternatives considered

- **Stay with travel booking** — rejected: domain friction outweighed the
  realism benefit, and Phase 3 extraction candidates in that domain
  (booking, notifications) were less self-evident than the mini-commerce
  equivalents.
- **Pure CRUD demo (`/users`, `/posts`)** — rejected: too small to
  exercise multi-module boundaries or to host meaningful performance
  scenarios.
- **Banking / ledger domain** — rejected: invites disproportionate
  conversations about correctness and money handling that distract from
  the engineering-practice focus of the playground.
