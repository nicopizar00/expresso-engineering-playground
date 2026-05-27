# k6 Readiness

> Captured 2026-05-16. Current branch: `expresso-frontend-build`.

This document describes the repository's readiness for Grafana k6 performance
and scenario testing, and what must happen before k6 scenarios can be written.

---

## Current state

The k6 infrastructure is wired (`tests/performance/k6/`, `pnpm pg:perf:smoke`).
The smoke profile is the only runnable scenario. It targets the BFF's HTTP
endpoints and does not depend on browser state.

## What is stable and safe for k6 scenarios

The following endpoints have stable, documented semantics and are ready to
be exercised by k6:

### Read-only (safe to call at any VU count, no ordering constraint)

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /health` | `HealthReport` | Always 200 if BFF is up |
| `GET /catalog/products` | `ProductsResponse` | Seeded 7 products; stable across restarts |
| `GET /catalog/products/:id` | `Product` | 404 on miss |
| `GET /orders` | `OrdersResponse` | Returns all persisted orders |
| `GET /orders/:id` | `Order` | 404 on miss |
| `GET /visualization-data` | `VisualizationDataResponse` | Aggregates all domain data |

### Write (create/mutate — must be ordered within a scenario)

| Endpoint | Effect | Required prior state |
|---|---|---|
| `POST /cart/items` | Adds to in-memory cart | BFF running; valid productId |
| `POST /checkout` | Drains cart → creates order in DB | Cart must be non-empty |
| `POST /orders/:id/manage` | Updates order status in DB | Valid orderId |
| `POST /catalog/products` | Creates a product in DB | Valid payload |

### Canonical k6 scenario skeleton (checkout flow)

```javascript
// 1. Add item to cart
http.post(`${BASE}/cart/items`, JSON.stringify({ productId: 'prod_espresso', quantity: 1 }), PARAMS);

// 2. Checkout
const res = http.post(`${BASE}/checkout`, JSON.stringify({ customerName: 'k6-user' }), PARAMS);
const orderId = res.json('orderId');

// 3. Verify order persisted
http.get(`${BASE}/orders/${orderId}`);

// 4. Verify visualizer picks it up
http.get(`${BASE}/visualization-data`);
```

## What is still intentionally in-memory (do not write k6 scenarios against)

- **Cart** — single in-process cart, resets on BFF restart, not session-keyed.
  k6 scenarios that add to cart must do so within the same "session" and should
  not assert cart state across VU boundaries.

## What is NOT ready for k6 yet

| Area | Status | Blocker |
|---|---|---|
| OpenTelemetry tracing | ✅ Wired — NodeSDK + OTLP HTTP exporter, auto-instrumentations, order spans | — |
| k6 → Grafana dashboard | Not configured | Grafana stack not in Docker Compose |
| Contract/Pact tests | Infrastructure wired, bodies are TODOs | Out of scope |
| E2E (Playwright) | Infrastructure wired, bodies are TODOs | Out of scope |
| Cart persistence | Intentionally in-memory | Phase 1 constraint |

## Recommended next k6 iteration

1. Add a `checkout-flow.js` scenario that runs the four-step flow above.
2. Assert HTTP 201 on `/checkout`, 200 on `/orders/:id`, and that
   `visualization-data` contains a sphere with `id === viz_order_${orderId}`.
3. Add a `read-heavy.js` scenario that fans out across all GET endpoints
   to establish baseline latency numbers before any optimization work.
4. Wire the k6 HTML report to a Grafana dashboard (requires adding Grafana +
   InfluxDB or Prometheus to `infra/docker/compose.performance.yaml`).

## Anchor tag for future k6 work

Source files that will need updates when k6 scenarios are written:

```bash
grep -rn "TODO(k6)" .
```

Current anchors:
- `apps/web/app/orders/page.tsx` — orders list page is a future k6 GET target
