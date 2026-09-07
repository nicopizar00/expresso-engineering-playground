// tests/performance/k6/scenarios/campaign/catalog-browse.js
import http from "k6/http";
import { check, group } from "k6";
import { url } from "../../config/env.js";
import { newIterationId, reportEvent } from "./report-event.js";

const USE_CASE = { id: "commerce.catalog-browse", version: 1 };
const TAGS = { use_case: USE_CASE.id, use_case_version: String(USE_CASE.version) };

export function catalogBrowse() {
  const iterationId = newIterationId();
  reportEvent(USE_CASE, iterationId, "started");
  let ok = true;
  let productId;

  group("catalog: list", () => {
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

  if (ok && productId) {
    group("catalog: view product", () => {
      const res = http.get(url(`/catalog/products/${productId}`), { tags: TAGS });
      ok = check(res, { "product view 200": (r) => r.status === 200 }) && ok;
    });
  }

  reportEvent(USE_CASE, iterationId, ok ? "succeeded" : "failed");
}

export default catalogBrowse;
