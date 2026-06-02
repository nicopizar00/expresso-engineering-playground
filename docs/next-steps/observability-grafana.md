# Observability — Grafana stack (`obs` profile)

**Status:** shipped (Tempo + Prometheus + Grafana minimum)

## What's in

- `./dev up obs` (or `up full`) brings up:
  - **Tempo 2.6.0** — trace storage, OTLP gRPC/HTTP ingest on :4317/:4318,
    HTTP API on :3200.
  - **Prometheus v2.55.0** — scrapes the otel-collector's prometheus
    exporter on :8889.
  - **Grafana 11.3.0** — anonymous-viewer enabled, admin/admin by default;
    Tempo + Prometheus pre-provisioned, `BFF Overview` starter dashboard.
- Otel collector swapped from the base image to `otel-contrib:0.110.0` so
  the prometheus exporter is available. Traces flow → Tempo; metrics →
  prometheus exporter → Prometheus.
- BFF compose env hardcodes `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-
  collector:4318` so a host-side `.env` override (commonly `localhost:4318`
  for k6 host mode) does not silently break tracing.
- `./dev hack trace` uses Tempo's HTTP API to fetch span trees by ID.

## URLs

- Grafana: http://localhost:3030 (admin/admin)
- Prometheus: http://localhost:9090
- Tempo API: http://localhost:3200

## Verify

```bash
./dev up obs
./dev hack trace GET /catalog/products   # prints span tree from Tempo
```

Open Grafana → `BFF Overview` → traces populate within ~10s of any BFF
request. Use Explore → Tempo → TraceQL editor for ad-hoc trace queries.

## What's not in (next iterations)

1. **Loki + structured BFF logs.** Today logs pipeline still uses the
   `debug` exporter (stdout). The BFF logger writes pino-style lines; a
   Loki sidecar + filelog receiver in the collector is the minimum next
   step.
2. **BFF metrics.** The OTel SDK in `apps/bff/src/common/telemetry.ts`
   only configures a trace exporter. Add a `metricReader` so the BFF
   panels in the dashboard show actual numbers (currently they only
   populate from k6 runs).
3. **Alerting.** No alert rules in Prometheus. Pick a few SLO-shaped
   thresholds (5xx rate, p95 latency on `/checkout`) and wire them.
4. **OpenSearch / OpenTelemetry-native APM.** Out of scope until logs land.
5. **Trace-to-log + trace-to-profiles correlation.** Easier once Loki and
   metrics are both in.
