# infra/observability

Local observability foundation for the mini-commerce engineering playground.

## Goal

Treat **traces, metrics, and logs** as first-class engineering signals from
day one, even before the application emits anything meaningful.

## Implemented today

- **OpenTelemetry Collector** accepts OTLP gRPC and HTTP traffic through the
  Compose stack and writes received telemetry through the debug exporter.
- **BFF trace instrumentation** initializes the Node SDK when an OTLP endpoint
  is configured, including HTTP/Express/Postgres auto-instrumentation and
  manual order spans.
- **k6 OTLP path** is configured in the performance Compose stack so test
  metrics can reach the collector debug pipeline.

## Planned backends

- **Tempo / Jaeger** — trace backend (TBD in ADR).
- **Prometheus** — metrics backend.
- **Loki** — log backend.
- **Grafana** — unified dashboards.

There is no persistent telemetry backend or dashboard yet; collector output
is currently diagnostic console output only.

## Why this matters for quality engineering

- Performance runs (`tests/performance/k6`) export metrics into the same
  pipeline → SLO regressions become obvious in dashboards, not just k6 output.
- Future E2E and integration correlation can carry trace IDs through their
  HTTP calls once those suites and a trace backend are active.
- The same instrumentation that powers local debugging is what would later
  power production-grade observability — no separate "monitoring" effort.

## Next iteration TODOs

- [ ] Add Grafana, Prometheus, Tempo, Loki services to `compose.yaml`.
- [ ] Add a starter Grafana dashboard JSON under `dashboards/`.
- [ ] Correlate test run identifiers with persisted traces and metrics.
