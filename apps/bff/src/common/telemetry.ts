import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

// Initialise the OpenTelemetry NodeSDK. Must be called before NestFactory so
// that HTTP/Express/Pg auto-instrumentations attach before those modules load.
// No-ops gracefully when OTEL_EXPORTER_OTLP_ENDPOINT is unset (dev/test without
// a collector).
export function initTelemetry(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "bff",
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.0.0",
      "deployment.environment":
        process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy fs instrumentation; HTTP + Express + pg are enough.
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
}
