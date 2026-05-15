// Smoke scenario — single VU walking the full mini-commerce happy path.
//
// Purpose:
//   Catch obvious regressions before scheduling longer load/stress runs.
//   Runs in well under a minute so it is safe to wire into per-PR CI.
//
// Coverage (mirrors `pnpm pg:smoke` exactly):
//   GET  /health
//   GET  /catalog/products
//   GET  /catalog/products/:id
//   POST /cart/items
//   GET  /cart
//   POST /checkout
//   GET  /orders/:id
//   POST /orders/:id/manage
//
// This file is a STARTING POINT. Once the existing k6 project is imported
// into this folder (see ../../README.md), prefer extending its scenarios
// instead of growing this script.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { url } from "../../config/env.js";
import { smokeThresholds } from "../../config/thresholds.js";

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: 1,
      duration: "20s",
    },
  },
  thresholds: smokeThresholds,
  // Single-letter tags keep output compact for CI consumers.
  tags: { suite: "mini-commerce-smoke" },
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
      JSON.stringify({ customerName: "k6 Smoke" }),
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
