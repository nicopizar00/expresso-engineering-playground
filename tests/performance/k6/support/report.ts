// tests/performance/k6/support/report.ts
//
// Thin re-export of punch's shared k6 reporting helpers (submodule at
// vendor/punch/). Every scenario imports from this short, stable local
// path instead of repeating the deep vendor/ relative path — see
// docs/specs/punch-submodule-integration.md INT-003.
import {
  buildHtml,
  buildSummaryJson,
  type ReportMeta,
} from "../../../../vendor/punch/src/tests/support/report";
import { textSummary } from "./vendor/k6-summary.js";

export * from "../../../../vendor/punch/src/tests/support/report";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSummaryOutputs(
  data: any,
  meta: ReportMeta,
  htmlPath: string,
  jsonPath: string,
): Record<string, string> {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: false }),
    [htmlPath]: buildHtml(data, meta),
    [jsonPath]: JSON.stringify(buildSummaryJson(data, meta), null, 2),
  };
}
