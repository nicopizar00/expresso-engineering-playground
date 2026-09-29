import assert from "node:assert/strict";
import test from "node:test";

import { build } from "esbuild";

const [{ text: bundledReport }] = (
  await build({
    entryPoints: ["support/report.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  })
).outputFiles;
const report = await import(`data:text/javascript;base64,${Buffer.from(bundledReport).toString("base64")}`);

const summaryData = {
  metrics: {
    iterations: {
      type: "counter",
      contains: "default",
      values: { count: 2, rate: 1 },
    },
  },
  options: {
    summaryTimeUnit: "ms",
    summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)"],
  },
  root_group: { name: "", checks: [], groups: [] },
  state: { testRunDurationMs: 2_000 },
};

test("summary outputs retain HTML and JSON while restoring default text stdout", () => {
  const outputs = report.buildSummaryOutputs(
    summaryData,
    { title: "Fixture", testType: "smoke", targetUrl: "http://target" },
    "/reports/fixture.html",
    "/reports/fixture.json",
  );

  assert.match(outputs.stdout, /iterations/);
  assert.match(outputs["/reports/fixture.html"], /Fixture/);
  assert.equal(JSON.parse(outputs["/reports/fixture.json"]).totalRequests, 0);
});
