// browser-purchase scenario — the browser-driven mirror of
// http-purchase.ts. Same journey (add product, place order, land on the
// order it created), but exercised through a real Chromium tab against the
// web app instead of raw HTTP calls against the BFF.
//
// Web app UI shape (apps/web/app/page.tsx), as of this scenario's authoring:
//   - The catalog and the cart/checkout panel render on the same page (`/`),
//     side by side — no cart drawer to open, no /checkout route.
//   - Checkout is a single "Place Order" submit with no shipping form
//     (mirrors http-purchase.ts's empty-body POST /orders).
//   - Placing an order flips the page to the Orders section and selects the
//     new order, which fetches it from the BFF and renders it — that render
//     is this scenario's order-persisted check; there is no /orders/:id
//     route to navigate to separately.
//   - The 3D visualizer panel is always mounted regardless of section, so
//     its status badge can be read right after checkout.
//
// Metrics: k6/browser tests emit no http_req_* metrics (no k6/http calls
// happen here), so `checks` is the only signal — see
// purchaseFlowBrowserThresholds in config/thresholds.ts. `passed` (both the
// HTML badge and the JSON summary field) still comes out correct, since it's
// driven by the `checks` threshold result. The JSON summary's own
// `errorRate` field is a known exception — it defaults a missing
// http_req_failed to 1 (100%), not 0 — see tests/performance/k6/README.md.
//
// Locator note: this k6/browser version's Locator API has no .first()/.nth()
// and always requires a single DOM match. The page-level selector methods
// (page.click/textContent/waitForSelector) default to `strict: false` and
// explicitly act on the first match when a selector resolves to several
// elements (e.g. one "product-add-button" per catalog card) — used here on
// purpose instead of page.locator().

// Steps mirror http-purchase.ts's groups as `// step:` markers (k6 0.54's
// group() does not accept async callbacks) and share its outcome checks;
// HTTP status checks stay http-only.

import { browser } from "k6/browser";
import { check } from "k6";
import { BASE_URL } from "../../config/env";
import { purchaseFlowBrowserThresholds } from "../../config/thresholds";
import { buildSummaryOutputs } from "../../support/report";

// @types/k6 doesn't declare k6's global `console`; needed for the [DATA]
// harvest protocol.
declare const console: { log: (message: string) => void };

// Load shape (executor, VUs, iterations or duration) comes from the k6
// config Punch passes as `k6 run --config`: the workflow's spec.k6.config
// or an options/*.json preset. Exporting scenarios here would override it.
// Its scenario must set options.browser.type (the *-browser presets).
export const options = {
  thresholds: purchaseFlowBrowserThresholds,
  tags: { suite: "mini-commerce-browser-purchase" },
};

export default async function () {
  const page = await browser.newPage();

  try {
    // step: catalog: browse
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    // Caught, so an empty or broken catalog records a failed check instead
    // of throwing before the check runs.
    const catalogReady = await page
      .waitForSelector('[data-testid="product-add-button"]', {
        state: "visible",
      })
      .then(
        () => true,
        () => false,
      );
    const addButtons = catalogReady
      ? await page.$$('[data-testid="product-add-button"]')
      : [];
    check(addButtons, {
      "catalog has items": (b) => b.length > 0,
    });
    if (!catalogReady) return;

    // step: cart: add item
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
    check(panelText, {
      "cart contains added item": (t) =>
        typeof t === "string" && !!productName && t.includes(productName),
    });

    // step: checkout
    await page.click(
      '[data-testid="cart-checkout-panel"] button[type="submit"]',
    );
    await page.waitForSelector('[data-testid="home-orders"]', {
      state: "visible",
      timeout: 10000,
    });
    const orderIdText = await page.textContent(
      '[data-testid="home-orders"] p.font-mono',
    );
    check(orderIdText, {
      "checkout returns orderId": (t) =>
        typeof t === "string" && t.trim().length > 0,
    });
    // k6's browser module can't read the checkout response, so the "orders"
    // dataset row comes from the rendered order id (written by Punch only
    // with --produce orders).
    const renderedOrderId = orderIdText?.trim();
    if (renderedOrderId) console.log(`[DATA orders] ${renderedOrderId}`);

    // step: visualization: order sphere present
    // The badge reads Loading → Connected (or Error / Not Configured); only
    // Connected means the visualizer is live after the order. Poll up to 10 s.
    let vizStatus: string | null = null;
    for (let i = 0; i < 40 && vizStatus !== "Connected"; i++) {
      vizStatus = await page.textContent('[data-testid="visualizer-status"]');
      if (vizStatus !== "Connected") await page.waitForTimeout(250);
    }
    check(vizStatus, {
      "visualizer ok after order": (t) => t === "Connected",
    });
  } finally {
    await page.close();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Purchase Flow (Browser)",
    testType: "browser-purchase",
    targetUrl: BASE_URL,
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/browser-purchase-report.html",
    "/scripts/reports/browser-purchase-summary.json",
  );
}
