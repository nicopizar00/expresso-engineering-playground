# Observability — open follow-ups

> The Tempo + Prometheus + Grafana minimum is **shipped**. Current-state
> topology lives in
> [`../architecture/observability.md`](../architecture/observability.md). This
> file tracks only what is *not yet* in.

## Open threads

1. **Loki + structured BFF logs.** The logs pipeline still uses the `debug`
   exporter (stdout). The BFF logger writes pino-style lines; a Loki container
   + filelog receiver in the collector is the minimum next step.
2. **BFF metrics reader.** The OTel SDK in `apps/bff/src/common/telemetry.ts`
   only configures a trace exporter. Add a `metricReader` so the BFF panels in
   the `BFF Overview` dashboard show actual numbers (today they only populate
   from k6 runs).
3. **Alerting.** No Prometheus alert rules yet. Reasonable first cuts:
   - 5xx rate on any route (window: 5 min)
   - p95 latency on `POST /checkout`
   - SSE consumer drop rate on `/visualization-updates`
4. **OpenSearch / OpenTelemetry-native APM.** Out of scope until logs land.
5. **Trace-to-log and trace-to-profiles correlation.** Both Loki and the
   metrics reader need to exist first.

## Verification of "shipped" pieces

The shipped minimum (Tempo, Prometheus, Grafana, otel-contrib) is verified by:

```bash
./dev up obs
./dev hack trace GET /catalog/products    # prints span tree from Tempo
open http://localhost:3030                # Grafana → BFF Overview
```

If any of those break, the regression belongs in
[`../architecture/observability.md`](../architecture/observability.md), not
here.
