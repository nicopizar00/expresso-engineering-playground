// Order-status scenario — consumer of the "orders" dataset.
//
// Producers (http-orders, http-purchase, browser-purchase) emit
// `[DATA orders] <orderId>` after verifying each order; with
// `--produce orders` Punch publishes tests/performance/k6/data/orders.csv
// (header `orderId`) and injects its container path here as
// DATA_ORDERS_CSV (see spec.data in workflows/http-orders-status.yaml). Punch fails
// the run before Docker when the dataset is missing or empty.
//
// Each iteration reads GET /orders/:id/status — a direct Postgres read in
// the BFF — and checks the hot/cold temperature:
//   EXPECT_TEMPERATURE=auto (default): hot iff k6's clock is before coolsAt;
//     rows within ±2 s of coolsAt accept either value (clock skew).
//   EXPECT_TEMPERATURE=hot|cold: fixed expectation, e.g. a deliberate
//     "wait past the cool-down, then verify cold" run.
// ORDER_COOL_DOWN_SECONDS must match the BFF's value (default 300).
//
// Load shape:
//   From the k6 config Punch passes as `k6 run --config`; the workflow
//   default is options/5-iterations.json. Rows are reused round-robin when
//   the run iterates past the dataset size — reads are idempotent.
//
// Coverage:
//   GET /orders/:id/status — status + temperature straight from Postgres

import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { url } from "../../config/env";
import { orderStatusThresholds } from "../../config/thresholds";
import { buildSummaryOutputs } from "../../support/report";

const orderIds = new SharedArray<string>("orders", () =>
  open(__ENV.DATA_ORDERS_CSV)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0),
);

const EXPECT = (__ENV.EXPECT_TEMPERATURE || "auto").toLowerCase();
const COOL_DOWN_MS = (Number(__ENV.ORDER_COOL_DOWN_SECONDS) || 300) * 1000;
const SKEW_MS = 2000;

if (!["auto", "hot", "cold"].includes(EXPECT)) {
  throw new Error(
    `EXPECT_TEMPERATURE must be auto, hot, or cold; got ${EXPECT}`,
  );
}

// Load shape (executor, VUs, iterations or duration) comes from the k6
// config Punch passes as `k6 run --config`: the workflow's spec.k6.config
// or an options/*.json preset. Exporting scenarios here would override it.
export const options = {
  thresholds: orderStatusThresholds,
  tags: { suite: "mini-commerce-http-orders-status" },
};

interface OrderStatusBody {
  orderId: string;
  temperature: string;
  placedAt: string;
  coolsAt: string;
  checkedAt: string;
}

function expectedMatches(
  temperature: string,
  coolsAtMs: number,
  nowMs: number,
): boolean {
  if (EXPECT === "hot" || EXPECT === "cold") return temperature === EXPECT;
  if (Math.abs(nowMs - coolsAtMs) <= SKEW_MS) {
    return temperature === "hot" || temperature === "cold";
  }
  return temperature === (nowMs < coolsAtMs ? "hot" : "cold");
}

export default function () {
  const orderId = orderIds[exec.scenario.iterationInTest % orderIds.length];
  const res = http.get(url(`/orders/${encodeURIComponent(orderId)}/status`), {
    tags: { name: "GET /orders/:id/status" },
  });
  let body: OrderStatusBody | null = null;
  try {
    body = res.json() as unknown as OrderStatusBody;
  } catch {
    body = null;
  }
  const nowMs = Date.now();
  check(res, {
    "status 200": (r) => r.status === 200,
    "orderId matches": () => body?.orderId === orderId,
    "temperature is hot or cold": () =>
      body?.temperature === "hot" || body?.temperature === "cold",
    "coolsAt - placedAt equals cool-down": () =>
      body !== null &&
      Date.parse(body.coolsAt) - Date.parse(body.placedAt) === COOL_DOWN_MS,
    [`temperature matches ${EXPECT}`]: () =>
      body !== null &&
      expectedMatches(body.temperature, Date.parse(body.coolsAt), nowMs),
  });
  sleep(0.5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  return buildSummaryOutputs(
    data,
    {
      title: "Mini-Commerce Order Status",
      testType: "http-orders-status",
      targetUrl: url(""),
    },
    "/scripts/reports/http-orders-status-report.html",
    "/scripts/reports/http-orders-status-summary.json",
  );
}
