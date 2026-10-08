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
const report = await import(
  `data:text/javascript;base64,${Buffer.from(bundledReport).toString("base64")}`
);

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

const meta = {
  title: "Fixture",
  testType: "browser",
  targetUrl: "http://target",
};

const browserOnlyData = {
  ...summaryData,
  metrics: {
    checks: {
      type: "rate",
      contains: "default",
      values: { rate: 1, passes: 4, fails: 0 },
    },
    browser_http_req_failed: {
      type: "rate",
      contains: "default",
      values: { rate: 1 / 43, passes: 1, fails: 42 },
    },
    browser_http_req_duration: {
      type: "trend",
      contains: "time",
      values: {
        avg: 48.48,
        min: 7.47,
        med: 27.51,
        max: 264.89,
        "p(90)": 106.98,
        "p(95)": 135.37,
      },
    },
  },
  state: { testRunDurationMs: 5_000 },
};

test("browser runs summarize browser_http_* metrics instead of defaulting to zero/100% errors", () => {
  const json = report.buildSummaryJson(browserOnlyData, meta);
  assert.equal(json.totalRequests, 43);
  assert.equal(json.errorRate, 1 / 43);
  assert.equal(json.p90Ms, 106.98);

  const html = report.buildHtml(browserOnlyData, meta);
  assert.match(html, /<td>Total requests<\/td><td>43<\/td>/);
  assert.match(html, /<td>Request rate<\/td><td>8\.60 req\/s<\/td>/);
  assert.match(html, /<td>p90 response time<\/td><td>106\.98 ms<\/td>/);
  assert.match(html, /<td>Error rate<\/td><td>2\.33%<\/td>/);
});

test("protocol http_* metrics still win when present", () => {
  const data = {
    ...browserOnlyData,
    metrics: {
      ...browserOnlyData.metrics,
      http_reqs: {
        type: "counter",
        contains: "default",
        values: { count: 15, rate: 3 },
      },
      http_req_failed: {
        type: "rate",
        contains: "default",
        values: { rate: 0, passes: 0, fails: 15 },
      },
      http_req_duration: {
        type: "trend",
        contains: "time",
        values: { avg: 9, "p(90)": 16.5, "p(95)": 21 },
      },
    },
  };
  const json = report.buildSummaryJson(data, meta);
  assert.equal(json.totalRequests, 15);
  assert.equal(json.errorRate, 0);
  assert.equal(json.p90Ms, 16.5);
});
