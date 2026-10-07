// Purchase-registered scenario — first link of the hot-status load chain.
//
// Places one anonymous order per iteration FOR a seeded demo user
// (orderFor: {type: "user", recipient}), verifies the persisted owner, and
// emits `[DATA owned-orders] <orderId>,<username>,<email>`. With
// `--produce owned-orders` Punch publishes those rows; `http-auth-login` consumes them
// as an optional dataset.
//
// Users: support/demo-users.ts (round-robin by iteration); USERS=ana,ben
// narrows the pool. Each iteration clears its cookie jar so it gets a fresh
// cart session (`sid`) and never inherits an occupied cart.
//
// Coverage:
//   POST /cart/items   — add prod_espresso (returns the cartId checkout needs)
//   POST /orders     — orderFor another user
//   GET  /orders/:id   — owner is {username}

import http from "k6/http";
import { check, group, sleep } from "k6";
import exec from "k6/execution";
import { url } from "../../config/env";
import { purchaseRegisteredThresholds } from "../../config/thresholds";
import { demoUserEmail, parseUsers } from "../../support/demo-users";
import { buildSummaryOutputs } from "../../support/report";

// @types/k6 doesn't declare k6's global `console`; needed for [DATA] rows.
declare const console: { log: (message: string) => void };

const USERS = parseUsers(__ENV.USERS);
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
  scenarios: { http_purchase_registered: scenario },
  thresholds: purchaseRegisteredThresholds,
  tags: { suite: "mini-commerce-http-purchase-registered" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  const username = USERS[exec.scenario.iterationInTest % USERS.length];
  let cartId: string | undefined;
  let orderId: string | undefined;
  http.cookieJar().clear(url("/"));

  group("cart: add item", () => {
    const res = http.post(
      url("/cart/items"),
      JSON.stringify({ productId: "prod_espresso", quantity: 1 }),
      { headers: JSON_HEADERS },
    );
    const ok = check(res, { "cart add 201": (r) => r.status === 201 });
    if (ok) cartId = res.json("cartId") as string | undefined;
  });

  group("checkout: order for user", () => {
    if (!cartId) return;
    const res = http.post(
      url("/orders"),
      JSON.stringify({
        cartId,
        orderFor: { type: "user", recipient: username },
      }),
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
    if (ok) orderId = res.json("orderId") as string;
  });

  group("orders: verify owner", () => {
    if (!orderId) return;
    const res = http.get(url(`/orders/${orderId}`));
    const owned = check(res, {
      "order 200": (r) => r.status === 200,
      "order owned by user": (r) => {
        try {
          const owner = r.json("owner") as { username?: string } | null;
          return owner?.username === username;
        } catch {
          return false;
        }
      },
    });
    if (owned) {
      console.log(
        `[DATA owned-orders] ${orderId},${username},${demoUserEmail(username)}`,
      );
    }
  });

  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Purchase Registered",
    testType: "http-purchase-registered",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/http-purchase-registered-report.html",
    "/scripts/reports/http-purchase-registered-summary.json",
  );
}
