# Sizing: DURATION shapes for ITERATIONS-only targets

Status: open.
Spec: `vendor/punch/docs/specs/spec-target-data-sizing.md`

## Problem

Punch sizes a producer for a target from the target's load shape.
`http-orders` and `http-orders-status` forward `VUS` and `ITERATIONS` only:
their scenarios read a fixed pool, one row per iteration, with a
`shared-iterations` executor. A `VUS` + `DURATION` preset such as
`options/5-vu-5m.json` is therefore "not estimable" for them.

## Proposal

With sizing, a time-based soak over a sized pool no longer wraps. Give both
scenarios the same `ITERATIONS`-or-`DURATION` switch the other HTTP
scenarios use (`constant-vus` for `DURATION`), forward `DURATION` in both
workflow YAMLs, and drop the two `TODO(next-steps/sizing-duration-targets)`
anchors.

## Done when

`VUS=5 DURATION=5m punch run …/http-cart.yaml --size-for http-orders` sizes
without error, and a following `VUS=5 DURATION=5m` `http-orders` run passes
without reusing a cart.
