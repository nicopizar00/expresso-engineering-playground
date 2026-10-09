# Performance Validation

Rules for capturing, comparing, and preserving evidence from k6 runs.

This document defines **what counts as evidence** for a perf-affecting
change, **where it lives**, and **how it is reviewed**. The orchestration
design itself is in [`orchestrator.md`](orchestrator.md).

## When validation evidence is required

| Change | Required evidence |
|---|---|
| New k6 scenario | Local run output of the new scenario, summary file. |
| Threshold change | Before/after summary diff for the affected scenario. |
| Hot BFF endpoint change (any endpoint exercised by smoke or read-heavy) | Smoke + the affected scenario summary. |
| Compose perf wiring change | Smoke run + confirmation `./dev doctor` is green. |
| Orchestrator change (`scripts/pg/perf.py`) | `pnpm pg:test` + a real smoke run. |
| Pure scenario refactor (no behaviour change) | Smoke + the refactored scenario summary; diff must be a no-op. |

## Where evidence lives

- **Summary JSON**: `tests/performance/k6/reports/<scenario>-summary.json`.
  Filename is stable per scenario so prior runs can be diffed.
- **Reports directory**: gitignored except `.gitkeep`. Evidence is local;
  the PR description quotes the relevant numbers.
- **PR description**: includes the metric values that the change was meant
  to affect or guard against. Example:

  > http-purchase after change: `http_req_duration p(95) = 38.1ms` (threshold 1000ms),
  > `http_req_failed = 0%`. Summary at
  > `tests/performance/k6/reports/http-purchase-summary.json`.

- **CI**: the `perf-smoke` job runs one `http-purchase` iteration
  (`./dev perf:http-purchase --config 1-iteration`); its thresholds fail the
  job. Gating any other scenario is an explicit, owner-approved follow-up, so
  for everything else local evidence is the gate.

## What "good" evidence looks like

A good evidence block contains, at minimum:

- The scenario name and exit code.
- Total requests, error rate.
- `http_req_duration` p(50), p(95), p(99).
- Threshold pass/fail state.
- The summary file path.
- For threshold or hot-endpoint changes, the **previous** values too.

Example, suitable to paste into a PR description:

```
Scenario: smoke
Exit:     0
Requests: 612
Errors:   0%
http_req_duration  p50=8ms   p95=38ms   p99=72ms
Thresholds: all passed
```

(The scenario's own `handleSummary` writes the report/summary files — the
orchestrator itself prints no "Summary:" line for any workflow. Note the
summary path separately, e.g.
`tests/performance/k6/reports/http-purchase-summary.json`.)

## Diffing across runs

Use `jq` for ad-hoc comparison. The orchestrator does not write a diff
report; that's intentional — comparison stays explicit.

```bash
jq '.metrics.http_req_duration.values' \
  tests/performance/k6/reports/http-purchase-summary.json

jq '{p95:.metrics.http_req_duration.values["p(95)"], failed:.metrics.http_req_failed.value}' \
  tests/performance/k6/reports/http-purchase-summary.json
```

If a regression appears (p(95) up by > 20% with no scenario change), treat
it as a `blocker` and investigate before merging.

## Reviewing evidence

Review the evidence against the bounds above and the scenario's declared
thresholds. For a substantial performance change, get an independent read
of the scenarios and thresholds before merging.

## Boundaries

- **No production targets.** Validation runs against the local BFF or a
  deliberately reachable BASE_URL the owner has approved. No production
  hostnames, IPs, or credentials in committed scenarios.
- **No personal data.** Fixtures use the seeded, fictional products and
  customer names only.
- **No silent skips.** If evidence couldn't be captured (Docker down,
  network blocked), state it explicitly in the PR and label the change
  `needs-follow-up`.

## Related

- [`orchestrator.md`](orchestrator.md) — design and invariants.
- [`../ai/claude/playbook.md#validation-matrix`](../ai/claude/playbook.md) —
  the broader validation matrix this fits into.
- [`../../tests/performance/k6/README.md`](../../tests/performance/k6/README.md) —
  scenario library.
