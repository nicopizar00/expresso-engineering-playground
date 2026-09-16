// Purchase-flow scenario — the one repository-owned perf workflow.
//
// Mirrors the web app exactly: it never calls GET /catalog/products/:id
// because the web catalog grid adds to cart straight from the list, with
// no product-detail fetch.
//
// Cart constraint:
//   The BFF cart is single-user and in-process. VUS defaults to 1 so each
//   iteration owns the cart alone; raising VUS races concurrent iterations
//   against the same shared cart.
//
// Coverage:
//   GET  /catalog/products    — browse/search the grid
//   POST /cart/items          — add first product to cart
//   GET  /cart                — view cart (mirrors CartDrawer)
//   POST /checkout            — place order
//   GET  /orders/:id          — verify order persisted
//   GET  /visualization-data  — verify order sphere reaches the embedded visualizer

import http from "k6/http";
import { check, group, sleep } from "k6";
import { url } from "../../config/env";
import { purchaseFlowThresholds } from "../../config/thresholds";
import { buildHtml, buildSummaryJson } from "../../support/report";

const VUS = Number(__ENV.VUS) || 1;
const DURATION = __ENV.DURATION || "30s";

export const options = {
  scenarios: {
    purchase_flow: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: purchaseFlowThresholds,
  tags: { suite: "mini-commerce-purchase-flow" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  let productId: string | undefined;
  let orderId: string | undefined;

  group("catalog: browse", () => {
    const res = http.get(url("/catalog/products"));
    const ok = check(res, {
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
    if (ok) {
      try {
        const items = res.json("items") as Array<{ productId: string }>;
        productId = items[0]?.productId;
      } catch {
        productId = undefined;
      }
    }
  });

  group("cart: add item", () => {
    const res = http.post(
      url("/cart/items"),
      JSON.stringify({ productId, quantity: 1 }),
      { headers: JSON_HEADERS },
    );
    check(res, { "cart add 201": (r) => r.status === 201 });
  });

  group("cart: view", () => {
    const res = http.get(url("/cart"));
    check(res, {
      "cart 200": (r) => r.status === 200,
      "cart contains added item": (r) => {
        try {
          const items = r.json("items") as Array<{ productId: string }>;
          return Array.isArray(items) && items.some((item) => item.productId === productId);
        } catch {
          return false;
        }
      },
    });
  });

  group("checkout", () => {
    const res = http.post(url("/checkout"), JSON.stringify({}), {
      headers: JSON_HEADERS,
    });
    const ok = check(res, {
      "checkout 201": (r) => r.status === 201,
      "checkout returns orderId": (r) => {
        try {
          return typeof r.json("orderId") === "string";
        } catch {
          return false;
        }
      },
    });
    if (ok) {
      orderId = res.json("orderId") as string;
    }
  });

  group("orders: verify persisted order", () => {
    if (!orderId) return;
    const res = http.get(url(`/orders/${orderId}`));
    check(res, {
      "order 200": (r) => r.status === 200,
      "order id matches": (r) => {
        try {
          return r.json("orderId") === orderId;
        } catch {
          return false;
        }
      },
    });
  });

  group("visualization: order sphere present", () => {
    if (!orderId) return;
    const res = http.get(url("/visualization-data"));
    check(res, {
      "visualization 200": (r) => r.status === 200,
      "order sphere present": (r) => {
        try {
          const items = r.json("items");
          const expectedId = `viz_order_${orderId}`;
          return Array.isArray(items) && items.some((i: any) => i.id === expectedId);
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
  const meta = { title: "Mini-Commerce Purchase Flow", testType: "purchase-flow", targetUrl: url("") };
  return {
    "/scripts/reports/purchase-flow-report.html": buildHtml(data, meta),
    "/scripts/reports/purchase-flow-summary.json": JSON.stringify(buildSummaryJson(data, meta), null, 2),
  };
}
