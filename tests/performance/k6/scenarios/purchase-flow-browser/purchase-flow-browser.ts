// Purchase-flow-browser scenario — the browser-driven mirror of
// purchase-flow.ts. Same journey (add product, place order, land on the
// order it created), but exercised through a real Chromium tab against the
// web app instead of raw HTTP calls against the BFF.
//
// Web app UI shape (apps/web/app/page.tsx), as of this scenario's authoring:
//   - The catalog and the cart/checkout panel render on the same page (`/`),
//     side by side — no cart drawer to open, no /checkout route.
//   - Checkout is a single "Place Order" submit with no shipping form
//     (mirrors purchase-flow.ts's empty-body POST /checkout).
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

import { browser } from "k6/browser";
import { check } from "k6";
import { BASE_URL } from "../../config/env";
import { purchaseFlowBrowserThresholds } from "../../config/thresholds";
import { buildHtml, buildSummaryJson } from "../../support/report";

const VUS = Number(__ENV.VUS) || 1;
// Each VU drives a full Chromium instance, so default to a single run
// instead of purchase-flow.ts's time-based soak — a DURATION-based default
// here would silently multiply browser sessions. Set ITERATIONS explicitly
// to run more.
const ITERATIONS = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 1;

export const options = {
  scenarios: {
    purchase_flow_browser: {
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
  tags: { suite: "mini-commerce-purchase-flow-browser" },
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
      "order id rendered on the orders section": (t) =>
        typeof t === "string" && t.trim().length > 0,
    });

    const vizStatus = await page.textContent(
      '[data-testid="visualizer-status"]',
    );
    check(vizStatus, {
      "visualizer status is not Error": (t) => t !== "Error",
    });
  } finally {
    await page.close();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Purchase Flow (Browser)",
    testType: "purchase-flow-browser",
    targetUrl: BASE_URL,
  };
  return {
    "/scripts/reports/purchase-flow-browser-report.html": buildHtml(
      data,
      meta,
    ),
    "/scripts/reports/purchase-flow-browser-summary.json": JSON.stringify(
      buildSummaryJson(data, meta),
      null,
      2,
    ),
  };
}
