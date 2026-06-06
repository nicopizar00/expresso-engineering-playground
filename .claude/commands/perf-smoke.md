---
description: Run the k6 smoke scenario through Docker against the local BFF and summarize the result.
---

# /perf-smoke

Use this when the user asks you to "run perf smoke", "smoke the perf
scenarios", or to validate the BFF after a change to the orchestrator or to
a hot endpoint.

## Prerequisites (verify before running)

1. The BFF is up on `:3001`. Check with:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/health
   ```
   If not `200`, ask the user whether to bring it up with `./dev up` first.
2. Docker is running. Check with `docker info` quietly. If not, ask the
   user to start it.

## Run

```bash
./dev perf:smoke
```

The orchestrator (`scripts/pg/perf.py`) will:

- Resolve `BASE_URL` to `http://host.docker.internal:3001` by default.
- Spawn `grafana/k6:0.54.0` via `infra/docker/compose.performance.yaml`.
- Mount `tests/performance/k6/` into the container at `/scripts`.
- Run `scenarios/smoke/smoke.js` and write
  `tests/performance/k6/reports/smoke-summary.json`.

## Reporting

After the command exits, read `tests/performance/k6/reports/smoke-summary.json`
and report:

- Exit code.
- Total requests, error rate, p(95) and p(99) `http_req_duration`.
- Whether all defined thresholds passed.
- The summary file path.

If thresholds failed, surface the failing metric name(s) and the bound.
Do not propose threshold changes here — escalate to the
`expresso-k6-review` skill instead.

## Don'ts

- Do not run `./dev perf:checkout-flow` or `./dev perf:read-heavy` unless
  the user asks; smoke is the default.
- Do not `./dev perf:clean` automatically; reports are intentionally kept
  for diffing.
- Do not install k6 on the host as a fallback. If Docker is unavailable,
  stop and tell the user.
