// tests/performance/k6/scenarios/campaign/purchase.js
//
// concurrency.maxVirtualUsers: 1 in catalog.json — the BFF cart is
// process-local and shared, so this adapter must never run above 1 VU
// (enforced by Task 4's preflight, not by this file).
import http from "k6/http";
import { check, group } from "k6";
import { url } from "../../config/env.js";
import { newIterationId, reportEvent } from "./report-event.js";

const USE_CASE = { id: "commerce.purchase", version: 1 };
const TAGS = { use_case: USE_CASE.id, use_case_version: String(USE_CASE.version) };
const JSON_HEADERS = { "Content-Type": "application/json" };

export function purchase() {
  const iterationId = newIterationId();
  reportEvent(USE_CASE, iterationId, "started");
  let ok = true;
  let productId;
  let orderId;

  group("catalog: browse", () => {
    const res = http.get(url("/catalog/products"), { tags: TAGS });
    ok = check(res, { "catalog list 200": (r) => r.status === 200 }) && ok;
    if (ok) {
      try {
        const items = res.json("items");
        productId = Array.isArray(items) && items.length > 0 ? items[0].productId : undefined;
      } catch {
        productId = undefined;
      }
    }
    ok = check(productId, { "product selected": (id) => typeof id === "string" }) && ok;
  });

  if (ok) {
    group("cart: add item", () => {
      const res = http.post(
        url("/cart/items"),
        JSON.stringify({ productId, quantity: 1 }),
        { headers: JSON_HEADERS, tags: TAGS },
      );
      ok = check(res, { "cart add 201": (r) => r.status === 201 }) && ok;
    });
  }

  if (ok) {
    group("cart: view", () => {
      const res = http.get(url("/cart"), { tags: TAGS });
      ok = check(res, {
        "cart view 200": (r) => r.status === 200,
        "cart contains added item": (r) => {
          try {
            const items = r.json("items");
            return Array.isArray(items) && items.some((item) => item.productId === productId);
          } catch {
            return false;
          }
        },
      }) && ok;
    });
  }

  if (ok) {
    group("checkout", () => {
      const res = http.post(
        url("/checkout"),
        JSON.stringify({ customerName: "k6 Campaign Purchase" }),
        { headers: JSON_HEADERS, tags: TAGS },
      );
      ok = check(res, {
        "checkout 201": (r) => r.status === 201,
        "checkout returns orderId": (r) => {
          try {
            return typeof r.json("orderId") === "string";
          } catch {
            return false;
          }
        },
      }) && ok;
      if (ok) orderId = res.json("orderId");
    });
  }

  if (ok && orderId) {
    group("orders: verify", () => {
      const res = http.get(url(`/orders/${orderId}`), { tags: TAGS });
      ok = check(res, {
        "order 200": (r) => r.status === 200,
        "order id matches": (r) => {
          try {
            return r.json("orderId") === orderId;
          } catch {
            return false;
          }
        },
      }) && ok;
    });
  }

  reportEvent(USE_CASE, iterationId, ok ? "succeeded" : "failed");
}

export default purchase;
