// tests/performance/k6/scenarios/campaign/order-lookup.js
//
// Precondition (catalog.json): "At least one seeded order exists." Early in
// a fresh campaign this may not hold yet if the purchase adapter hasn't
// produced an order — that iteration reports "failed" honestly rather than
// being special-cased, since it reflects real endpoint state.
import http from "k6/http";
import { check, group } from "k6";
import { url } from "../../config/env.js";
import { iterationSuccess, newIterationId, reportEvent } from "./report-event.js";

const USE_CASE = { id: "commerce.order-lookup", version: 1 };
const TAGS = { use_case: USE_CASE.id, use_case_version: String(USE_CASE.version) };

export function orderLookup() {
  const iterationId = newIterationId();
  reportEvent(USE_CASE, iterationId, "started");
  let ok = true;
  let orderId;

  group("orders: list", () => {
    const res = http.get(url("/orders"), { tags: TAGS });
    ok = check(res, { "orders list 200": (r) => r.status === 200 }) && ok;
    if (ok) {
      try {
        const items = res.json("items");
        orderId = Array.isArray(items) && items.length > 0 ? items[0].orderId : undefined;
      } catch {
        orderId = undefined;
      }
    }
    ok = check(orderId, { "order selected": (id) => typeof id === "string" }) && ok;
  });

  if (ok && orderId) {
    group("orders: view", () => {
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

  iterationSuccess.add(ok, TAGS);
  reportEvent(USE_CASE, iterationId, ok ? "succeeded" : "failed");
}

export default orderLookup;
