# infra/observability

Local observability stack placeholders for the travel booking playground.

## Goal

Treat **traces, metrics, and logs** as first-class engineering signals from
day one, even before the application emits anything meaningful.

## Components (planned)

- **OpenTelemetry collector** — single ingest point for traces / metrics / logs
  from `apps/bff`, `apps/web`, and `tests/performance/k6` runs.
- **Tempo / Jaeger** — trace backend (TBD in ADR).
- **Prometheus** — metrics backend.
- **Loki** — log backend.
- **Grafana** — unified dashboards.

This iteration only ships the collector config skeleton. The full backend
stack will be added in a follow-up iteration alongside `infra/docker/compose.yaml`.

## Why this matters for quality engineering

- Performance runs (`tests/performance/k6`) export metrics into the same
  pipeline → SLO regressions become obvious in dashboards, not just k6 output.
- E2E and integration tests carry trace IDs through their HTTP calls → a
  failing test links straight to a trace.
- The same instrumentation that powers local debugging is what would later
  power production-grade observability — no separate "monitoring" effort.

## Next iteration TODOs

- [ ] Fill in `otel-collector-config.yaml` with OTLP receivers and stub exporters.
- [ ] Add Grafana, Prometheus, Tempo, Loki services to `compose.yaml`.
- [ ] Add a starter Grafana dashboard JSON under `dashboards/`.
