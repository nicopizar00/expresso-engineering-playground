# tests/performance/k6

Performance engineering layer for the mini-commerce playground, powered by
[k6](https://k6.io/).

This folder is the **integration point** for an existing k6-based
performance engineering project. The foundation lives here (folder
layout, env-driven target, Docker-based runner, a minimal smoke scenario,
and developer commands) so the existing project can be dropped in without
rewiring the playground.

## Why this folder lives inside the monorepo

For now, the performance suite is **vendored into the same repo** as the
application it targets. Reasons:

- Versioning the scenarios alongside the BFF avoids "tests targeted last
  week's API" drift while the endpoint surface is still evolving.
- A single `pnpm install` + `pnpm pg:dev` + `pnpm pg:perf:smoke` flow is
  the lowest-friction onboarding for new contributors.
- Pull requests touching both the BFF and its performance scenarios stay
  reviewable in one place.

Later iterations may promote this folder to one of:

1. **A reusable npm package** that consumers depend on by version.
2. **A published Docker image** with the scenarios baked in.
3. **A standalone repository** consumed via Git submodule / subtree.
4. **A GitHub reusable workflow** that wraps the runner.

None of that is needed yet. The folder layout below is structured so any
of those paths is a mechanical move, not a rewrite.

## Folder layout

```
tests/performance/k6/
├── .env.example          # BASE_URL, SCENARIO, K6_ENV, REPORT_OUTPUT
├── config/
│   ├── env.js            # BASE_URL helper used by every scenario
│   └── thresholds.js     # shared SLO-aligned thresholds
├── data/                 # static fixtures (e.g. product ids)
├── docs/                 # runbooks, SLO notes, scenario specs
├── reports/              # generated artifacts — gitignored
└── scenarios/
    ├── smoke/smoke.js    # minimal happy-path validation
    ├── load/             # nominal load — populated on import
    └── stress/           # beyond-nominal — populated on import
```

## How `BASE_URL` is configured

Every scenario reads its target from a single environment variable so
local, CI, and remote runs all share the same code.

| Caller                      | Default                                 |
| --------------------------- | --------------------------------------- |
| `pnpm pg:perf:smoke`        | `http://host.docker.internal:3001`      |
| Direct `docker compose run` | `http://host.docker.internal:3001`      |
| k6 binary on the host       | `http://localhost:3001`                 |

Override on the command line for any environment, e.g.:

```bash
BASE_URL=https://perf.example.test pnpm pg:perf:smoke
```

`config/env.js` is the only place this variable is read by scenarios —
new scripts should import `url()` from there rather than recompose URLs.

## How to run the smoke test locally

Prerequisite: the BFF must be running on `:3001`.

```bash
# Terminal 1 — start the BFF and web app
pnpm pg:dev

# Terminal 2 — run the smoke profile (uses Docker, no local k6 install)
pnpm pg:perf:smoke
```

What the command does:

1. Spawns the `grafana/k6:latest` container via
   `infra/docker/compose.performance.yaml`.
2. Mounts this folder into `/scripts`.
3. Resolves `BASE_URL` to `http://host.docker.internal:3001` so the
   container reaches the host BFF.
4. Runs `scenarios/smoke/smoke.js` and writes a JSON summary into
   `reports/smoke-summary.json`.

After the run:

```bash
pnpm pg:perf:open-report   # show generated report paths
pnpm pg:perf:clean         # wipe everything under reports/
```

### Alternative: run k6 directly on the host

Useful when iterating on a single scenario and Docker overhead is
noticeable.

```bash
brew install k6   # or: choco install k6 / apt install k6
BASE_URL=http://localhost:3001 \
  k6 run tests/performance/k6/scenarios/smoke/smoke.js
```

The Docker path is the default in this repo because it avoids a host
install and produces identical results across machines and CI.

## Where scenarios, data, and reports live

- **Scenarios**: `scenarios/<profile>/<name>.js`. One file per scenario
  keeps Docker `run` commands trivial and keeps profiles independently
  versioned.
- **Test data**: `data/*.json`. Today only the static catalog product
  ids — anything generated belongs in `reports/`, not here.
- **Reports**: `reports/`. Gitignored except for `.gitkeep`. The wrapper
  command writes `smoke-summary.json` here; the imported k6 project may
  add HTML, JUnit, or OTLP outputs.

## How to import an existing k6 project

Two supported paths. The choice can be revisited via ADR but does not
change the contract with the rest of the playground (folder layout,
`BASE_URL`, report location).

### Option A — Vendored copy (recommended for first import)

The simplest path. Loses upstream history but keeps the playground
self-contained.

```bash
# From the source perf repo:
#   1. Copy scenarios, scripts, helpers, and config into the matching
#      sub-folders of tests/performance/k6/.
#   2. Adapt imports so scenarios read BASE_URL from config/env.js.
#   3. Replace ad-hoc thresholds with imports from config/thresholds.js.
#   4. Run `pnpm pg:perf:smoke` to confirm parity with the placeholder.
```

Pros: zero coupling, fastest review. Cons: drift if upstream changes.

### Option B — `git subtree` (recommended once the source repo is stable)

Preserves upstream history while keeping a single working tree. The
playground stays cloneable in one step.

```bash
# One-time setup (placeholder URL — replace with the real source repo):
git remote add perf-origin <https://github.com/nicopizar00/k6-ts-docker.git>
git fetch perf-origin
git subtree add --prefix tests/performance/k6 perf-origin main --squash

# Periodic pulls of upstream changes:
git subtree pull --prefix tests/performance/k6 perf-origin main --squash

# Pushing changes back to upstream (if desired):
git subtree push --prefix tests/performance/k6 perf-origin main
```

**Do not run these commands blindly.** Confirm the source repo URL and
default branch before adding the remote; an incorrect URL is harmless
to revert but pollutes the local git config.

> The first import is expected to delete the placeholder scenario in
> `scenarios/smoke/smoke.js` and replace it with the real one. Keep the
> `config/` and `data/` helpers — those are playground-side glue.

## How this evolves

Once the import lands and a few real runs are in CI, the natural next
steps are:

1. **CI smoke job** — a workflow that boots the BFF in a service
   container and runs `pnpm pg:perf:smoke` on every PR.
2. **Nightly load + stress profiles** — separate workflows reading
   `K6_ENV` so dashboards split CI runs from local runs.
3. **OTLP export** — route k6 metrics into the existing OpenTelemetry
   collector under `infra/observability/` so traces from a run can be
   correlated with the latency it observed.
4. **Reusable workflow / package** — promote the runner once a second
   playground or service needs the same plumbing.

Each step is small and independent. None of them require restructuring
this folder.
