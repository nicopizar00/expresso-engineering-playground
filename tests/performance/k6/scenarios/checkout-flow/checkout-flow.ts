// Checkout-flow scenario — single VU walking the full write path end-to-end.
//
// Purpose:
//   Verify that the complete commerce flow works under repeated execution and
//   that orders created via /checkout are durably persisted and queryable.
//   This scenario proves the Postgres persistence layer works end-to-end.
//
// Cart constraint:
//   The BFF cart is single-user and in-process. This scenario uses 1 VU so
//   each iteration has sole ownership of the cart state. Do not raise vus
//   above 1 — concurrent VUs would race on the shared cart.
//
// Coverage:
//   POST /cart/items         — add one item
//   POST /checkout           — drain cart → new persisted order
//   GET  /orders/:id         — verify order is queryable by the returned ID
//   GET  /visualization-data — verify order sphere appears in the viz feed

import http from "k6/http";
import { check, group, sleep } from "k6";
import { url } from "../../config/env";
import { checkoutFlowThresholds } from "../../config/thresholds";
import { buildHtml, buildSummaryJson } from "../../support/report";

export const options = {
  scenarios: {
    checkout_flow: {
      executor: "constant-vus",
      vus: 1,
      duration: "30s",
    },
  },
  thresholds: checkoutFlowThresholds,
  tags: { suite: "mini-commerce-checkout-flow" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  let orderId: string | undefined;

  group("cart: add item", () => {
    const res = http.post(
      url("/cart/items"),
      JSON.stringify({ productId: "prod_espresso", quantity: 1 }),
      { headers: JSON_HEADERS },
    );
    check(res, { "cart add 201": (r) => r.status === 201 });
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
  const meta = { title: "Mini-Commerce Checkout Flow", testType: "checkout-flow", targetUrl: url("") };
  return {
    "/scripts/reports/checkout-flow-report.html": buildHtml(data, meta),
    "/scripts/reports/checkout-flow-summary.json": JSON.stringify(buildSummaryJson(data, meta), null, 2),
  };
}
