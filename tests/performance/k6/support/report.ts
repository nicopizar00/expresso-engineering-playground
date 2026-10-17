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

export interface ThresholdResult {
  metric: string;
  expression: string;
  ok: boolean;
}

// Every threshold k6 evaluated, so a reader sees which gate held or failed
// without re-deriving it from the aggregate `passed`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function thresholdResults(data: any): ThresholdResult[] {
  const results: ThresholdResult[] = [];
  for (const [metric, value] of Object.entries(data.metrics ?? {})) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thresholds = (value as any)?.thresholds ?? {};
    for (const [expression, result] of Object.entries(thresholds)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = (result as any)?.ok;
      if (typeof ok === "boolean") results.push({ metric, expression, ok });
    }
  }
  return results.sort(
    (a, b) =>
      a.metric.localeCompare(b.metric) ||
      a.expression.localeCompare(b.expression),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSummaryOutputs(
  data: any,
  meta: ReportMeta,
  htmlPath: string,
  jsonPath: string,
): Record<string, string> {
  // emittedMetrics lets a reader tell "not emitted" from a zero value:
  // Punch's summary defaults a missing error rate to 1 and p90 to 0.
  const summary = {
    ...buildSummaryJson(data, meta),
    thresholds: thresholdResults(data),
    emittedMetrics: Object.keys(data.metrics ?? {}).sort(),
  };
  return {
    stdout: textSummary(data, { indent: " ", enableColors: false }),
    [htmlPath]: buildHtml(data, meta),
    [jsonPath]: JSON.stringify(summary, null, 2),
  };
}
