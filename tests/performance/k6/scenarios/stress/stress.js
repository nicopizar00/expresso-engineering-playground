// Stress scenario — ramping VUs pushing the BFF past nominal load.
//
// Purpose:
//   Find the failure mode. The expectation is degraded p95 latency, not a
//   green run — thresholds in stressThresholds are deliberately loose.
//
// Coverage (same eight endpoints as smoke.js):
//   GET  /health
//   GET  /catalog/products
//   GET  /catalog/products/:id
//   POST /cart/items
//   GET  /cart
//   POST /checkout
//   GET  /orders/:id
//   POST /orders/:id/manage

import http from "k6/http";
import { check, group, sleep } from "k6";
import { BASE_URL, url } from "../../config/env.js";
import { stressThresholds } from "../../config/thresholds.js";

const SCENARIO_NAME = "mini-commerce-stress";

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 50 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: stressThresholds,
  tags: { suite: SCENARIO_NAME },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

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
          return Array.isArray(r.json("items")) && r.json("items").length > 0;
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
      "product id matches": (r) => r.json("productId") === "prod_espresso",
    });
  });

  group("cart: add item", () => {
    const res = http.post(
      url("/cart/items"),
      JSON.stringify({ productId: "prod_espresso", quantity: 1 }),
      { headers: JSON_HEADERS },
    );
    check(res, { "cart add 201": (r) => r.status === 201 });
  });

  group("cart: read", () => {
    const res = http.get(url("/cart"));
    check(res, { "cart 200": (r) => r.status === 200 });
  });

  group("checkout", () => {
    const res = http.post(
      url("/checkout"),
      JSON.stringify({ customerName: "k6 Stress" }),
      { headers: JSON_HEADERS },
    );
    check(res, { "checkout 201": (r) => r.status === 201 });
  });

  group("orders: read seeded order", () => {
    // ord_demo is pre-seeded by the BFF; we use it instead of the order
    // returned by /checkout because checkout responses are not yet
    // round-trippable through /orders/:id in the in-memory mock.
    const res = http.get(url("/orders/ord_demo"));
    check(res, { "order 200": (r) => r.status === 200 });
  });

  group("orders: manage", () => {
    const res = http.post(
      url("/orders/ord_demo/manage"),
      JSON.stringify({ action: "mark_prepared" }),
      { headers: JSON_HEADERS },
    );
    check(res, { "manage 202": (r) => r.status === 202 });
  });

  sleep(1);
}

export function teardown() {
  console.log(`[${SCENARIO_NAME}] target=${BASE_URL}`);
}
