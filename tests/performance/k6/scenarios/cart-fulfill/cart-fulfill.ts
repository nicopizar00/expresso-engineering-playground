// Cart-fulfill scenario — generates reserved carts without completing checkout.
//
// Mirrors purchase-flow's pre-checkout steps exactly, then emits the cart id
// as a [CSV] stdout record instead of placing an order. Downstream consumers
// harvest the declared CSV output (see workflows/cart-fulfill.yaml) to get a
// batch of live cart ids without exercising the checkout path.
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
//   place-order (scenarios/place-order/place-order.ts) to set explicitly via
//   http.cookieJar().set(...) before its checkout call.
//
// Load shape:
//   Set DURATION (+ VUS) for a constant-VU soak, or set ITERATIONS (+ VUS)
//   for a fixed number of cart-fulfill runs instead of a time budget.
//   ITERATIONS takes precedence when both are set. Neither set: defaults to
//   5 iterations — environment independent, unlike a DURATION-based soak
//   whose throughput (and therefore op count) varies with how fast the
//   target environment is.
//
// Coverage:
//   GET  /catalog/products    — browse/search the grid
//   POST /cart/items          — add first product to cart (creates the cart,
//                                mints the session's `sid` cookie)
//   GET  /cart                — view cart (mirrors CartDrawer)

import http from "k6/http";
import { check, group, sleep } from "k6";
import { url } from "../../config/env";
import { purchaseFlowThresholds } from "../../config/thresholds";
import { buildHtml, buildSummaryJson } from "../../support/report";

// @types/k6 doesn't declare k6's global `console` (see k6/console docs);
// this is the first TS scenario to need it for the [CSV] harvest protocol.
declare const console: { log: (message: string) => void };

const VUS = Number(__ENV.VUS) || 1;
const DURATION = __ENV.DURATION || "30s";
const ITERATIONS = __ENV.ITERATIONS
  ? Number(__ENV.ITERATIONS)
  : __ENV.DURATION
    ? undefined
    : 5;

const scenario = ITERATIONS
  ? {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
    }
  : { executor: "constant-vus", vus: VUS, duration: DURATION };

export const options = {
  scenarios: { cart_fulfill: scenario },
  thresholds: purchaseFlowThresholds,
  tags: { suite: "mini-commerce-cart-fulfill" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  let productId: string | undefined;
  let cartId: string | undefined;

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
        console.log(`[CSV] ${cartId},${productId},${sid}`);
      }
    }
  });

  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Cart Fulfill",
    testType: "cart-fulfill",
    targetUrl: url(""),
  };
  return {
    "/scripts/reports/cart-fulfill-report.html": buildHtml(data, meta),
    "/scripts/reports/cart-fulfill-summary.json": JSON.stringify(
      buildSummaryJson(data, meta),
      null,
      2,
    ),
  };
}
