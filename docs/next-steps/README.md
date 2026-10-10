# Next Steps

Open threads of work. Each file is self-contained: a future session can read
one and pick up the thread. Source anchors are `TODO(next-steps/<topic>)`
comments; a topic is done when its anchors are gone:

```bash
git grep -n "TODO(next-steps/"
```

## Open threads (priority order)

1. **[UAT remediation](uat-remediation.md)** — code blockers fixed; a manual
   browser walkthrough (nav, cart drawer, Demo Mode, `/dev` cards) remains.
2. **[Expresso Order Counter](expresso-order-counter.md)** — evolve the
   visualizer into a coffee-shop order-counter scene with semantic data,
   recent-order focus, and aggregate history.
3. **[Order Temperature](order-temperature.md)** — hot/cold shipped in BFF,
   web, smoke, and k6; remaining: hot vs cold cups in the visualizer.
4. **[Login and Order Ownership](login.md)** — core shipped 2026-10-05;
   remaining: rate limiting, CSRF token, profile edit / password reset,
   session sweep, authenticated k6 scenarios.
5. **[Hot Coffee Banner](hot-status.md)** — polled banner shipped 2026-10-05;
   SSE push is a follow-up.
6. **[Observability follow-ups](observability-grafana.md)** — Loki, BFF
   metrics reader, alert rules.

## Done

| Iteration                                    | Record                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| PS1 Espresso Cup, fixed camera (2026-10-10)  | [ps1-espresso-cup.md](ps1-espresso-cup.md)                                       |
| Sizing time-based targets (2026-10-09)       | [sizing-duration-targets.md](sizing-duration-targets.md)                         |
| Simplify orders (2026-10-05)                 | [simplify-orders.md](simplify-orders.md)                                         |
| Geometry DB params (`AssetConfig`)           | [geometry-db-params.md](geometry-db-params.md)                                   |
| Visualizer reactivity (SSE + polling)        | [visualizer-reactivity.md](visualizer-reactivity.md)                             |
| Observability minimum (Tempo/Prom/Grafana)   | [../architecture/observability.md](../architecture/observability.md)             |
| Python orchestrator (`./dev`, `pg hack`)     | [../architecture/orchestrator-python.md](../architecture/orchestrator-python.md) |
| Unified web entry point (`/api/bff`, `/viz`) | [../architecture/web-entry-point.md](../architecture/web-entry-point.md)         |
| k6 workflows (`./dev perf:*`)                | [../performance/orchestrator.md](../performance/orchestrator.md)                 |
| OpenTelemetry SDK, orders persistence        | [../architecture/bff-modules.md](../architecture/bff-modules.md)                 |
