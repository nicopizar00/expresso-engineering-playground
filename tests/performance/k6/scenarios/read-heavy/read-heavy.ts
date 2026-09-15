// Read-heavy scenario — ramping VUs hitting all stable GET endpoints.
//
// Purpose:
//   Establish baseline latency numbers for read-only paths before any
//   optimisation work begins. Safe to run at high concurrency since
//   every request is idempotent.
//
// Coverage (all stable GET endpoints):
//   GET /health
//   GET /catalog/products
//   GET /catalog/products/:id
//   GET /orders
//   GET /orders/:id        (seeded ord_demo — always present)
//   GET /visualization-data

import http from "k6/http";
import { check, group, sleep } from "k6";
import { url } from "../../config/env";
import { readHeavyThresholds } from "../../config/thresholds";
import { buildHtml, buildSummaryJson } from "../../support/report";

export const options = {
  scenarios: {
    read_heavy: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 30 },
        { duration: "2m", target: 30 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: readHeavyThresholds,
  tags: { suite: "mini-commerce-read-heavy" },
};

export default function () {
  group("health", () => {
    const res = http.get(url("/health"));
    check(res, { "health 200": (r) => r.status === 200 });
  });

  group("catalog: list", () => {
    const res = http.get(url("/catalog/products"));
    check(res, {
      "catalog 200": (r) => r.status === 200,
      "catalog has items": (r) => {
        try {
          const items = r.json("items");
          return Array.isArray(items) && items.length > 0;
        } catch {
          return false;
        }
      },
    });
  });

  group("catalog: product by id", () => {
    const res = http.get(url("/catalog/products/prod_espresso"));
    check(res, {
      "product 200": (r) => r.status === 200,
      "product id matches": (r) => {
        try {
          return r.json("productId") === "prod_espresso";
        } catch {
          return false;
        }
      },
    });
  });

  group("orders: list", () => {
    const res = http.get(url("/orders"));
    check(res, {
      "orders list 200": (r) => r.status === 200,
      "orders list has items": (r) => {
        try {
          const orders = r.json("orders");
          return Array.isArray(orders) && orders.length > 0;
        } catch {
          return false;
        }
      },
    });
  });

  group("orders: get by id", () => {
    const res = http.get(url("/orders/ord_demo"));
    check(res, { "order 200": (r) => r.status === 200 });
  });

  group("visualization data", () => {
    const res = http.get(url("/visualization-data"));
    check(res, {
      "visualization 200": (r) => r.status === 200,
      "visualization has items": (r) => {
        try {
          const items = r.json("items");
          return Array.isArray(items) && items.length > 0;
        } catch {
          return false;
        }
      },
    });
  });

  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = { title: "Mini-Commerce Read Heavy", testType: "read-heavy", targetUrl: url("") };
  return {
    "/scripts/reports/read-heavy-report.html": buildHtml(data, meta),
    "/scripts/reports/read-heavy-summary.json": JSON.stringify(buildSummaryJson(data, meta), null, 2),
  };
}
