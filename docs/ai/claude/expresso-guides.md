# Expresso Project Guides

Project-specific reference material formerly stored as Claude skills. These
guides describe the repository's architecture, review boundaries, and
validation expectations; they are documentation, not invokable workflows.

## Repository orientation

For a cold session, read `CLAUDE.md`, `docs/ai/claude/playbook.md`, the
relevant architecture spoke, `docs/next-steps/README.md`, and
`docs/cli-reference.md`.

Current project context: Phase 2 covers Prisma/Postgres orders, OTel, the
Python orchestrator, observability, SSE, the 3D visualizer, and performance
scenarios. Phase 3 plans service extraction. The active visualizer direction
is the Expresso Order Counter, with the Classic Espresso cup as its first
domain asset.

Choose the boundary by task:

- BFF: `apps/bff/src/modules/<domain>/`; validate with `./dev smoke`.
- Web: `apps/web/`; it is the browser-facing entry point and proxy.
- Visualizer: `apps/visualizer-3d/public/`; keep scene, transport, layout,
  geometry, objects, materials, and fallback concerns in their owning modules.
- Orchestrator: `scripts/pg/` and the `./dev` / `pnpm pg:*` / `task` paths.
- Performance: `tests/performance/k6/`, `scripts/pg/perf.py`, and
  `infra/docker/compose.performance.yaml`.
- Observability: `infra/observability/` and the `obs` profile.

## Performance orchestrator

The path is `./dev perf:<scenario>` → `python3 -m pg` →
`scripts/pg/perf.py` → Docker Compose k6 → reports in
`tests/performance/k6/reports/`. k6 runs in Docker, Python owns orchestration,
the performance Compose file remains separate, `BASE_URL` is the single target
knob, reports have stable scenario names, and scenarios contain no secrets or
real user data.

For a new scenario, add the scenario file, a Python entry point reusing
`_run_scenario`, CLI registration, expected package/task pass-throughs, and
documentation. Import `url()` and named thresholds. Threshold changes need
empirical evidence and documentation. Compose changes preserve k6/k6-otel
symmetry and network/host-gateway behavior. Run `pnpm pg:test` after changing
the orchestrator.

Do not add a second k6 entry path, host dependencies, speculative CI wiring, or
environment-specific URLs and credentials. Report changed files, the command,
unit-test evidence, a real run and its summary path, and any new documentation
anchors.

## k6 review reference

Scenarios must use `url()` from `config/env.js`, named thresholds from
`config/thresholds.js`, explicit bounded VU/duration settings, and checks whose
failures are threshold-gated. Inputs come from static fixtures or environment;
write paths capture the BFF-returned `orderId`; scenarios must not depend on
un-guaranteed ordering or random data.

Summary names must match `scripts/pg/perf.py`, logging must not drown reports,
and imports must stay inside `tests/performance/k6/`. Do not invent thresholds
without a real run. Findings should identify severity, file/line, violated
rule, and smallest fix, with a green/yellow/red merge verdict.

## Docker Compose review reference

Read the containers, observability, and web-entry-point architecture docs
before reviewing Compose. Every service belongs to exactly one of `core`,
`web`, `viz`, `admin`, or `obs`, or to the performance Compose file. Preserve
the expected `./dev up [target]` and `pnpm pg:up [target]` behavior and update
the profile/port table when it changes.

Check published ports, `.env` defaults, Linux `host.docker.internal` via
`extra_hosts`, repo-relative mounts, named Postgres volume safety, ignored
generated artifacts, external-network usage, and the rule that web remains the
single browser-facing service. Postgres must not be newly exposed beyond
`:5432`. Reject `network_mode: host`, unexplained top-level Compose files, and
host-tool build requirements. Validate with `./dev doctor` and the affected
`./dev up` target when possible.

## Visualizer review reference

The visualizer follows the PS1 art direction and Expresso Order Counter scene.
Use `materials.js` for palette and status colors, `geometry/frustum.js` for
frustum primitives, `objects/` for meshes/assets, `layout/render.js` for
placement/animation, `transport.js` for SSE and polling, `fallback.js` for
offline mode, and `scene.js` only for bootstrap/factory wiring.

Flag as blockers: network code outside `transport.js`, mesh construction in
transport or scene, new hex literals outside `materials.js`, asset config
outside its asset module, or scene.js absorbing render/transport logic.

Domain assets use palette constants, flat-shaded Lambert materials, nearest
filtered 16×16 or 32×32 textures, simple frustum geometry, and documented
polygon budgets. Avoid spheres, chamfers, bevels, booleans, and extrusions.
The scene reads only the visualization endpoints, preserves the typed `scene`
shape, covers new objects in `FALLBACK_SCENE`, disposes geometry/textures,
aggregates historical orders, and remains readable at icon scale from four
angles. Confirm the SSE repaint after relevant mutations.

## Validation audit

Use the narrowest applicable validation row:

| Change | Required validation |
|---|---|
| One file, no public API | `pnpm --filter <pkg> test` |
| Cross-package or new public API | `pnpm typecheck` + `pnpm test` |
| BFF endpoint/shape | Also `./dev smoke` |
| Compose or `scripts/pg/` | Also `pnpm pg:test` + `./dev doctor` |
| UI | Open the page and perform the interaction |
| Performance/orchestrator | Affected `./dev perf:<name>` + `pnpm pg:test` |
| CI | `pnpm lint` + `pnpm format` + impacted job locally |

Record exit codes, one-line summaries, artifact paths, screenshots/browser
checks, and skipped checks with reasons. For performance, compare key metrics
with the previous summary and flag regressions. Do not infer success from
types or claim CI will catch a skipped local gate.

## Documentation audit

Architecture docs under `docs/architecture/` are canonical spokes. Other docs
link to them rather than duplicating their rules. Keep changed facts mirrored
in the relevant spoke; update or close matching `docs/next-steps/` threads and
remove their `TODO(next-steps/<topic>)` anchors. Check English-only content,
links, Mermaid fences, fictional data, and the no-AI-attribution rule.

Do not create speculative top-level roadmap docs or weaken strict invariants.
