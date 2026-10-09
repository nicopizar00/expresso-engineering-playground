# Sizing: time-based shapes for iteration-only targets

Status: done 2026-10-09 — resolved by native `k6 run --config`, live check
passed (see "Evidence").
Spec: `vendor/punch/docs/specs/spec-target-data-sizing.md`

## Problem

Punch sizes a producer for a target from the target's load shape.
`http-orders` and `http-orders-status` used to forward `VUS` and `ITERATIONS`
only: their scenarios read a fixed pool, one row per iteration, with a
hard-coded `shared-iterations` executor. A `VUS` + `DURATION` preset such as
`options/5-vu-5m.json` was therefore "not estimable" for them.

## Resolution

The load shape moved out of the scripts and the environment into native k6
options JSON (`spec.k6.config`, `options/*.json`, `./dev perf:<id> --config`).
Every scenario now exports only `thresholds` and `tags`, so any of them runs
under a `constant-vus` config, and Punch sizes a target from the config's
scenario: `vus` × `duration` / the target's `iterationSeconds`. Both
`TODO(next-steps/sizing-duration-targets)` anchors are gone.

## Done when

```bash
PYTHONPATH=vendor/punch/src python3 -m punch run \
  tests/performance/k6/workflows/http-cart.yaml --size-for http-orders \
  --config tests/performance/k6/options/5-vu-5m.json
./dev perf:http-orders --config 5-vu-5m
```

sizes without error, and the following `http-orders` run passes without
reusing a cart.

## Evidence (2026-10-09, local stack)

- Sizing: `rows needed : 1364 (constant-vus vus=5 duration=5m)`,
  `margin 15% : 1569 producer iterations`, `producer VUS : 7 (~247s of 270s
  budget)`.
- `http-cart` (sized): 1569 iterations, checks 100%, `http_req_failed` 0%;
  `carts` ready with 1569 rows, no duplicate `cartId`.
- `http-orders --config 5-vu-5m`: 5 looping VUs for 5m, 1425 iterations
  (≤ 1569 rows, so no cart was reused), checks 100% (8550),
  `http_req_failed` 0%, p(95) 40.64 ms.
- Observed pace was ~1.05 s per iteration against the measured 1.1 s, so the
  target ran 4.5% more iterations than the 1364-row estimate; the 15% margin
  absorbed it.
