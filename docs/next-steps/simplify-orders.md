# Simplify orders (place-and-done, my/all lists)

Status: shipped 2026-10-05.
Spec: `docs/superpowers/specs/2026-10-05-simplify-orders-design.md`
Plan: `docs/superpowers/plans/2026-10-05-simplify-orders.md`

## What changed

- Placing an order is final. No prepare, no cancel, no `status`.
- `Order.sessionId` (nullable, never serialized) records the anonymous
  `sid` owner. Seed and older orders have none.
- `GET /orders/mine` lists the caller's orders newest first;
  `GET /orders` lists all.
- Web Orders section: My orders (default) / All orders toggle; Hot/Cold
  badges flip at `coolsAt` without polling; order detail is read-only.
- Visualizer: order tint from temperature (hot → ok, cold → idle);
  `orderAggregates.temperatureCounts` replaces `statusCounts`.

## Open follow-ups

- Attach pre-session orders to a session (not planned).
- Pagination for `GET /orders` once history grows.
