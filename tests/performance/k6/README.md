# tests/performance/k6

Performance engineering layer for the mini-commerce playground, powered by
[k6](https://k6.io/).

**Status:** integrated scenario library with runnable smoke, checkout-flow,
and read-heavy profiles.

This folder is the performance testing boundary for the application. It
contains environment-driven scenarios, shared thresholds, Docker-based
runners, and reporting artifacts while keeping the application services
independent of load-generation code.

## Why this folder lives inside the monorepo

The performance suite is kept **in the same repo** as the application it
targets. Reasons:

- Versioning the scenarios alongside the BFF avoids "tests targeted last
  week's API" drift while the endpoint surface is still evolving.
- A single `pnpm install` + `pnpm pg:dev` + `pnpm pg:perf:smoke` flow is
  the lowest-friction onboarding for new contributors.
- Pull requests touching both the BFF and its performance scenarios stay
  reviewable in one place.

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
    ├── smoke/smoke.js                 # minimal happy-path validation
    ├── checkout-flow/checkout-flow.js # write-path validation
    ├── read-heavy/read-heavy.js       # read baseline scenario
    ├── load/                          # future nominal-load refinement
    └── stress/                        # future beyond-nominal refinement
```

## How `BASE_URL` is configured

Every scenario reads its target from a single environment variable so
local, CI, and remote runs all share the same code.

| Caller                      | Default                                 |
| --------------------------- | --------------------------------------- |
| `pnpm pg:perf:*`            | `http://host.docker.internal:3001`      |
| Direct `docker compose run` | `http://host.docker.internal:3001`      |
| k6 binary on the host       | `http://localhost:3001`                 |

Override on the command line for any environment, e.g.:

```bash
BASE_URL=https://perf.example.test pnpm pg:perf:smoke
```

`config/env.js` is the only place this variable is read by scenarios —
new scripts should import `url()` from there rather than recompose URLs.

## How to run scenarios locally

Prerequisite: the BFF must be running on `:3001`.

```bash
# Terminal 1 — start the BFF and web app
pnpm pg:dev

# Terminal 2 — run the smoke profile (uses Docker, no local k6 install)
pnpm pg:perf:smoke
pnpm pg:perf:checkout-flow
pnpm pg:perf:read-heavy
```

What the command does:

1. Spawns the `grafana/k6:latest` container via
   `infra/docker/compose.performance.yaml`.
2. Mounts this folder into `/scripts`.
3. Resolves `BASE_URL` to `http://host.docker.internal:3001` so the
   container reaches the host BFF.
4. Runs the selected scenario and writes generated reports under `reports/`.

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

## Upstream relationship

The scenario library was adopted from `nicopizar00/k6-ts-docker` using the
git subtree strategy recorded in ADR-0003. Keep changes under this prefix
compatible with an intentional subtree synchronization; do not casually
replace its history with a vendored copy.

## How this evolves

Natural next steps are:

1. **Nightly load + stress profiles** — separate workflows reading
   `K6_ENV` so dashboards split CI runs from local runs.
2. **Queryable OTLP export** — route k6 metrics beyond the collector debug
   exporter into a backend under `infra/observability/` so traces from a run
   can be correlated with the latency it observed.
3. **Reusable workflow / package** — promote the runner once a second
   playground or service needs the same plumbing.

Each step is small and independent. None of them require restructuring
this folder.

## .subtree-marker

Records the git subtree configuration for tooling and reviewers.

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| `prefix`     | `tests/performance/k6`                            |
| `remote-url` | `https://github.com/nicopizar00/k6-ts-docker.git` |
| `ref`        | `main`                                            |

To pull upstream changes once the subtree is imported:

```bash
git subtree pull --prefix tests/performance/k6 perf-origin main --squash
```
