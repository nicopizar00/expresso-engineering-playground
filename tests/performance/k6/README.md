# tests/performance/k6

Performance engineering layer, powered by [k6](https://k6.io/).

This folder is the **integration point** for the existing k6-based
performance engineering solution. It is intentionally kept independent of
`apps/*` and `packages/*` so the k6 solution can evolve on its own cadence.

## Integration model

Two options are supported. The choice will be captured in an ADR:

1. **Vendored copy** — drop the existing solution's contents directly into
   this folder. Easiest to wire into CI; copies must be kept in sync manually.
2. **Git submodule** — point this folder at the existing k6 repository.
   Keeps history clean and updates with a single command.

Either way the contract with the rest of the playground stays the same:

- Test scripts live under `scripts/`.
- Scenarios live under `scenarios/` (smoke, load, stress, soak).
- All target URLs and tokens come from environment variables — **never**
  hardcoded and never committed.
- A `smoke` profile MUST complete in < 2 minutes, since CI runs it per-PR.

## Suggested layout (post-integration)

```
tests/performance/k6/
├── scripts/                # reusable k6 modules
├── scenarios/
│   ├── smoke.js            # short, low-load — runs in CI
│   ├── load.js             # nominal load — runs on schedule
│   ├── stress.js           # beyond-nominal — runs on demand
│   └── soak.js             # long-duration — runs on demand
├── thresholds/             # SLO-aligned k6 thresholds
└── reports/                # generated, gitignored
```

## CI hook

The root script `pnpm test:perf:smoke` is the entry point CI uses. Today it
is a placeholder; once the k6 solution is connected, it should invoke
`scenarios/smoke.js` against the ephemeral stack defined in
`infra/docker/compose.yaml`.

## Output and observability

k6 metrics should be exported in a format consumable by the
OpenTelemetry / Prometheus stack in `infra/observability` so that
performance runs can be correlated with traces and logs from the same window.
