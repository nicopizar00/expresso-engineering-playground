# Visualizer Domain Certification

Snapshot date: 2026-05-31.

This report reviews the current 3D visualizer, visualization data path, order
persistence path, and AI guidance files against the desired "Expresso Order
Counter" direction. It is an analysis and planning artifact only. It does not
implement product features, scene changes, assets, backend behavior, or database
changes.

## Verdict

The visualizer has a solid technical foundation, but it is not yet certified as
a meaningful coffee-shop commerce visualization.

Technical foundation: conditional pass.

Domain and art direction: fail.

Claude Code implementation readiness: conditional pass only if the future
implementation session starts from this report and
`docs/next-steps/expresso-order-counter.md`, not from the current generic
visualizer docs alone.

## Inspected Areas

Core runtime and data flow:

- `apps/bff/src/modules/visualization/visualization.service.ts`
- `apps/bff/src/modules/visualization/visualization.controller.ts`
- `apps/bff/src/modules/visualization/visualization.types.ts`
- `apps/bff/src/modules/orders/orders.service.ts`
- `apps/bff/src/modules/cart/cart.service.ts`
- `apps/bff/src/modules/checkout/checkout.service.ts`
- `apps/bff/prisma/schema.prisma`
- `apps/bff/prisma/seed.ts`
- `apps/visualizer-3d/public/scene.js`
- `apps/visualizer-3d/public/index.html`
- `apps/visualizer-3d/public/style.css`
- `apps/web/app/visualizer/page.tsx`

AI, governance, and planning material:

- `CLAUDE.md`
- `docs/ai/codex/governance.md`
- `docs/ai/codex/current-findings.md`
- `docs/ai/codex/*.md`
- `docs/ai/codex/skills/**/SKILL.md`
- `docs/ai/claude/*.txt`
- `docs/project-state/current-system.md`
- `docs/project-state/state-driven-visualization.md`
- `docs/next-steps/visualizer-reactivity.md`
- `docs/next-steps/uat-remediation.md`
- `apps/visualizer-3d/README.md`
- root `README.md`

Ignored source-like duplicates:

- `.claude/worktrees/**` appears to contain ignored Claude worktree copies. It
  is not treated as canonical project guidance.

## Certification Matrix

| Area | Status | Evidence |
| --- | --- | --- |
| BFF ownership boundary | Pass | Visualizer consumes BFF endpoints and does not read PostgreSQL directly. |
| Persisted orders path | Pass | `OrdersService` loads and mutates PostgreSQL rows through Prisma, then serves a warm cache. |
| Live update path | Partial | `GET /visualization-updates` uses SSE for cart, checkout, and order events, but catalog product creation does not emit the same domain-change signal. |
| Current visual domain alignment | Fail | The scene is still named "Hello Room" and renders cubes, spheres, and a cone. |
| Data meaning | Partial | Metadata contains product, order, and cart facts, but the top-level DTO is still primitive-rendering shaped. |
| Scene semantics | Fail | Recent orders, historical orders, product composition, pickup/completed states, and coffee-shop areas are not visually distinguishable. |
| Three.js architecture | Partial | Transport and clear/rebuild behavior are simple and maintainable, but scene, fetch, mapping, geometry factories, and animation live in one file. |
| Retro PS1 art direction | Fail | Current materials, lighting, antialiasing, smooth spheres/cones, white room, and grid are generic technical sandbox choices. |
| Performance scaling | Partial | SSE avoids stale UI, but every persisted order becomes a permanent rendered item. No recency window or aggregate summary exists. |
| AI governance readiness | Partial | Boundaries are strong, but several guidance files are stale or completed prompts rather than current implementation direction. |

## Current Implementation State

Implemented:

- `GET /visualization-data` returns products, orders, and cart as
  `VisualizationItem[]`.
- `GET /visualization-updates` streams the same snapshot shape through SSE.
- Cart add/update/remove, checkout, and order management emit domain-change
  signals.
- Catalog product creation updates the data available to `GET /visualization-data`
  but does not currently emit an SSE change signal.
- Orders are persisted in PostgreSQL and loaded into an in-memory cache on BFF
  startup.
- The visualizer reconnects SSE, falls back to polling, pauses data transport
  while hidden, and disposes old geometry/materials on full scene rebuild.
- The standalone visualizer and the web `/visualizer` iframe preserve the
  boundary between Next.js UI and Three.js rendering.

Partially implemented:

