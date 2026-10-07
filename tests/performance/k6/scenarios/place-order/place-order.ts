// Place-order scenario — the checkout half of cart-fulfill's pair.
//
// cart-fulfill (scenarios/cart-fulfill/cart-fulfill.ts) reserves carts and
// stops before checkout, emitting each cart as a `[DATA carts]` record; with
// `--produce carts` Punch publishes them as the "carts" dataset. This
// scenario requires that dataset (spec.data in workflows/place-order.yaml),
// reads it via a SharedArray — loaded once at init and shared read-only
// across VUs — and completes checkout for each row instead of creating a
// fresh cart itself.
//
// Data file:
//   Punch injects the dataset's container path as DATA_CARTS_CSV (under the
//   live-mounted /scripts/data volume, see infra/docker/compose.performance.yaml)
//   and fails before Docker when it has no rows. Line 1 is the header
//   `cartId,productId,sid`; rows are unquoted (see cart-fulfill.ts's
//   console.log).
//
// Session handoff:
//   The BFF's cart is session-scoped, not addressable by cartId alone (see
//   the note in cart-fulfill.ts) — checkout only finds a cart that belongs
//   to the caller's own `sid` session. Before checkout, this VU's cookie
//   jar is set to the row's captured `sid` so the request lands in the
//   session that actually owns the cart, instead of this run's own fresh
//   one. `sid` isn't signed (session.service.ts reads it straight off the
//   Cookie header), so replaying it this way is exactly how the cookie is
//   meant to work — not a workaround.
//
// Load shape:
//   VUS/ITERATIONS only — no DURATION. A fixed cart pool doesn't fit a
//   time-based soak: each row should be consumed once. ITERATIONS defaults
//   to 5 — same fixed-count default as every other scenario (environment
//   independent) — matching cart-fulfill's own 5-iteration default rather
//   than tracking however many rows happen to be in the pool. Set it
//   explicitly to consume a different subset, or higher than the pool size
//   to wrap around and re-attempt already-placed orders (those checks will
//   fail, not crash; the "no data" case is caught by Punch's preflight).
//
// Coverage:
//   POST /orders            — place order for a cart-fulfill-reserved cart
//   GET  /orders/:id          — verify order persisted
//                               (emits `[DATA orders] <orderId>`)
//   GET  /visualization  — verify order sphere reaches the visualizer

import http from "k6/http";
import { check, group, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { url } from "../../config/env";
import { purchaseFlowThresholds } from "../../config/thresholds";
import { buildSummaryOutputs } from "../../support/report";

interface ReservedCart {
  cartId: string;
  productId: string;
  sid: string;
}

// @types/k6 doesn't declare k6's global `console`; needed for the [DATA]
// harvest protocol.
declare const console: { log: (message: string) => void };

const reservedCarts = new SharedArray<ReservedCart>("reserved-carts", () => {
  const raw = open(__ENV.DATA_CARTS_CSV);
  return raw
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [cartId, productId, sid] = line.split(",");
      return { cartId, productId, sid };
    });
});

const VUS = Number(__ENV.VUS) || 1;
const ITERATIONS = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 5;

export const options = {
  scenarios: {
    place_order: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
    },
  },
  thresholds: purchaseFlowThresholds,
  tags: { suite: "mini-commerce-place-order" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  const cart = reservedCarts[exec.scenario.iterationInTest % reservedCarts.length];
  let orderId: string | undefined;

  group("checkout", () => {
    http.cookieJar().set(url("/"), "sid", cart.sid);
    const res = http.post(
      url("/orders"),
      JSON.stringify({ cartId: cart.cartId }),
      { headers: JSON_HEADERS },
    );
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
    const persisted = check(res, {
      "order 200": (r) => r.status === 200,
      "order id matches": (r) => {
        try {
          return r.json("orderId") === orderId;
        } catch {
          return false;
        }
      },
    });
    // Punch writes this to the "orders" dataset only when the run opts in
    // with --produce orders (spec.data in the workflow YAML).
    if (persisted) console.log(`[DATA orders] ${orderId}`);
  });

  group("visualization: order sphere present", () => {
    if (!orderId) return;
    const res = http.get(url("/visualization"));
    check(res, {
      "visualization 200": (r) => r.status === 200,
      "order sphere present": (r) => {
        try {
          const items = r.json("items");
          const expectedId = `viz_order_${orderId}`;
          return (
            Array.isArray(items) && items.some((i: any) => i.id === expectedId)
          );
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
  const meta = {
    title: "Mini-Commerce Place Order",
    testType: "place-order",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/place-order-report.html",
    "/scripts/reports/place-order-summary.json",
  );
}
