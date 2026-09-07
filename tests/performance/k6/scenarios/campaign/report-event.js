// tests/performance/k6/scenarios/campaign/report-event.js
//
// Fire-and-forget helper shared by all campaign adapters. A failed or slow
// ingest call MUST NOT fail or slow the measured commerce iteration
// (SPEC-007 / RUN-003) — errors are swallowed, not surfaced as checks.

import http from "k6/http";
import { Rate } from "k6/metrics";
import { url } from "../../config/env.js";

const INGEST_TIMEOUT = "500ms";

// Whole-iteration success, tracked as its own metric so the campaign
// threshold gates on "did the workflow complete end to end" rather than on
// the blended `checks` rate — which stays high even when the last step of a
// use case fails 100% of the time, because the earlier checks still pass.
export const iterationSuccess = new Rate("workflow_iteration_success");

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
      // Ingest failures must never count toward the campaign's
      // http_req_failed gate (SPEC-007 / RUN-003): killing the
      // workflow-traffic feed cannot be allowed to fail the commerce run.
      // Must be a {min,max} range object — bare integer arguments to
      // expectedStatuses are exact status codes, not range bounds.
      responseCallback: http.expectedStatuses({ min: 0, max: 599 }),
    });
  } catch (_err) {
    // swallow — ingest must never fail the iteration
  }
}
