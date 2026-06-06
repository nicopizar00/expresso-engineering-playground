---
name: expresso-k6-review
description: Use to review k6 scenarios, thresholds, data usage, and report shape under tests/performance/k6/. Validates that scenarios are deterministic, threshold-gated, share the BASE_URL contract, and produce diffable summaries.
---

# Expresso — k6 Review

## When to use

- Before merging a change that adds or modifies a scenario, threshold,
  fixture, or `config/env.js`.
- When triaging a flaky perf run.
- When promoting a scenario from local-only to a documented profile.

## Read first

- `tests/performance/k6/README.md` — scenario library contract.
- `tests/performance/k6/config/env.js` — `BASE_URL` resolution.
- `tests/performance/k6/config/thresholds.js` — named threshold sets.
- `tests/performance/k6/data/` — static fixtures (e.g. product IDs).
- The scenario(s) under review in
  `tests/performance/k6/scenarios/<profile>/<name>.js`.
- `docs/performance/orchestrator.md` — invariants the runner enforces.

## Review checklist

### Scenario shape
- [ ] Uses `url()` from `config/env.js`; never reconstructs `BASE_URL`.
- [ ] Imports thresholds by name from `config/thresholds.js`. If unique to
      this scenario, the named set is defined in `thresholds.js`, not inlined.
- [ ] `options.scenarios` (or top-level `options`) makes the VUs / duration /
      ramp explicit and bounded; no open-ended `duration: '24h'`.
- [ ] `checks` cover every status assertion that matters; failure of a `check`
      is gated by a threshold.

### Determinism
- [ ] Inputs come from `data/*.json` or environment, not random seeds without
      a fixed value.
- [ ] No reliance on a single ordering of products / orders / IDs that the
      seed does not guarantee.
- [ ] Write-path scenarios (`checkout-flow`) capture the BFF-returned
      `orderId` rather than synthesizing one.

### Reporting
- [ ] Summary file name matches what `scripts/pg/perf.py` writes
      (e.g. `smoke-summary.json`, `checkout-flow-summary.json`).
- [ ] No `console.log` floods that drown the summary output.

### Boundary hygiene
- [ ] No secrets, real customer names, real URLs, or real IPs.
- [ ] No host-only assumptions (e.g. paths that only exist on the host).
- [ ] Does not import outside `tests/performance/k6/` (k6 cannot resolve
      monorepo paths).

## Output

A compact review note with:

- Severity-tagged findings (`blocker`, `should-fix`, `nit`).
- For each finding: the file and line, the rule it violates, and the smallest
  diff that fixes it.
- A green/yellow/red verdict on whether the scenario is safe to merge.

## Don'ts

- Do not propose new thresholds without empirical justification from a real
  run — quote the metric and the run that grounds the number.
- Do not rewrite the scenario into a different shape if the existing one is
  correct; surface the smallest fix.
- Do not require CI gating for a scenario that is not currently CI-gated;
  leave that decision to the design doc.
