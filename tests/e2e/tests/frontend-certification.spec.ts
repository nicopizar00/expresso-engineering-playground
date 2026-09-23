import { expect, type Page, test } from "@playwright/test";
import { installCommerceApiMock, type Product } from "../fixtures/commerce-api";

const products: Product[] = [
  {
    productId: "prod_espresso",
    sku: "ESP-001",
    name: "Classic Espresso",
    description: "Rich, bold espresso made from premium beans.",
    category: "drink",
    price: { amountMinor: 350, currency: "EUR" },
    inventory: 20,
  },
  {
    productId: "prod_cookie",
    sku: "COO-001",
    name: "Chocolate Chip Cookie",
    description: "A warm cookie for checkout confidence.",
    category: "food",
    price: { amountMinor: 300, currency: "EUR" },
    inventory: 12,
  },
  {
    productId: "prod_mug",
    sku: "MUG-001",
    name: "Expresso Mug",
    description: "Ceramic mug for the engineering playground.",
    category: "accessory",
    price: { amountMinor: 1200, currency: "EUR" },
    inventory: 8,
  },
];

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function installVisualizerMock(page: Page): Promise<void> {
  await page.route(/\/viz\/index\.html(\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body><main><h1>Visualizer Ready</h1><p>live · 3 items</p></main></body></html>",
    }),
  );
}

test("certifies catalog, cart CRUD, checkout, and order management", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await installCommerceApiMock(page, { products });
  await installVisualizerMock(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Catalog", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /Drinks/ })).toBeVisible();
  await page.getByRole("tab", { name: /Food/ }).click();
  await expect(page.getByText("Chocolate Chip Cookie")).toBeVisible();
  await page.getByRole("tab", { name: /All/ }).click();

  await page
    .getByRole("button", { name: "View details for Classic Espresso" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Classic Espresso" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Add to Cart/ }).click();
  await expect(dialog).toBeHidden();

  const cartButton = page.getByRole("button", {
    name: "Shopping cart with 1 items",
  });
  await expect(cartButton).toBeVisible();
  await cartButton.click();
  const cartDrawer = page.getByRole("dialog", { name: "Cart" });
  await expect(cartDrawer).toBeVisible();
  await cartDrawer.getByRole("button", { name: /Proceed to Checkout/ }).click();
  await expect(cartDrawer).toBeHidden();

  await expect(page.getByTestId("cart-checkout-panel")).toContainText(
    "Classic Espresso",
  );
  await page.getByRole("button", { name: "Place Order" }).click();

  await expect(page.getByTestId("home-orders")).toBeVisible();
  await expect(page.getByText("Order placed successfully")).toBeVisible();
  await page.getByRole("button", { name: "Start Preparing" }).click();
  await expect(page.getByText("Preparing")).toBeVisible();
  await page.getByRole("button", { name: "Mark as Prepared" }).click();
  await expect(page.getByText("Prepared")).toBeVisible();

  // Explicitly leave the order detail view, switch to another section, then
  // come back via the nav button — this must land on the Orders LIST, not
  // reopen the order that was just placed (regression coverage for the
  // selected-order-id state being lifted into page.tsx and properly reset).
  await page.getByRole("button", { name: /Back to orders/i }).click();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Catalog" })
    .click();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Orders" })
    .click();
  await expect(page.getByTestId("home-orders")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Orders", exact: true }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("keeps product mutation failures visible and out of console errors", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await installCommerceApiMock(page, { products, failAddToCart: true });
  await installVisualizerMock(page);

  await page.goto("/");
  await page
    .getByRole("button", { name: "Add Classic Espresso to cart" })
    .click();
  await expect(
    page.getByText("Could not add to cart. Please try again."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Shopping cart with 0 items" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("certifies dialog focus restore, shell navigation, performance copy, and visualizer embed", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await installCommerceApiMock(page, { products });
  await installVisualizerMock(page);

  await page.goto("/");
  const viewButton = page.getByRole("button", {
    name: "View details for Classic Espresso",
  });
  await viewButton.click();
  await expect(
    page.getByRole("dialog", { name: "Classic Espresso" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Classic Espresso" }),
  ).toBeHidden();
  await expect(viewButton).toBeFocused();

  const cartButton = page.getByRole("button", {
    name: "Shopping cart with 0 items",
  });
  await cartButton.click();
  await expect(page.getByRole("dialog", { name: "Cart" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Cart" })).toBeHidden();
  await expect(cartButton).toBeFocused();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Performance" })
    .click();
  await expect(page.getByTestId("home-performance")).toBeVisible();
  await expect(page.getByText(/simulated/i)).toBeVisible();

  // The 3D visualizer is the homepage's own always-mounted stage, not
  // per-section chrome: switching sections never remounts it, so it's still
  // here while the Performance section is active.
  await expect(page.getByTestId("visualizer-embed")).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title="3D Visualizer - Hello Room"]')
      .getByText("Visualizer Ready"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open Standalone/ }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page
    .getByRole("navigation", { name: "Mobile" })
    .getByRole("button", { name: "API" })
    .click();
  await expect(page.getByTestId("home-dev")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Developer Tools" }),
  ).toBeVisible();

  const unknownStatus = await page.evaluate(async () => {
    const response = await fetch("/api/bff/unhandled-fixture-probe");
    return response.status;
  });
  expect(unknownStatus).toBe(404);
  expect(browserErrors).toEqual([]);
});

test("keeps the same visualizer iframe DOM node across every section switch", async ({
  page,
}) => {
  await installCommerceApiMock(page, { products });
  await installVisualizerMock(page);
  await page.goto("/");

  const frame = page.locator('iframe[title="3D Visualizer - Hello Room"]');
  await expect(frame).toBeVisible();

  // Tag the live DOM node with a unique marker. If a section switch ever
  // remounts the visualizer, a fresh iframe element won't carry it.
  await frame.evaluate((el) => {
    (el as HTMLIFrameElement & { __identityMarker?: string }).__identityMarker =
      "same-iframe";
  });

  const nav = page.getByRole("navigation", { name: "Main" });
  for (const section of ["Orders", "Performance", "API", "Catalog"]) {
    await nav.getByRole("button", { name: section }).click();
    await expect(frame).toBeVisible();
    const marker = await frame.evaluate(
      (el) =>
        (el as HTMLIFrameElement & { __identityMarker?: string })
          .__identityMarker,
    );
    expect(marker, `iframe identity lost after switching to ${section}`).toBe(
      "same-iframe",
    );
  }
});
