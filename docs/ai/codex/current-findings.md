# Current Codex Findings

Snapshot date: 2026-05-31. Refreshed 2026-06-07 (catalog SSE wiring shipped
under EOC-2; the previous "catalog mutations do not emit SSE" risk is
resolved).

Use this summary when framing Codex prompts, review scopes, or follow-up
implementation instructions.

## Current Verdict

The core commerce flow is no longer blocked by the old order-detail 500 issue.
`docs/next-steps/uat-remediation.md` records R1/R2/R3 as done, with only a
manual browser walkthrough remaining.

The active Codex concern is now visualizer artistic certification: proving that
the Three.js visualizer can show a minimum acceptable Classic Expresso/Espresso
business icon and that a web-app commerce action is visibly reflected in the 3D
scene.

## Top Certification Questions

1. Does `http://localhost:3002` show Classic Expresso/Espresso as an off-white
   ceramic, PS1-era, low-poly business icon at the default camera?
2. Does `http://localhost:3000/visualizer` show the same scene through the
   `/viz/index.html` proxy?
3. Does a minimal commerce action from the web app, such as add Espresso to
   cart, checkout, or order status management, create an understandable visual
   change in the 3D scene through SSE or fallback?
4. Does the real BFF-driven scene preserve the cup's ceramic color? Source
   inspection suggests offline fallback uses `metadata.color`, but BFF product
   items may still inherit status colors unless the visualization contract
   supplies a ceramic color override.

## Active Visualizer State

- `apps/visualizer-3d/public/scene.js` now contains a WIP Classic Espresso cup
  builder with PS1-style texture treatment.
- `docs/next-steps/ps1-espresso-cup.md` records the asset as WIP / beta and
  pending artistic approval.
- `docs/next-steps/expresso-order-counter.md` records the broader scene
  direction and keeps implementation assigned to Claude Code.
- `GET /visualization-updates` is SSE-primary with polling fallback.

## Open Risks

- Browser pixel certification is still required. Do not certify from source
  alone.
- The current visualizer can still become a product-row visualizer if every
  historical order remains a permanent object. EOC-2 mitigates this by capping
  `recentOrders` and emitting `orderAggregates`; richer aggregation
  (per-product, time buckets) is still open under EOC-6.
- Naming is inconsistent: project direction says Classic Expresso, while some
  implementation/docs say Classic Espresso. Treat this as a product-language
  decision for owner approval.

## Codex Role

Codex should continue as artistic certification and governance reviewer:

- Inspect and certify.
- Run browser checks when available.
- Write PASS / FAIL / DRIFT / SKIP reports.
- Prepare narrow Claude Code implementation prompts for failed gates.
- Do not implement the visualizer unless the owner explicitly changes scope.
