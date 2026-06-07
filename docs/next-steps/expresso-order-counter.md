# Expresso Order Counter

Status: open.

This is the next visualizer evolution thread. It turns the technically working
"Hello Room" visualizer into the first coherent coffee-shop commerce scene.

Source review:

- `docs/project-state/visualizer-domain-certification.md`

## Goal

Create a minimal, coherent scene conceptually named "Expresso Order Counter".
It should make the current commerce state understandable as a small
retro-futuristic, PS1-inspired, low-poly coffee-shop counter.

The first visual anchor is Classic Expresso: a square espresso cup with a
four-sided opening, visible coffee, thin flat handle, square saucer, small
cup/saucer separation, pixelated texture treatment, and extremely low polygon
count.

## Non-Goals

- Do not build the complete Expresso Load Arcade world yet.
- Do not turn the scene into a generic dashboard.
- Do not add realism, smooth shading, bevel-heavy assets, subdivisions, model
  loaders, glossy PBR styling, or high-poly detail.
- Do not make the BFF choose meshes, colors, animations, or final layout.
- Do not change persistence, telemetry, k6 scenarios, or unrelated web routes
  unless the owner explicitly expands scope.

## Boundaries To Preserve

- Web app remains the browser-facing shell.
- Standalone visualizer remains under `apps/visualizer-3d`.
- Visualizer remains static Three.js served by nginx unless a later decision
  explicitly changes that.
- BFF remains the only source of visualization data.
- `GET /visualization-updates` remains SSE-primary.
- Polling fallback remains available through `GET /visualization-data`.
- Orders remain PostgreSQL-backed.
- Cart remains in-memory for this phase.
- `/performance` remains mock-only.

## Target Scene Semantics

The first coherent scene should include:

- A simple room or counter area.
- A main counter.
- A product shelf or display area.
- A recent orders area.
- A completed orders or pickup area.
- A simple coffee machine.
- Classic Expresso as the first strong visual product asset.
- Orders represented as tickets, trays, cups, boxes, or grouped product objects.
- Old/historical orders represented as aggregate stacks, boxes, shelves, or
  counters rather than one permanent object per database row.

## Work Tracks

| ID    | Track                  | Scope                                                                                                                                                                                                  | Likely Files                                                                                                            | Status                                                                                                                            |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| EOC-1 | Documentation cleanup  | Refresh remaining stale visualizer docs so future agents do not follow manual-reload, polling-only, or superseded UAT guidance.                                                                        | `README.md`, `docs/ai/codex/current-findings.md`                                                                        | pending                                                                                                                           |
| EOC-2 | Semantic data contract | Decide how the BFF will provide meaning without owning representation. Prefer recent orders plus aggregates over every order row; decide whether live product creation must emit visualization events. | `apps/bff/src/modules/visualization/*`, `apps/bff/src/modules/catalog/*`, `packages/contracts/src/index.ts` if promoted | **in progress — contract shipped, legacy `items[]` retained for one iteration**                                                   |
| EOC-3 | Three.js module split  | Keep static ESM, but separate transport, scene setup, layout, material palette, and object factories before adding visual complexity.                                                                  | `apps/visualizer-3d/public/*.js`                                                                                        | pending                                                                                                                           |
| EOC-4 | Classic Expresso asset | Build and certify the square espresso cup, saucer, coffee surface, handle, palette, pixel texture, and small-scale readability.                                                                        | `apps/visualizer-3d/public/objects/*`, `scene.js` integration                                                           | pending                                                                                                                           |
| EOC-5 | Order Counter scene    | Add counter, shelf, recent orders area, pickup/completed area, coffee machine, and semantically mapped order/product objects.                                                                          | `apps/visualizer-3d/public/*`                                                                                           | pending                                                                                                                           |
| EOC-6 | History aggregation    | Replace unbounded one-order-one-object history with recent individual objects plus old-order aggregate objects.                                                                                        | BFF visualization service and visualizer mapper                                                                         | partial — `recentOrders` window + `orderAggregates` shipped with EOC-2; richer aggregation (per-product, time buckets) still open |
| EOC-7 | Certification          | Verify API shape, SSE behavior, visual rendering, nonblank canvas, desktop/mobile framing, object readability, and no text overlap.                                                                    | tests, Playwright/browser checks, docs                                                                                  | pending                                                                                                                           |

## EOC-2 status (shipped)

Decisions locked into the implementation:

1. **Additive evolution.** `VisualizationDataResponse` now carries both the
   legacy `items[]` (deprecated, scheduled for removal) and a typed `scene`
   field. Single endpoint, single SSE channel.
2. **`scene` carries meaning only.** `SceneProduct`, `SceneOrder`,
   `OrderAggregates`, `SceneCart`. No `cube/sphere/marker` strings; `asset`
   and `assetConfig` are typed objects (no JSON-string smuggling).
3. **Catalog SSE wired.** `CatalogService.create()` now emits
   `DomainEventsService.changed$` so new products propagate immediately.
4. **Recent / aggregate split shipped at a simple impl.** `recentOrders`
   capped at 10 by `updatedAt`; `orderAggregates.olderCount` counts the
   tail; `statusCounts` reduces over the full list. EOC-6 still owns
   richer aggregation.
5. **Visualizer consumer migrated.** `scene.js` now dispatches on semantic
   role through `renderScene(scene)`; the legacy `renderItems(items)` path
   stays as a fallback while smoke/k6/older BFFs still emit `items[]`.

