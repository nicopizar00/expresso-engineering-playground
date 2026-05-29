# Current Codex Findings

Snapshot date: 2026-05-29.

Use this summary when framing Codex prompts, review scopes, or follow-up
implementation instructions.

## UAT Verdict

The web app is partially valuable and navigable today. Catalog, cart backend
CRUD, checkout backend persistence, orders list, `/performance`, `/dev`, and
visualizer proxy/assets are present and reachable.

The app is not yet acceptable as a complete user-facing commerce flow because
the order detail route returns 500. This breaks checkout confirmation, order
detail navigation, order status management, and invalid-order resilience.

## Top Blockers

1. Fix `/orders/[orderId]` route parameter handling so order detail pages
   render on the running Next.js 14 app.
2. Rerun the checkout and orders journeys manually in a browser after that
   route fix.
3. Visually verify the 3D scene and reload behavior in a real browser.

## Runtime Drift

`pnpm pg:up full` migrated and seeded successfully, then failed with
`unknown flag: --profile` on the local Docker Compose version. Direct Compose
profile invocation started the full stack successfully.

Recommendation: update the wrapper so profile flags are passed through the
existing `compose(..., { profiles })` helper or otherwise placed before the
Compose subcommand.

## Verified Shell Results

- `pnpm pg:smoke`: 12/12 checks passed.
- `/api/bff/health` through the web proxy returned 200.
- `/viz/index.html` and `/viz/scene.js` through the web proxy returned 200.
- Proxy cart CRUD worked: POST, PATCH, DELETE.
- Proxy checkout created an order, drained cart to 0, and persisted status
  after manage and reload.

## Visualizer State

No visualizer embed code change was made. `/visualizer`, proxied `/viz` assets,
the standalone visualizer at `http://localhost:3002`, and
`/api/bff/visualization-data` are reachable.

The visualizer data feed currently includes catalog products, orders, and a
cart marker. Pixel-level confirmation, color coding, and reload reactivity
still require a real browser pass.
