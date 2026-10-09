// Cart-fulfill scenario — generates reserved carts without completing checkout.
//
// Mirrors http-purchase's pre-checkout steps exactly, then emits the cart id
// as a `[DATA carts]` stdout record instead of placing an order. Punch writes
// those rows to data/carts.csv when the run opts in with `--produce carts`
// (see spec.data in workflows/http-cart.yaml), giving http-orders a batch
// of live cart ids without exercising the checkout path.
//
// Session handoff:
//   The BFF's cart is looked up by session (apps/bff/src/modules/cart/
//   cart.service.ts: `Map<sessionId, SessionCart>`, in-memory, per-process) —
//   cartId in a checkout request body is only an echo-check against that
//   session's own cart, never a cross-session lookup key. A cart this VU
//   creates is therefore unreachable from any other k6 run/container unless
//   that run replays the exact same `sid` cookie. session.service.ts reads
//   `sid` straight off the Cookie header with no signing, so it's a plain
//   replayable bearer token — this row's 3rd column carries it for
//   http-orders (scenarios/http-orders/http-orders.ts) to set explicitly via
//   http.cookieJar().set(...) before its checkout call.
//
// Load shape:
//   From the k6 config Punch passes as `k6 run --config`. The workflow
//   default is options/5-iterations.json — a fixed op count, environment
//   independent, unlike a constant-vus soak (options/*-vu-5m.json) whose
//   throughput (and therefore op count) varies with how fast the target
//   environment is.
//
// Coverage:
//   GET  /products    — browse/search the grid
//   POST /cart/items          — add first product to cart (creates the cart,
//                                mints the session's `sid` cookie)
//   GET  /cart                — view cart (mirrors CartDrawer)

import http from "k6/http";
import { check, group, sleep } from "k6";
import { url } from "../../config/env";
import { purchaseFlowThresholds } from "../../config/thresholds";
import { buildSummaryOutputs } from "../../support/report";

// @types/k6 doesn't declare k6's global `console` (see k6/console docs);
// this is the first TS scenario to need it for the [DATA] harvest protocol.
declare const console: { log: (message: string) => void };

// Load shape (executor, VUs, iterations or duration) comes from the k6
// config Punch passes as `k6 run --config`: the workflow's spec.k6.config
// or an options/*.json preset. Exporting scenarios here would override it.
export const options = {
  thresholds: purchaseFlowThresholds,
  tags: { suite: "mini-commerce-http-cart" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  let productId: string | undefined;
  let cartId: string | undefined;

  group("catalog: browse", () => {
    const res = http.get(url("/products"));
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
    cartId = res.json("cartId") as string | undefined;
  });

  group("cart: view", () => {
    const res = http.get(url("/cart"));
    check(res, {
      "cart 200": (r) => r.status === 200,
      "cart contains added item": (r) => {
        try {
          const items = r.json("items") as Array<{ productId: string }>;
          return (
            Array.isArray(items) &&
            items.some((item) => item.productId === productId)
          );
        } catch {
          return false;
        }
      },
    });
  });

  group("cart: fulfill", () => {
    if (cartId && productId) {
      const sid = http.cookieJar().cookiesForURL(url("/")).sid?.[0];
      if (sid) {
        console.log(`[DATA carts] ${cartId},${productId},${sid}`);
      }
    }
  });

  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Cart Fulfill",
    testType: "http-cart",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/http-cart-report.html",
    "/scripts/reports/http-cart-summary.json",
  );
}
