// browser-cart scenario — the browser-driven mirror of
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
// productId comes from the add button's data-product-id, so a browser-cart
// row carries the same three non-empty columns as an http-cart row.
//
// Steps mirror http-cart.ts's groups as `// step:` markers (k6 0.54's
// group() does not accept async callbacks) and share its outcome checks;
// HTTP status checks stay http-only because the browser module cannot see
// network responses.

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
    // step: catalog: browse
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="product-add-button"]', {
      state: "visible",
    });
    const addButtons = await page.$$('[data-testid="product-add-button"]');
    check(addButtons, {
      "catalog has items": (b) => b.length > 0,
    });

    // step: cart: add item
    const productId = await page.getAttribute(
      '[data-testid="product-add-button"]',
      "data-product-id",
    );
    const label = await page.getAttribute(
      '[data-testid="product-add-button"]',
      "aria-label",
    );
    const productName = label?.replace(/^Add /, "").replace(/ to cart$/, "");
    await page.click('[data-testid="product-add-button"]');

    // step: cart: view
    await page.waitForSelector(
      '[data-testid="cart-checkout-panel"] button[type="submit"]',
      { state: "visible" },
    );
    const panelText = await page.textContent(
      '[data-testid="cart-checkout-panel"]',
    );
    const cartId = await page.getAttribute(
      '[data-testid="cart-checkout-panel"]',
      "data-cart-id",
    );
    const inCart = check(panelText, {
      "cart contains added item": (t) =>
        typeof t === "string" &&
        !!productName &&
        t.includes(productName) &&
        typeof cartId === "string" &&
        cartId.length > 0,
    });

    // step: cart: fulfill
    if (inCart && productId) {
      const cookies = await page.context().cookies();
      const sid = cookies.find((cookie) => cookie.name === "sid")?.value;
      if (sid) {
        console.log(`[DATA carts] ${cartId},${productId},${sid}`);
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
