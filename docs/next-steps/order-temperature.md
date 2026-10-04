# Order Temperature

Status: open (core shipped 2026-10-04; visualizer follow-up pending).

Spec: [`docs/superpowers/specs/2026-10-04-order-temperature-punch-data-design.md`](../superpowers/specs/2026-10-04-order-temperature-punch-data-design.md)

## What shipped

An order is "served" at checkout (`placedAt`). It reports `hot` until
`ORDER_COOL_DOWN_SECONDS` (default 300) have passed, then `cold`. The value
is derived on every read — never stored, no scheduler.

- **BFF:** `GET /orders/:id/status` reads Postgres directly (bypassing the
  in-memory order cache) and returns `status`, `temperature`, `placedAt`,
  `coolsAt`, `checkedAt`. `GET /orders` and `GET /orders/:id` also carry
  `temperature` + `coolsAt`. An invalid `ORDER_COOL_DOWN_SECONDS` aborts
  startup.
- **Web:** hot/cold badge in the orders list and detail; the detail view
  refetches once at `coolsAt` so the badge flips live.
- **Perf:** `order-status` consumes the `orders` dataset produced by
  `place-order`, `purchase-flow`, and `purchase-flow-browser`
  (`--produce orders`); `EXPECT_TEMPERATURE=auto|hot|cold` selects the check.
- **Smoke:** `./dev smoke` checks the typed status shape (16 checks).

## Open follow-ups

- Visualizer: show hot vs cold cups (e.g. steam on hot) from `temperature`
  in the scene feed. Anchor: `TODO(next-steps/order-temperature)` in
  `apps/bff/src/modules/orders/order-temperature.ts`.
- An `order-status-browser` scenario (reads the badge through the web app).
