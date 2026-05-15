# visualizer-3d

A controlled, lightweight 3D visualization module for the mini-commerce
engineering playground. First iteration — Hello Room.

## What this is

A standalone static frontend that renders a minimal Three.js scene (a white
3D room with placeholder objects) and consumes domain-shaped data through
the BFF's HTTP contract. It exists to give the playground a visual surface
that can later display real catalog / orders / performance data without
ever touching the database directly.

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

The visualizer consumes `GET /visualization-data` on the BFF, defined in
[`apps/bff/src/modules/visualization`](../bff/src/modules/visualization).
Today the BFF returns a small deterministic mock set; later it will
aggregate from real domain modules (catalog, orders) behind the same DTO:

```ts
interface VisualizationItem {
  id: string;
  label: string;
  type: 'cube' | 'sphere' | 'marker';
  value: number;
  status: 'ok' | 'warn' | 'error' | 'idle';
  positionHint: { x: number; y: number; z: number };
  metadata: Record<string, string | number>;
}
```

If the BFF is unreachable, `scene.js` falls back to two inline mock items
so the room is still rendered — the network failure is visible in the
header status pill (`offline · N mock items`).

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

- Real data: replace the mock service with aggregations from
  `catalog` / `orders` / k6 metrics.
- Optional richer geometry (still primitives — no model loaders).
- A small legend / inspector panel.
- Wire the visualizer into the `web` Next.js app as an embedded route, once
  embedding makes more product sense than the standalone container.
- A read-heavy k6 load / stress profile for `/visualization-data`. Smoke
  coverage already hits the endpoint via
  `tests/performance/k6/scenarios/smoke/smoke.js`.

## Future v0.app track (placeholder)

A separate, parallel design track may use [v0.app](https://v0.app) to
explore the visual design, layout, interaction concepts, control panels,
legends, and UI polish for the 3D visualization. **That track is
explicitly out of scope here.**

> Future v0.app track: use v0.app only for visual exploration, interaction
> ideas, UI layout, control panels, legends, and design language. Do not
> use v0.app output as the source of truth for architecture, data
> contracts, Docker setup, performance strategy, or service ownership.

Anything generated through v0.app must be adapted into this module by
hand and must continue to satisfy the constraints in this README (no
heavy engines, no DB access, DTO-driven, Docker-first).
