# tests/performance/k6

Performance engineering layer for the mini-commerce playground, powered by
[k6](https://k6.io/).

**Status:** integrated scenario library with runnable smoke, checkout-flow,
read-heavy, and campaign profiles, authored in TypeScript and built with
esbuild inside the `k6` Docker image.

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
├── package.json           # esbuild + @types/k6, one build script per scenario
├── tsconfig.json
├── support/
│   └── report.ts         # re-exports vendor/punch/src/tests/support/report.ts
├── config/
│   ├── env.ts             # BASE_URL helper used by every scenario
│   └── thresholds.ts      # shared SLO-aligned thresholds
├── data/                 # static fixtures (e.g. product ids)
├── docs/                 # runbooks, SLO notes, scenario specs
├── reports/              # generated artifacts — gitignored
└── scenarios/
    ├── smoke/smoke.ts                 # minimal happy-path validation
    ├── checkout-flow/checkout-flow.ts # write-path validation
    ├── read-heavy/read-heavy.ts       # read baseline scenario
    ├── campaign/                      # workflow-traffic driven via campaign descriptor
    │   ├── campaign.ts, catalog-browse.ts, order-lookup.ts, purchase.ts
    │   └── report-event.ts            # fire-and-forget workflow-traffic emitter
    ├── load/load.js                   # pre-existing scaffold placeholder, not
    │                                   # wired to any ./dev perf:* command — see
    │                                   # "Known gap" below, not migrated by this
    │                                   # folder's TypeScript conversion
    └── stress/stress.js               # same as load/ above
```

`dist/` (esbuild's compiled output, consumed by the `k6` Docker image) and
`node_modules/` are gitignored and not part of the source tree above.

### Known gap: `load/` and `stress/` are unmigrated, broken placeholders

`scenarios/load/load.js` and `scenarios/stress/stress.js` predate this
folder's TypeScript migration and predate the git-subtree era (see
[ADR-0003](../../../docs/adr/0003-k6-project-strategy.md)). They were never
wired to a `./dev perf:*` command (`.env.example`
has always called them out as unpopulated `SCENARIO` slots), so this repo's
TypeScript conversion did not touch them — the plan explicitly scoped the
migration to the four wired entry points (`smoke`, `checkout-flow`,
`read-heavy`, `campaign`). They now import from `../../config/env.js` and
`../../config/thresholds.js`, which no longer exist (those became
`config/env.ts` / `config/thresholds.ts`), so **these two files no longer
run** even by hand — this is a pre-existing gap surfaced by, but not
introduced by, this migration. Cleaning them up (delete, or migrate to
TypeScript and wire a command) is unscoped follow-up work, not done here.

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

`config/env.ts` is the only place this variable is read by scenarios —
new scripts should import `url()` from there rather than recompose URLs.

## How to run scenarios locally

Prerequisites:

- The `vendor/punch/` submodule must be initialized (`git submodule update
  --init --recursive`) — the k6 image's build step imports its shared
  report helper from there.
- The BFF must be running on `:3001`.

```bash
# Terminal 1 — start the BFF and web app
pnpm pg:dev

# Terminal 2 — run the smoke profile (uses Docker, no local k6 install)
pnpm pg:perf:smoke
pnpm pg:perf:checkout-flow
pnpm pg:perf:read-heavy
pnpm pg:perf:campaign                                       # default descriptor
pnpm pg:perf:campaign tests/performance/k6/campaigns/morning-rush.json
```

What the command does:

1. Builds the `k6` image from `infra/docker/k6.Dockerfile` if it isn't
   already built or the scenario sources changed — a `node:lts-alpine`
   stage runs `npm ci` + an esbuild bundle of every `.ts` scenario entry
   point (importing both this folder's `config`/`support` and the `punch`
   submodule's shared report helper), then copies the compiled output into
   a `grafana/k6:0.54.0` image. Only the first perf run on a fresh
   checkout (or after a scenario/dependency change) pays this build cost —
   subsequent runs reuse the cached image, so this is a one-time-per-change
   delay, not a per-run one.
2. Spawns that image via `docker compose -f
   infra/docker/compose.performance.yaml run --rm k6`, mounting only
   `reports/` into the container (scenarios are baked into the image, not
   mounted).
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
noticeable. Since scenarios are now TypeScript, k6 can't run the source
files directly — bundle them with esbuild first, then point the host `k6`
binary at the compiled output:

```bash
brew install k6   # or: choco install k6 / apt install k6
cd tests/performance/k6 && npm install && npm run build
BASE_URL=http://localhost:3001 \
  k6 run dist/smoke/smoke.js
```

The Docker path is the default in this repo because it avoids a host
install (of both k6 and Node/esbuild) and produces identical results
across machines and CI.

## Where scenarios, data, and reports live

- **Scenarios**: `scenarios/<profile>/<name>.ts`. One file per scenario
  keeps Docker `run` commands trivial and keeps profiles independently
  versioned. `docker compose ... build k6` compiles every scenario with
  esbuild before the image can run any of them (see "How to run scenarios
  locally" above).
- **Test data**: `data/*.json`. Today only the static catalog product
  ids — anything generated belongs in `reports/`, not here.
- **Reports**: `reports/`. Gitignored except for `.gitkeep`. Each scenario's
  own `handleSummary` (using `support/report.ts`'s shared helpers) writes
  its `<scenario>-report.html` and `<scenario>-summary.json` here.

## Relationship to `punch`

This folder's scenarios are this repo's own — they target this repo's BFF
contract and are not shared with other consumers. They import shared
HTML/JSON reporting helpers from the `punch` submodule
(`vendor/punch/src/tests/support/report.ts`) via the local
`support/report.ts` re-export, instead of maintaining a separate copy of
that formatting logic. See
[`docs/specs/punch-submodule-integration.md`](../../../docs/specs/punch-submodule-integration.md).

## How this evolves

Natural next steps are:

1. **Migrate or retire `load/` and `stress/`** — the two pre-existing
   scaffold scenarios currently have broken imports (see "Known gap"
   above); either port them to TypeScript and wire a `./dev perf:*`
   command, or delete them.
2. **Queryable OTLP export** — route k6 metrics beyond the collector debug
   exporter into a backend under `infra/observability/` so traces from a run
   can be correlated with the latency it observed.
3. **Reusable workflow / package** — promote the runner once a second
   playground or service needs the same plumbing.

Each step is small and independent. None of them require restructuring
this folder.
