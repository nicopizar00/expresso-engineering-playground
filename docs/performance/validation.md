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

  > Smoke after change: `http_req_duration p(95) = 38.1ms` (threshold 200ms),
  > `http_req_failed = 0%`. Summary at
  > `tests/performance/k6/reports/smoke-summary.json`.

- **CI**: there is no perf-gating CI today. CI gating per scenario is an
  explicit, owner-approved follow-up. Until then, local evidence is the
  gate.

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
Summary:  tests/performance/k6/reports/smoke-summary.json
```

## Diffing across runs

Use `jq` for ad-hoc comparison. The orchestrator does not write a diff
report; that's intentional — comparison stays explicit.

```bash
jq '.metrics.http_req_duration.values' \
  tests/performance/k6/reports/smoke-summary.json

jq '{p95:.metrics.http_req_duration.values["p(95)"], failed:.metrics.http_req_failed.value}' \
  tests/performance/k6/reports/smoke-summary.json
```

If a regression appears (p(95) up by > 20% with no scenario change), treat
it as a `blocker` and investigate before merging.

## Reviewing evidence

The `expresso-validation-audit` skill formalises the review. The
`performance-engineering-reviewer` subagent gives an independent read of
the scenarios and thresholds. Either is appropriate before merging a
perf-affecting change; both is overkill for a one-line edit.

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
