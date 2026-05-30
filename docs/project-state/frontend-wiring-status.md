# Frontend Wiring Status

> Current-state snapshot captured on 2026-05-29.
> For the full feature/UX inventory see [current-system.md](current-system.md);
> for proxy topology see [../architecture/web-entry-point.md](../architecture/web-entry-point.md).

## Implemented baseline

- The BFF exposes health, catalog, cart (incl. quantity update and item delete),
  checkout, orders, order management, and visualization endpoints.
- Catalog and orders use Prisma/PostgreSQL. Cart remains a deliberate
  single-user, in-process store that now supports full CRUD.
- The Next.js app is multi-page: catalog, cart, checkout, order list, order
  detail, visualizer embed, simulated Performance Playground, and development
  diagnostics are wired.
- The web app is the single browser entry point. The browser calls the
  same-origin `/api/bff` proxy; the web server rewrites it to the internal BFF.
- `apps/web/src/lib/api/expresso-api.ts` owns HTTP, proxy base-URL resolution,
  and demo-mode routing.
- `@mini-commerce/contracts` provides the frontend HTTP wire-format types.
- OpenTelemetry tracing is wired in the BFF when its exporter endpoint is
  configured.

## Stable backend surface for frontend work

| Method and path | State behavior | Consumer status |
|---|---|---|
| `GET /health` | Runtime status | Wired |
| `GET /catalog/products` | Reads persisted catalog | Wired |
| `GET /catalog/products/:id` | Reads persisted product | Wired |
| `POST /catalog/products` | Writes persisted product | Available for diagnostics |
| `GET /cart` | Reads transient cart | Wired |
| `POST /cart/items` | Adds a line to the transient cart | Wired |
| `PATCH /cart/items/:itemId` | Updates a line's quantity | Wired |
| `DELETE /cart/items/:itemId` | Removes a line | Wired |
| `POST /checkout` | Drains cart and persists order | Wired |
| `GET /orders` | Lists persisted orders | Wired |
| `GET /orders/:id` | Reads persisted order | Wired |
| `POST /orders/:id/manage` | Persists status change | Wired |
| `GET /visualization-data` | Projects current domain state | Visualizer consumer |

## Remaining product gaps

- Cart is not keyed by customer or session and resets with the BFF process.
- There is no authentication or payment processing.
- Contract provider verification, Playwright E2E coverage, and production
  observability dashboards remain follow-up work.

## Frontend change constraints

- Preserve `GET /orders` and persisted-order copy in every design iteration.
- Keep API calls in the centralized client or hand-wired hooks, not visual
  components.
- Keep demo-mode data visibly fictional and separate from real persisted
  state.
- Treat `/performance` as a mock-only frontend surface: it does not consume
  k6 output, Grafana data, or telemetry feeds.
- Treat the BFF and `@mini-commerce/contracts` as boundaries that a visual
  design pass cannot redefine.

See [`../frontend/v0-wiring-plan.md`](../frontend/v0-wiring-plan.md) for the
integration rules applied to design-assisted UI changes.
