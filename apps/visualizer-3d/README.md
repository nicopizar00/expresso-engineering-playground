# visualizer-3d

A controlled, lightweight 3D visualization module for the mini-commerce
engineering playground. First iteration — Hello Room.

## What this is

A standalone static frontend that renders a minimal Three.js scene and
consumes domain-shaped data through the BFF's HTTP contract. Products,
persisted orders, and the current in-memory cart are already projected into
the scene; the visualizer never touches the database directly.

## What this is NOT (current iteration)

- A polished 3D UI or production-grade dashboard.
- A Babylon.js / game-engine / physics-engine experiment.
- A consumer of textures, model loaders, or shader pipelines.
- A workspace package — there is no `package.json` and no Node build step.
  The deployable is just `public/` served by `nginx:alpine`.

## How to run

The visualizer is Docker-first. No host-side `pnpm` is needed.

```bash
# Visualizer only (app stack assumed already running)
./scripts/visualizer-up.sh

# Full stack (app + visualizer)
./scripts/full-up.sh
```

Then open <http://localhost:3002>.

### Stopping

```bash
./scripts/visualizer-down.sh   # visualizer only
./scripts/full-down.sh         # full stack
```

### Pointing at a different BFF

The BFF address is injected at container start by
`docker-entrypoint.sh` into `/usr/share/nginx/html/config.js`, so the same
image can target any environment without a rebuild:

```bash
VIZ_API_BASE_URL=https://staging.example ./scripts/visualizer-up.sh
```

The browser is on the host, not in the container, so the URL must be
reachable from the host (e.g. `http://localhost:3001`, not `http://bff:3001`).

## How it connects to application data

The visualizer consumes the typed `GET /visualization-data` on the BFF,
defined in [`apps/bff/src/modules/visualization`](../bff/src/modules/visualization).
The BFF projects its current domain state through a `VisualizationScene`:

```ts
interface VisualizationScene {
  products: SceneProduct[];
  recentOrders: SceneOrder[];
  orderAggregates: OrderAggregates;   // counts, statusCounts, olderCount
  cart: SceneCart | null;
  latestActivityAt: number;
}
```

The contract carries **meaning**, not representation. Mesh / colour / layout
choices are owned by the visualizer (`objects/scene-meshes.js`,
`layout/render.js`). If the BFF is unreachable, `fallback.js`'s
`FALLBACK_SCENE` keeps the room renderable — the network failure surfaces
in the HUD as `offline · N mock objects`.

### Refresh behavior

The scene connects to `GET /visualization-updates` (SSE) on load, so a
mutation in the web app or via curl — add to cart, place an order, manage an
order — appears in 3D in tens of milliseconds, without clicking **Reload
data** and without the 2 s poll delay. The BFF pushes a full snapshot
immediately on connection and again after each domain mutation.

If SSE is unavailable (unsupported browser, transient BFF error),
`transport.js` falls back to polling `GET /visualization-data` every 2 s
(`POLL_INTERVAL_MS`) and retries the SSE connection after 5 s
(`SSE_RETRY_MS`). Only one request is in flight at a time (overlapping ticks
are skipped). Both SSE and polling pause while the browser tab is hidden and
resume on focus. The **Reload data** button reconnects SSE (or resets the
poll timer in fallback mode). The status pill shows
`live (sse) · N objects` when streaming, `live · N objects` when polling
succeeds, `polling…` during a tick, and `error · <reason>` on a failed tick
(the previous scene stays rendered and the next tick retries).

### Module layout

`public/` is served verbatim by `nginx:alpine` (no bundler, no Node build
step). ESM modules under `public/` are resolved natively by the browser via
the importmap in `index.html`.

| File | Owns |
|---|---|
| `scene.js` | Entry shim: DOM + Three.js bootstrap + factory wiring. |
| `utils.js` | `clamp`. |
| `materials.js` | `ESPRESSO_PALETTE`, `STATUS_COLORS`, `desaturateHex`, `makePsxTexture`. |
| `geometry/frustum.js` | `buildSquareFrustum`, `buildOpenFrustum` (the Standard-tier building blocks). |
| `objects/room.js` | `ROOM`, `buildRoom`. |
| `objects/espresso-cup.js` | `ESPRESSO_CFG` (DEV ENTRY POINT) + `buildEspressoGroup`. |
| `objects/scene-meshes.js` | `buildProductMesh`, `buildOrderMesh`, `buildAggregateMesh`, `buildCartMesh`. |
| `objects/disposal.js` | `clearGroup` (canvas-texture-aware). |
| `layout/render.js` | `createRenderer({ dataGroup })`, `createAnimator({...})`, hero/scale constants. |
| `transport.js` | `API_BASE`, `initTransport({...})` → `{ connect, pauseForHidden }`. |
| `fallback.js` | `FALLBACK_SCENE`. |

`config.js` is a runtime-only file generated at container start by
`docker-entrypoint.sh`; it sets `window.__VIZ_CONFIG__.apiBaseUrl` and is
never committed.

Adding a new domain asset: see
[`../../docs/visualizer/art-direction.md`](../../docs/visualizer/art-direction.md)
"Adding a new asset".

## Why it does not access the database directly

Three reasons, in priority order:

1. **Ownership boundary.** The BFF owns the domain. The visualizer is a
   presentation layer. A read-only DB connection from a frontend container
   would couple presentation to schema and break the eventual Phase 3
   distributed-services move.
2. **Testability.** Going through HTTP means contract tests, fixture
   replays, and HTTP-level k6 scenarios all apply identically to the
   visualizer.
3. **Performance governance.** A presentation tier that talks to the DB
   directly hides its real cost from observability and from k6 load
   profiles.

## What remains for future iterations

- Optional performance or operational overlays, provided through an
  explicitly owned BFF contract rather than direct data-store access.
- Optional richer geometry (still primitives — no model loaders).
- A small legend / inspector panel.
- A read-heavy k6 load / stress profile for `/visualization-data`. Smoke
  coverage already hits the endpoint via
  `tests/performance/k6/scenarios/smoke/smoke.js`.

## Design tooling boundary

A separate design track may use [v0.app](https://v0.app) to
explore the visual design, layout, interaction concepts, control panels,
legends, and UI polish. The current web app already embeds the standalone
visualizer through `/visualizer`; the runtime boundary remains unchanged.

> Future v0.app track: use v0.app only for visual exploration, interaction
> ideas, UI layout, control panels, legends, and design language. Do not
> use v0.app output as the source of truth for architecture, data
> contracts, Docker setup, performance strategy, or service ownership.

Anything generated through v0.app must be adapted into this module by
hand and must continue to satisfy the constraints in this README (no
heavy engines, no DB access, DTO-driven, Docker-first).
