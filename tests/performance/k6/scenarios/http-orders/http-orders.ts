// http-orders scenario — the checkout half of http-cart's pair.
//
// http-cart (scenarios/http-cart/http-cart.ts) reserves carts and
// stops before checkout, emitting each cart as a `[DATA carts]` record; with
// `--produce carts` Punch publishes them as the "carts" dataset. This
// scenario requires that dataset (spec.data in workflows/http-orders.yaml),
// reads it via a SharedArray — loaded once at init and shared read-only
// across VUs — and completes checkout for each row instead of creating a
// fresh cart itself.
//
// Data file:
//   Punch injects the dataset's container path as DATA_CARTS_CSV (under the
//   live-mounted /scripts/data volume, see infra/docker/compose.performance.yaml)
//   and fails before Docker when it has no rows. Line 1 is the header
//   `cartId,productId,sid`; rows are unquoted (see http-cart.ts's
//   console.log).
//
// Session handoff:
//   The BFF's cart is session-scoped, not addressable by cartId alone (see
//   the note in http-cart.ts) — checkout only finds a cart that belongs
//   to the caller's own `sid` session. Before checkout, this VU's cookie
//   jar is set to the row's captured `sid` so the request lands in the
//   session that actually owns the cart, instead of this run's own fresh
//   one. `sid` isn't signed (session.service.ts reads it straight off the
//   Cookie header), so replaying it this way is exactly how the cookie is
//   meant to work — not a workaround.
//
// Load shape:
//   From the k6 config Punch passes as `k6 run --config`; the workflow
//   default is options/5-iterations.json, matching http-cart's own default
//   rather than tracking however many rows happen to be in the pool. Each
//   row should be consumed once: a run that iterates past the pool size
//   wraps around and re-attempts already-placed orders (those checks will
//   fail, not crash; the "no data" case is caught by Punch's preflight).
//   Sizing the producer for http-orders (`--size-for http-orders`) makes the
//   pool fit the chosen config, time-based soaks included.
//
// Coverage:
//   POST /orders            — place order for an http-cart-reserved cart
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

// Load shape (executor, VUs, iterations or duration) comes from the k6
// config Punch passes as `k6 run --config`: the workflow's spec.k6.config
// or an options/*.json preset. Exporting scenarios here would override it.
export const options = {
  thresholds: purchaseFlowThresholds,
  tags: { suite: "mini-commerce-http-orders" },
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
      "visualizer ok after order": (r) => {
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
    testType: "http-orders",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/http-orders-report.html",
    "/scripts/reports/http-orders-summary.json",
  );
}