- `/visualization-data` carries useful metadata, but it still tells the
  frontend to render `cube`, `sphere`, or `marker` at backend-provided position
  hints.
- Status color semantics exist, but they are generic health colors rather than
  coffee-shop order semantics.
- Products, orders, and cart are separated by coarse sectors, but the layout is
  not a counter, shelf, pickup area, queue, or coffee machine.
- Current docs recognize the visualizer boundary, but some docs still describe
  manual reload or polling-only behavior.

Only implied:

- A coffee-shop visual world.
- Classic Expresso as a product asset.
- Recent activity versus old history.
- Aggregate order history.
- Future k6 or performance signals in the scene.
- A stable semantic visualization contract where the BFF provides meaning and
  Three.js owns representation.

Missing:

- Classic Expresso geometry, texture, palette, saucer, handle, and coffee
  surface.
- Any room/counter/product shelf/pickup-area/coffee-machine semantics.
- A recency model for visual orders.
- Aggregate objects for historical orders.
- A semantic contract for recent orders, completed orders, product composition,
  and future performance signals.
- A modular Three.js structure for assets, scene layout, data interpretation,
  object factories, animation, and transport.
- Browser pixel certification for the current visual appearance.

## Key Findings

### C1 - The Scene Is Still a Placeholder Sandbox

Severity: high.

`scene.js` explicitly describes "Hello Room" and "Placeholder objects". The
renderer maps item types to a box, high-segment sphere, or cone. The HTML title
and subtitle also describe a placeholder visualizer.

Impact:

- A user cannot understand a coffee-shop commerce system by looking at the
  scene.
- The current visual result conflicts with the requested Expresso Load Arcade
  direction.

Recommendation:

- Rename the target implementation around "Expresso Order Counter".
- Replace generic object types with semantic scene roles interpreted by the
  Three.js layer.
- Keep the standalone static visualizer boundary.

### C2 - The Data Contract Mixes Meaning and Representation

Severity: high.

The backend currently emits `type: "cube" | "sphere" | "marker"` and
`positionHint`. That makes the BFF partly responsible for visual
representation. Metadata contains useful facts, but they are secondary to the
primitive rendering contract.

Impact:

- The backend leaks low-level presentation choices.
- Three.js cannot choose richer visual representations without either ignoring
  the existing top-level fields or changing the contract.

Recommendation:

- Move toward semantic data: products, recent orders, aggregate history, cart,
  recent activity, and optional performance signals.
- Let Three.js own object choice, layout, color, animation, and retro visual
  grammar.
- Use an owner-approved compatibility strategy: either a versioned contract or
  additive semantic metadata followed by a later contract cleanup.

### C3 - Historical Orders Scale Linearly Into Permanent Objects

Severity: high.

`VisualizationService.orderItems()` maps every `orders.listAll()` row into an
order item. `OrdersService` keeps all persisted orders in cache and `listAll()`
returns the entire cache.

Impact:

- The user-reported count around 95 items is consistent with the current design.
- As k6 or manual checkout creates more orders, the scene becomes noisier and
  less meaningful.
- The system is at risk of becoming a row visualizer instead of a domain scene.

Recommendation:

- Show only a bounded set of recent orders as individual tickets, trays, or cup
  groups.
- Represent older orders as aggregate stacks, boxes, shelves, counters, or a
  summary object.
- Add explicit aggregate counts in the BFF response instead of making Three.js
  infer history from every row.

### C4 - Three.js Is Compact But Not Ready To Scale

Severity: medium.

`scene.js` currently owns transport, SSE/polling fallback, room construction,
item mapping, object factory behavior, rendering, resize behavior, and fallback
data.

Impact:

- The current file is readable for "Hello Room", but future Classic Expresso,
  scene zones, product factories, order-state animation, and performance
  overlays will make it hard to review safely.

Recommendation:

- Keep the no-build, static-app constraint for now.
- Split browser modules inside `public/` before adding visual complexity:
  `transport`, `scene`, `layout`, `materials`, `objects/classic-expresso`,
  `objects/orders`, and `data-map` are enough.

### C5 - The Current Art Direction Conflicts With PS1 Low-Poly Goals

Severity: high.

Current scene choices include antialiasing, `MeshStandardMaterial`, smooth
spheres/cones with many segments, a white room, a soft grid, and generic status
colors.

Impact:

- The scene reads as a clean technical demo, not a rough mid-90s arcade
  coffee-shop world.

Recommendation:

- Use flat shading, hard silhouettes, low segment counts, limited palettes,
  pixelated textures, rough lighting, and deliberate low-resolution rendering.
