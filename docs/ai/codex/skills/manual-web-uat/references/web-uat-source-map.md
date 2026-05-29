# Manual Web UAT Source Map

## Required Docs

- `docs/uat/web-app-uat.md`
- `docs/uat/walkthrough-uat.md`
- `docs/project-state/current-system.md`
- `docs/architecture/web-entry-point.md`
- `docs/local-development.md`
- `docs/ai/codex/current-findings.md`

## Required Shell Checks

- `pnpm pg:smoke`
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/bff/health`
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/viz/index.html`
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/viz/scene.js`
- Cart CRUD through `/api/bff/cart/items`: POST, PATCH, DELETE.

## Browser-Only Checks

Mark these manual or skipped unless a real browser is available:

- Header/footer navigation and dead-end recovery.
- Catalog card rendering, category filter behavior, and quick view.
- Cart drawer and cart page quantity controls.
- Checkout confirmation screen.
- Order detail and order status controls.
- Demo Mode mock scenarios.
- `/performance` copy and mock-only labeling.
- `/dev` card interactions.
- 3D scene painting, status colors, and reload reactivity.

## Current Known Findings

- `/orders/[orderId]` returns 500 in the tested runtime and blocks checkout
  confirmation plus order management UX.
- `pnpm pg:up full` can fail with Compose profile flag drift.
- `/viz` proxy assets and visualization-data are reachable; pixel verification
  remains manual until a browser pass is available.
