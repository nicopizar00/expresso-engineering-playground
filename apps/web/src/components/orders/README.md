# `components/orders`

v0.app-generated order UI.

Planned components:
- `OrderSummary` — header, status, total, lines.
- `OrderManagePanel` — actions: `cancel`, `update_status`, `mark_prepared`.

Reminder: orders are in-memory in the BFF today. A checkout's `orderId`
becomes a 404 after BFF restart. Surface this lifecycle constraint in the
empty state until `docs/next-steps/orders-persistence.md` ships.
