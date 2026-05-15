// OpenTelemetry bootstrap — INTENTIONALLY a placeholder for this iteration.
//
// TODO (observability iteration):
//   1. Initialize the NodeSDK from `@opentelemetry/sdk-node` BEFORE NestFactory
//      runs, so HTTP/Express/Pg auto-instrumentations attach.
//   2. Configure the OTLP exporter endpoint from OTEL_EXPORTER_OTLP_ENDPOINT
//      (defaults to the otel-collector service in infra/docker/compose.yaml).
//   3. Register resource attributes: service.name=bff, service.version, env.
//   4. Wire log correlation (trace_id / span_id) into the Nest Logger.
//
// Kept as a no-op so main.ts has a stable call site to wire later without
// touching bootstrap order.
export function initTelemetry(): void {
  // no-op
}