- Avoid smooth shading, bevels, subdivisions, glossy PBR cues, and decorative
  modern low-poly polish.

### C6 - Guidance Files Are Strong But Not Fully Current

Severity: medium.

Strong current foundations:

- `CLAUDE.md` correctly records SSE, the domain-event module, the BFF boundary,
  and the web/visualizer topology.
- `docs/ai/codex/governance.md` clearly separates Codex governance from Claude
  implementation and preserves key functional truths.
- `apps/visualizer-3d/README.md` accurately describes SSE-first behavior with
  polling fallback.

Drift found:

- Root `README.md` still says the visualizer does not auto-poll and requires
  Reload Data after changes.
- `docs/project-state/state-driven-visualization.md` still says there is no
  polling, websocket, or push mechanism.
- `docs/ai/codex/current-findings.md` still carries old UAT blockers that
  appear to be superseded by `docs/next-steps/uat-remediation.md`.
- `docs/ai/claude/visualizer-sse-prompt.txt` is now a completed implementation
  prompt, not future direction.
- No repo-local prompt or skill currently captures the Classic Expresso or
  Expresso Order Counter art direction.

Correction made in this pass:

- `docs/next-steps/README.md` now points to
  `docs/next-steps/expresso-order-counter.md` and describes visualizer
  reactivity as SSE-primary with polling fallback.

Recommendation:

- Treat stale files as documentation debt before asking Claude Code for a visual
  implementation pass.
- Use `docs/next-steps/expresso-order-counter.md` as the current handoff source.

### C7 - Classic Expresso Is Absent

Severity: high.

No current source file defines Classic Expresso. There is no square espresso
cup, four-sided opening, visible coffee surface, square saucer, thin handle,
pixel texture, or limited palette.

Impact:

- The project lacks its first domain-specific visual anchor.

Recommendation:

- Implement Classic Expresso first as a deliberately tiny, readable,
  low-polygon object factory.
- Certify it at small scale before building the wider room.

### C8 - Catalog Mutations Do Not Push SSE Updates

Severity: medium.

`CatalogService.create()` persists a product and updates the catalog cache, but
it does not emit `DomainEventsService.emit()`. When SSE is connected, polling is
stopped, so a newly created product will not appear in the visualizer until an
unrelated emitting mutation happens or the user reconnects/reloads the scene.

Impact:

- Product shelf/display semantics may become stale during diagnostics or future
  product-management flows.
- The visualizer's live-data story is complete for cart/order mutations but not
  for every source included in `/visualization-data`.

Recommendation:

- If product creation remains part of the live visual scene, inject the domain
  event bus into `CatalogService` and emit after successful create.
- Add a smoke or unit check covering catalog mutation -> visualization update if
  the future implementation depends on live product creation.

### C9 - Browser Visual Certification Is Still Needed

Severity: medium.

This review is source-grounded. It did not start the full stack or certify
rendered pixels in a browser.

Impact:

- Current scene appearance, occlusion, sizing, and status readability still need
  browser verification before and after implementation.

Recommendation:

- Future implementation must verify desktop and mobile screenshots and canvas
  nonblank checks after visual changes.

## Foundations To Preserve

- BFF owns domain aggregation. The visualizer never reads PostgreSQL.
- The visualizer remains a standalone static app served by nginx.
- The web app embeds the visualizer through `/viz/index.html`.
- SSE is primary and polling is a fallback.
- The current clear/rebuild path disposes geometry and materials.
- The local fallback scene keeps the app inspectable when the BFF is down.
- Unit tests already enforce deterministic visualization DTO shape.
- The current primitive simplicity is a useful constraint; future work should
  add meaning, not heavy model pipelines.

## Implementation Readiness Decision

Do not ask Claude Code to "make the visualizer look better" from the current
repo guidance alone. That is too broad and would invite uncontrolled scene and
contract changes.

The project is ready for a bounded implementation pass only if the prompt:

- Names "Expresso Order Counter" as the immediate target.
- Starts with Classic Expresso as the first asset.
- Preserves the web/BFF/visualizer boundary.
- Requires a semantic contract decision before visual expansion.
- Caps or aggregates historical orders.
- Requires browser visual certification.
- Explicitly avoids realism, modern polished low-poly aesthetics, smooth
  assets, bevels, subdivisions, and dashboard-style UI.

Use `docs/next-steps/expresso-order-counter.md` as the implementation handoff.
