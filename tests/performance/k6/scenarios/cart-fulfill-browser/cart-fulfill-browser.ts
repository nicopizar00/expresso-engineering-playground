// Cart-fulfill-browser scenario — the browser-driven mirror of
// cart-fulfill.ts. Same pre-checkout steps as purchase-flow-browser.ts
// (browse -> add to cart -> checkout panel renders), but stops before
// "Place Order" and emits the reserved cart as a [CSV] record instead,
// exactly like cart-fulfill.ts does over HTTP.
//
// Downstream: place-order (scenarios/place-order/place-order.ts) consumes
// reports/cart-fulfill-carts.csv over plain HTTP, indifferent to whether
// cart-fulfill or cart-fulfill-browser produced it.
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
// productId is intentionally left blank in the emitted row: place-order.ts
// never reads that column (only cartId/sid), and there is no DOM-exposed
// productId to report honestly instead.

import { browser } from "k6/browser";
import { check } from "k6";
import { BASE_URL } from "../../config/env";
import { purchaseFlowBrowserThresholds } from "../../config/thresholds";
import { buildHtml, buildSummaryJson } from "../../support/report";

// @types/k6 doesn't declare k6's global `console` (see k6/console docs);
// mirrors cart-fulfill.ts's declaration for the [CSV] harvest protocol.
declare const console: { log: (message: string) => void };

const VUS = Number(__ENV.VUS) || 1;
// Each VU drives a full Chromium instance — same reasoning as
// purchase-flow-browser.ts, defaults to 5 reserved carts. Set ITERATIONS
// explicitly for a different batch size.
const ITERATIONS = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 5;

export const options = {
  scenarios: {
    cart_fulfill_browser: {
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
        console.log(`[CSV] ${cartId},,${sid}`);
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
    testType: "cart-fulfill-browser",
    targetUrl: BASE_URL,
  };
  return {
    "/scripts/reports/cart-fulfill-browser-report.html": buildHtml(
      data,
      meta,
    ),
    "/scripts/reports/cart-fulfill-browser-summary.json": JSON.stringify(
      buildSummaryJson(data, meta),
      null,
      2,
    ),
  };
}
