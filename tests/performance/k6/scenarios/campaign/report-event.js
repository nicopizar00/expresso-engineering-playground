// tests/performance/k6/scenarios/campaign/report-event.js
//
// Fire-and-forget helper shared by all campaign adapters. A failed or slow
// ingest call MUST NOT fail or slow the measured commerce iteration
// (SPEC-007 / RUN-003) — errors are swallowed, not surfaced as checks.

import http from "k6/http";
import { url } from "../../config/env.js";

const INGEST_TIMEOUT = "500ms";

export function newIterationId() {
  return `${__VU}-${__ITER}-${Date.now()}`;
}

export function reportEvent(useCase, iterationId, outcome) {
  const payload = JSON.stringify({
    runId: __ENV.RUN_ID || "local",
    useCaseId: useCase.id,
    useCaseVersion: useCase.version,
    iterationId,
    outcome,
    timestamp: new Date().toISOString(),
  });
  try {
    http.post(url("/workflow-traffic/events"), payload, {
      headers: { "Content-Type": "application/json" },
      timeout: INGEST_TIMEOUT,
      tags: { name: "workflow-traffic-ingest" },
    });
  } catch (_err) {
    // swallow — ingest must never fail the iteration
  }
}
