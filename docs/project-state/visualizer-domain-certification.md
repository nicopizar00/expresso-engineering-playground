# Visualizer Domain Certification

Snapshot date: 2026-05-31. Refreshed 2026-06-07 — EOC-2 shipped, so finding
C8 (catalog mutations do not push SSE updates) is now resolved; the
`Live update path` row in the certification matrix is upgraded to Pass.

Update note: since the first version of this report, a WIP Classic Espresso
showcase has appeared in `apps/visualizer-3d/public/scene.js` and
`docs/next-steps/ps1-espresso-cup.md`. The asset is no longer absent, but it is
still not artistically certified.

This report reviews the current 3D visualizer, visualization data path, order
persistence path, and AI guidance files against the desired "Expresso Order
Counter" direction. It is an analysis and planning artifact only. It does not
implement product features, scene changes, assets, backend behavior, or database
changes.

## Verdict

The visualizer has a solid technical foundation, but it is not yet certified as
a meaningful coffee-shop commerce visualization.

Technical foundation: conditional pass.

Domain and art direction: partial, pending browser certification.

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
- `docs/project-state/current-system.md`
- `docs/next-steps/visualizer-reactivity.md`
- `docs/next-steps/uat-remediation.md`
- `apps/visualizer-3d/README.md`
- root `README.md`

Ignored source-like duplicates:

- `.claude/worktrees/**` appears to contain ignored Claude worktree copies. It
  is not treated as canonical project guidance.

## Certification Matrix

| Area                            | Status  | Evidence                                                                                                                                                        |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BFF ownership boundary          | Pass    | Visualizer consumes BFF endpoints and does not read PostgreSQL directly.                                                                                        |
| Persisted orders path           | Pass    | `OrdersService` loads and mutates PostgreSQL rows through Prisma, then serves a warm cache.                                                                     |
| Live update path                | Pass    | `GET /visualization-updates` uses SSE for cart, checkout, order, and catalog events. EOC-2 wired `CatalogService.create()` into `DomainEventsService.changed$`. |
| Current visual domain alignment | Partial | A WIP Classic Espresso cup builder exists, but the full scene is not yet an Expresso Order Counter.                                                             |
| Data meaning                    | Partial | Metadata contains product, order, and cart facts, but the top-level DTO is still primitive-rendering shaped.                                                    |
| Scene semantics                 | Fail    | Recent orders, historical orders, product composition, pickup/completed states, and coffee-shop areas are not visually distinguishable.                         |
| Three.js architecture           | Partial | Transport and clear/rebuild behavior are simple and maintainable, but scene, fetch, mapping, geometry factories, and animation live in one file.                |
| Retro PS1 art direction         | Partial | The WIP cup uses pixel textures and flat Lambert materials, but browser approval is still pending and non-cup scene elements remain generic.                    |
| Performance scaling             | Partial | SSE avoids stale UI, but every persisted order becomes a permanent rendered item. No recency window or aggregate summary exists.                                |
| AI governance readiness         | Partial | Boundaries are strong, but several guidance files are stale or completed prompts rather than current implementation direction.                                  |

## Current Implementation State

Implemented:

- `GET /visualization-data` returns products, orders, and cart as
  `VisualizationItem[]`.
- `GET /visualization-updates` streams the same snapshot shape through SSE.
- `scene.js` contains a WIP Classic Espresso cup builder for drink-category
  items and an offline fallback showcase item.
- Cart add/update/remove, checkout, order management, and catalog product
  creation all emit domain-change signals on `DomainEventsService.changed$`.
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

Missing or not yet certified:

- Classic Expresso/Espresso artistic approval in the real BFF-driven scene.
- Any room/counter/product shelf/pickup-area/coffee-machine semantics.
- A recency model for visual orders.
- Aggregate objects for historical orders.
- A semantic contract for recent orders, completed orders, product composition,
  and future performance signals.
- A modular Three.js structure for assets, scene layout, data interpretation,
  object factories, animation, and transport.
- Browser pixel certification for the current visual appearance.

## Key Findings

### C1 - The Scene Has a WIP Cup, But Is Not Yet an Order Counter

Severity: high.

`scene.js` now describes a "Classic Espresso showcase" and builds a low-poly
cup for drink-category items. However, `index.html` still says "Hello Room" and
"placeholder objects", and non-drink products/orders/cart still fall back to
generic primitives. The scene is not yet a counter, shelf, pickup area, or
coffee-shop world.

Impact:

- The project now has a candidate visual anchor, but a user still cannot
  understand the commerce system by looking at the full scene.
- The current result remains short of the requested Expresso Order Counter
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

### C5 - PS1 Art Direction Exists Only on the WIP Cup

Severity: high.

The WIP cup uses pixel textures, `NearestFilter`, and flat Lambert materials.
The surrounding room and generic fallback objects still use technical-demo
choices such as antialiasing, `MeshStandardMaterial`, smooth spheres/cones, a
white room, a soft grid, and generic status colors.

Impact:

- The cup may pass PS1-style review after browser certification, but the wider
  scene still reads as a technical showcase rather than a rough mid-90s arcade
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
- `docs/ai/codex/current-findings.md` still carries old UAT blockers that
  appear to be superseded by `docs/next-steps/uat-remediation.md`.

Correction made in this pass:

- `docs/next-steps/README.md` now points to
  `docs/next-steps/expresso-order-counter.md` and describes visualizer
  reactivity as SSE-primary with polling fallback.
- `docs/ai/codex/artistic-certification-prompt.md` and the repo-local
  `visualizer-artistic-certification` skill now capture the Codex-side
  certification workflow.

Recommendation:

- Treat stale files as documentation debt before asking Claude Code for a visual
  implementation pass.
- Use `docs/next-steps/expresso-order-counter.md` as the current handoff source.

### C7 - Classic Expresso/Espresso Is WIP, Not Certified

Severity: high.

`scene.js` now contains a WIP Classic Espresso cup builder and fallback item,
and `docs/next-steps/ps1-espresso-cup.md` records the asset as beta. This is a
real implementation step, but not artistic approval.

Impact:

- The project now has a candidate business icon, but the visual standard is not
  yet proven on `http://localhost:3002` or through the web app at
  `http://localhost:3000/visualizer`.
- Source inspection suggests the offline fallback uses an off-white
  `metadata.color`, while real BFF product items may still derive drink cup
  color from status because `VisualizationService.fromProduct()` does not emit
  a ceramic color override.

Recommendation:

- Run browser certification against both standalone and proxied visualizer
  paths.
- Require the cup to pass the `ps1-espresso-cup.md` artistic approval checklist.
- Ensure the real BFF-driven scene preserves ceramic cup color rather than
  inventory-status green/amber/red as the base material.

### C8 - Catalog Mutations Do Not Push SSE Updates _(resolved by EOC-2)_

Severity: medium. **Status: resolved 2026-06-07.**

`CatalogService.create()` now emits `DomainEventsService.changed$` so new
products propagate through SSE immediately, with the existing polling fallback
unchanged. Kept in this report for traceability against earlier Codex review
sessions.

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