See [`../architecture/bff-modules.md`](../architecture/bff-modules.md#visualization-endpoint-as-a-phase-3-boundary)
for the contract description and
[`../project-state/current-system.md`](../project-state/current-system.md)
for the user-facing surface row.

## Recommended Implementation Order

1. Update stale docs and prompts enough that the implementation agent has one
   current source of truth.
2. Design the semantic visualization response. Decide whether to evolve the
   existing DTO additively or introduce a versioned response.
   Also decide whether catalog product creation must participate in the SSE
   event stream once products become visible shelf objects.
3. Refactor the static visualizer into small browser modules without changing
   behavior.
4. Implement Classic Expresso and certify it in isolation.
5. Build the minimal order-counter room around existing live data.
6. Add recent-order and aggregate-history mapping.
7. Run shell and browser certification.

## Data Contract Direction

The backend should provide meaning such as:

- total order count
- recent order list
- older order aggregate counts
- status counts
- product composition per recent order
- product categories and inventory
- cart summary
- latest activity timestamp
- optional future performance/load signals

Three.js should provide representation:

- object factories
- mesh choices
- positions
- colors
- animation
- grouping
- retro low-poly visual style

Avoid making the backend emit final meshes such as `cube`, `sphere`, or
`marker` as the long-term contract. Those may remain temporarily for backward
compatibility.

## Classic Expresso Acceptance Criteria

- Square cup body.
- Four-sided top opening.
- Visible coffee surface with slight depth.
- Very few polygons.
- Flat shading only.
- No smoothing.
- No bevels.
- No subdivisions.
- Thin, flat, vertical handle with almost no thickness.
- Square four-sided saucer.
- Small visible separation between cup and saucer.
- Limited palette.
- Pixelated texture treatment.
- Rough, low-resolution-looking shadow.
- Recognizable at small sizes.

## Visual Acceptance Criteria

- The first viewport of the visualizer clearly reads as a coffee-shop order
  counter, not a generic technical room.
- A user can distinguish products, recent orders, completed/pickup orders, cart
  activity, and historical aggregate state.
- Order state has visual semantics beyond generic green/orange/red health.
- Old orders do not create unbounded permanent geometry.
- Scene remains readable with the current item volume and with larger persisted
  order counts.
- SSE updates still repaint the scene promptly after cart, checkout, or order
  status mutations.

## Validation

Shell checks:

```bash
pnpm --filter @mini-commerce/bff typecheck
pnpm --filter @mini-commerce/bff test
pnpm typecheck
pnpm build
pnpm pg:smoke
```

Browser checks:

- Open `http://localhost:3000/visualizer`.
- Open standalone `http://localhost:3002`.
- Confirm the canvas is nonblank.
- Confirm the HUD reaches `live (sse)`.
- Create a cart item and confirm the scene updates through SSE.
- Place an order and confirm the recent-order area updates.
- Manage an order and confirm status representation changes.
- Verify desktop and mobile framing.
- Verify Classic Expresso remains readable at small scale.

## Claude Code Handoff Prompt

Use this prompt only after reviewing
`docs/project-state/visualizer-domain-certification.md`.

```text
ROLE
You are Claude Code implementing a bounded visualizer evolution for the
Expresso Engineering Playground. Work in English. Do not add AI attribution,
generated-by text, co-author trailers, or tool ownership claims.

GOAL
Evolve the current "Hello Room" 3D visualizer into the first minimal
"Expresso Order Counter" scene. Start with Classic Expresso as the first
domain-specific visual asset, then map current commerce state into a small
coffee-shop counter scene.

READ FIRST
- CLAUDE.md
- docs/project-state/visualizer-domain-certification.md
- docs/next-steps/expresso-order-counter.md
- apps/visualizer-3d/README.md
- apps/bff/src/modules/visualization/*
- apps/visualizer-3d/public/scene.js
- apps/visualizer-3d/public/index.html

BOUNDARIES
- Preserve the web app as the browser-facing shell.
- Preserve the standalone visualizer boundary.
- Preserve BFF-owned visualization data and no direct DB access.
- Preserve SSE primary updates and polling fallback.
- Preserve PostgreSQL-backed orders and in-memory cart.
- Keep /performance mock-only.
- Do not implement the full arcade world.
- Do not add realism, smooth shading, bevels, subdivisions, high-poly assets,
  glossy PBR style, or dashboard UI.

IMPLEMENTATION EXPECTATIONS
1. First remove stale documentation ambiguity that would conflict with this
   visualizer direction.
2. Make a deliberate semantic data-contract decision before changing scene
   meaning. The BFF should provide meaning; Three.js should own representation.
3. Refactor the static visualizer into small ESM modules only as needed to keep
   the Classic Expresso and scene mapping reviewable.
4. Implement Classic Expresso with square, flat, low-poly PS1-inspired geometry.
5. Build the minimal order counter scene: counter, shelf/display, recent orders,
   pickup/completed area, simple coffee machine, and aggregate history.
6. Avoid rendering every historical order as a permanent individual object.

VALIDATION
- Run the relevant BFF tests and typechecks.
- Run pnpm pg:smoke.
- Verify the visualizer in a browser at /visualizer and standalone :3002.
- Capture desktop and mobile evidence that the canvas is nonblank, framed,
  readable, and updates after cart/checkout/order mutations.

OUTPUT
Report files changed, contract decisions, validation results, browser evidence,
and remaining risks. Separate pre-existing doc drift from implementation
changes.
```
