// Cart-fulfill-browser scenario — the browser-driven mirror of
// http-cart.ts. Same pre-checkout steps as browser-purchase.ts
// (browse -> add to cart -> checkout panel renders), but stops before
// "Place Order" and emits the reserved cart as a `[DATA carts]` record
// instead, exactly like http-cart.ts does over HTTP.
//
// Downstream: http-orders (scenarios/http-orders/http-orders.ts) consumes
// the "carts" dataset (data/carts.csv) over plain HTTP, indifferent to
// whether http-cart or browser-cart produced it.
//
// Reading the cart id:
//   cartId is server-generated and required verbatim at checkout
//   (apps/bff/src/modules/checkout/checkout.dto.ts), but the web UI never
//   rendered it anywhere — see CartCheckoutPanel.tsx's `data-cart-id`
//   attribute, added specifically for this scenario to read via
//   page.getAttribute(). k6's browser module here has no request/response
//   interception (Page.on() only supports 'console'/'metric'), so reading
//   the POST /cart/items response body directly isn't an option.
//
// productId is intentionally left blank in the emitted row: http-orders.ts
// never reads that column (only cartId/sid), and there is no DOM-exposed
// productId to report honestly instead.

import { browser } from "k6/browser";
import { check } from "k6";
import { BASE_URL } from "../../config/env";
import { purchaseFlowBrowserThresholds } from "../../config/thresholds";
import { buildSummaryOutputs } from "../../support/report";

// @types/k6 doesn't declare k6's global `console` (see k6/console docs);
// mirrors http-cart.ts's declaration for the [DATA] harvest protocol.
declare const console: { log: (message: string) => void };

const VUS = Number(__ENV.VUS) || 1;
// Each VU drives a full Chromium instance — same reasoning as
// browser-purchase.ts, defaults to 5 reserved carts. Set ITERATIONS
// explicitly for a different batch size.
const ITERATIONS = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 5;

export const options = {
  scenarios: {
    browser_cart: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
      options: {
        browser: { type: "chromium" },
      },
    },
  },
  thresholds: purchaseFlowBrowserThresholds,
  tags: { suite: "mini-commerce-cart-fulfill-browser" },
};

export default async function () {
  const page = await browser.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    await page.waitForSelector('[data-testid="product-add-button"]', {
      state: "visible",
    });
    await page.click('[data-testid="product-add-button"]');

    await page.waitForSelector(
      '[data-testid="cart-checkout-panel"] button[type="submit"]',
      { state: "visible" },
    );

    const cartId = await page.getAttribute(
      '[data-testid="cart-checkout-panel"]',
      "data-cart-id",
    );
    const cartIdOk = check(cartId, {
      "cart id rendered on the checkout panel": (id) =>
        typeof id === "string" && id.length > 0,
    });

    if (cartIdOk) {
      const cookies = await page.context().cookies();
      const sid = cookies.find((cookie) => cookie.name === "sid")?.value;
      if (sid) {
        console.log(`[DATA carts] ${cartId},,${sid}`);
      }
    }
  } finally {
    await page.close();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Cart Fulfill (Browser)",
    testType: "browser-cart",
    targetUrl: BASE_URL,
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/browser-cart-report.html",
    "/scripts/reports/browser-cart-summary.json",
  );
}
