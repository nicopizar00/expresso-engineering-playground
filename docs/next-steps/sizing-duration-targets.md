# Sizing: time-based shapes for iteration-only targets

Status: resolved in code 2026-10-09 by native `k6 run --config`; the live
check under "Done when" has not been run yet.
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
