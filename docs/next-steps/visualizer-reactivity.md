# Visualizer reactivity (Phase 2 follow-up)

## Status

Scaffolded — implementation pending. **5 anchors** in source
(`grep -rn "next-steps/visualizer-reactivity" apps/visualizer-3d/`).

## Goal

Promote the 3D visualizer from manual-reload to **interval polling** so
that creating, modifying, or deleting state via the web app (or curl)
is reflected in the 3D scene within a couple of seconds, without the
user clicking the **Reload data** button.

## Why

Today the visualizer is strictly pull-based and only fetches once per
page load:

- `apps/visualizer-3d/public/scene.js:82` — `void loadAndRender();` runs once.
- `apps/visualizer-3d/public/scene.js:75` — the reload button is the
  only refresh trigger.
- BFF mutation handlers (`apps/bff/src/modules/cart/cart.service.ts`,
  `…/orders/orders.service.ts`, `…/checkout/checkout.service.ts`) do
  not emit any event the visualizer could subscribe to.

User-visible problem: add a cart item or place an order in the web
app at <http://localhost:3000>, switch to the visualizer at
<http://localhost:3002>, and the new shape is invisible until **Reload
data** is clicked. The visualizer feels frozen.

Polling is the cheapest fix because the existing aggregator endpoint
(`GET /visualization-data`) already returns a complete snapshot of
products, cart, and orders — no event bus, no SSE, no WebSocket needed.

## Target behavior

- A `POLL_INTERVAL_MS` constant (default `2000`) drives a `setInterval`
  that calls `loadAndRender()`.
- The initial page load still runs `loadAndRender()` once
  synchronously, so the scene paints immediately.
- A single in-flight guard: if a fetch is still pending when the next
  tick fires, skip that tick (no overlapping requests).
- Polling pauses while the document is hidden
  (`document.addEventListener("visibilitychange", …)`) and resumes
  with an immediate fetch when the tab is shown again. This avoids
  hammering the BFF for invisible background tabs.
- The HUD `#status` span at
  `apps/visualizer-3d/public/index.html:33` reflects poll state:
  - `live · N items` when a tick succeeds (existing message stays).
  - `polling…` for the moment a tick is in flight.
  - `error · <reason>` if `fetchItems()` rejects; the previous scene
    stays rendered, the next tick retries.
- The manual **Reload data** button still works and **resets the
  interval timer** (avoids a tick firing immediately after a manual
  click).

## Sub-tasks

1. **Constants and state** — at the top of `scene.js`, near line 39,
   declare `const POLL_INTERVAL_MS = 2000;` and `let inflight = false;`
   plus `let pollHandle = null;`.
2. **Schedule polling** — replace the bare `void loadAndRender();` at
   `scene.js:82` with a small `startPolling()` helper that calls
   `loadAndRender()` once and then `pollHandle = setInterval(…, POLL_INTERVAL_MS)`.
3. **In-flight guard** — wrap the body of `loadAndRender()` (definition
   at `scene.js:171`) in `if (inflight) return; inflight = true; try { … } finally { inflight = false; }`.
4. **Reload button reset** — in the click handler at `scene.js:75`,
   `clearInterval(pollHandle)` then call `startPolling()` so the next
   automatic tick is a full interval away from the manual one.
5. **Visibility listener** — add a `visibilitychange` handler that
   `clearInterval`s when hidden and `startPolling`s when visible.
6. **HUD copy** — surface `polling…` / `error · <reason>` via the
   existing `setStatus()` helper (no new DOM needed); update the HTML
   comment near `index.html:33` so the span's contract is documented.
7. **Visualizer README** — `apps/visualizer-3d/README.md` currently
   says "the visualizer does not auto-poll — reload is manual on
   purpose." Update that paragraph to describe the new behavior, the
   2 s default, and the hidden-tab pause.
8. **Smoke verification** — from a fresh `./dev up full`:
   a. Open <http://localhost:3002> and confirm the HUD ticks
      `polling…` → `live · N items` repeatedly.
   b. In another tab, `curl -X POST http://localhost:3001/cart/items
      -d '{"productId":"prod_espresso","quantity":1}' -H
      'Content-Type: application/json'`.
   c. Within ≤ 2 s the cone (cart marker) should appear in 3D
      without clicking **Reload data**.
   d. Place an order via `POST /checkout`; within ≤ 2 s a new sphere
      appears.
   e. Background the visualizer tab for 30 s, foreground it, and
      observe the immediate refresh on focus.

## Critical files

| Path | Role |
| ---- | ---- |
| `apps/visualizer-3d/public/scene.js` | Core polling loop, all four JS anchors live here. |
| `apps/visualizer-3d/public/index.html` | HUD `#status` span and HTML anchor. |
| `apps/visualizer-3d/README.md` | Doc update to drop the "manual reload" claim. |
| `apps/bff/src/modules/visualization/visualization.service.ts` | No code change, but the endpoint contract becomes hotter — confirm the aggregator stays O(1) per call. |

## Acceptance criteria

- The 5 source anchors at `grep -rn "next-steps/visualizer-reactivity"
  apps/visualizer-3d/` are deleted (count drops to zero — that's the
  signal the thread is done, per
  [`docs/next-steps/README.md`](./README.md)).
- A mutation in the web app or via curl appears in the 3D scene
  within `POLL_INTERVAL_MS + one fetch RTT`.
- Polling pauses when the tab is hidden, resumes on focus with an
  immediate fetch.
- No request overlap — at most one `GET /visualization-data` is in
  flight at any moment.
- Visualizer `README.md` matches the new behavior.
- `./dev smoke` still passes; no new typecheck or lint failures.

## Future work (not in this thread)

The polling approach is intentionally minimal. Two richer variants are
recorded here so future iterations can pick them up without re-doing
the discovery work:

### Variant A — Server-Sent Events

- New endpoint `GET /visualization-updates` in
  `apps/bff/src/modules/visualization/visualization.controller.ts` that
  streams `text/event-stream`.
- A Nest `EventEmitter` injected into `CartService`, `OrdersService`,
  and `CheckoutService`. Each mutation emits a domain event
  (`cart.added`, `order.placed`, `order.updated`). The visualization
  module listens, computes a fresh snapshot, and pushes an SSE frame.
- Browser side: replace `setInterval` with an `EventSource` that
  triggers `loadAndRender()` on each frame. Polling becomes the
  fallback when SSE is unavailable.
- Trade-off: ~50 ms latency instead of `~2000 ms`, but multiplies the
  number of moving parts (event emitter, SSE plumbing,
  reconnection logic) — only worth it if user testing flags 2 s as
  too slow.

### Variant B — WebSocket

- `@nestjs/websockets` + Socket.IO gateway under
  `apps/bff/src/modules/visualization/visualization.gateway.ts`.
- Visualizer connects on load, subscribes to a `visualization` room,
  receives push messages with deltas (not full snapshots) so the
  browser can patch the scene incrementally.
- Trade-off: lowest latency, supports server→client broadcast for
  multi-tab scenarios, but requires browser WS client, gateway tests,
  and a story for reconnect / message ordering. Out of scope until
  Phase 3 service extraction makes the WS gateway worth its weight.

## Convention notes

The repo grep recipe in
[`docs/next-steps/README.md`](./README.md) currently scans
`*.ts`, `*.prisma`, `*.mjs`, `*.yaml`. Anchors in this thread land in
`*.js` and `*.html`. Either:

- Extend the grep recipe to include `--include='*.js' --include='*.html'`, or
- Run a targeted grep: `grep -rn "next-steps/visualizer-reactivity" apps/visualizer-3d/`.

Both yield the same five hits.
