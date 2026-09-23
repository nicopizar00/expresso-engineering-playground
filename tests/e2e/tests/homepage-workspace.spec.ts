import { expect, test, type Page } from "@playwright/test";
import { installCommerceApiMock, type Product } from "../fixtures/commerce-api";
import {
  expectIframeCanvasPainted,
  expectVisualActionable,
} from "../fixtures/visual-ui";

test.describe.configure({ mode: "parallel" });

const products: Product[] = [
  {
    productId: "prod_espresso_home",
    sku: "HOM-ESP-01",
    name: "Workspace Espresso",
    description: "Espresso shot used to drive the homepage workspace tests.",
    category: "drink",
    price: { amountMinor: 350, currency: "USD" },
    inventory: 25,
  },
  {
    productId: "prod_cookie_home",
    sku: "HOM-COO-01",
    name: "Workspace Cookie",
    description: "Cookie that keeps the food category populated.",
    category: "food",
    price: { amountMinor: 225, currency: "USD" },
    inventory: 12,
  },
];

const productUnderTest = products[0]!;

test.describe("homepage workspace - desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders catalog, cart/checkout, and the visualizer stage together", async ({
    page,
  }) => {
    await installHomeMocks(page);
    await page.goto("/");

    await expect(page.getByTestId("home-catalog")).toBeVisible();

    const iframe = page.getByTestId("visualizer-iframe");
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute("src", /\/viz\/index\.html\?embed=1$/);

    const catalogBox = await page.getByTestId("home-catalog").boundingBox();
    const vizBox = await page.getByTestId("visualizer-embed").boundingBox();
    expect(catalogBox).not.toBeNull();
    expect(vizBox).not.toBeNull();
    expect(
      vizBox!.x,
      "visualizer rail should sit to the right of the catalog, not above it",
    ).toBeGreaterThan(catalogBox!.x);
    expect(
      catalogBox!.width,
      "catalog column should be wider than the visualizer rail",
    ).toBeGreaterThan(vizBox!.width);

    await expect(page.getByTestId("cart-checkout-panel")).toBeVisible();

    await expectIframeCanvasPainted(page, iframe);

    const { scrollHeight, clientHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(
      scrollHeight,
      "homepage must not require page scrolling at this viewport",
    ).toBeLessThanOrEqual(clientHeight + 1);

    await expectVisualActionable(
      page.getByRole("button", {
        name: `Add ${productUnderTest.name} to cart`,
      }),
      { minHeight: 24, minWidth: 24 },
    );

    await page.screenshot({
      path: "test-results/home-desktop-1440x900.png",
      fullPage: false,
    });
  });

  test("cart panel updates after add-to-cart", async ({ page }) => {
    await installHomeMocks(page);
    await page.goto("/");

    const cartPanel = page.getByTestId("cart-checkout-panel");
    await expect(cartPanel).toContainText("Cart is empty");

    await page
      .getByRole("button", { name: `Add ${productUnderTest.name} to cart` })
      .first()
      .click();

    await expect(cartPanel.getByText(productUnderTest.name)).toBeVisible();
    await expect(cartPanel).toContainText("1 items");
    await expect(cartPanel).toContainText("USD");

    // Header cart badge also reflects the change.
    await expect(
      page.getByRole("button", { name: "Shopping cart with 1 items" }),
    ).toBeVisible();
  });

  test("header cart button still opens the drawer", async ({ page }) => {
    await installHomeMocks(page);
    await page.goto("/");

    await page
      .getByRole("button", { name: "Shopping cart with 0 items" })
      .click();
    await expect(page.getByRole("dialog", { name: "Cart" })).toBeVisible();
  });

  test("add-to-cart button is more compact than the legacy size", async ({
    page,
  }) => {
    await installHomeMocks(page);
    await page.goto("/");

    const addButton = page
      .getByRole("button", { name: `Add ${productUnderTest.name} to cart` })
      .first();
    const box = await addButton.boundingBox();
    expect(box).not.toBeNull();
    // Legacy size was ~40px tall (py-2 + text-sm). New compact button caps
    // under 36px while clearing the project min-target threshold (24px).
    expect(
      box!.height,
      "add-to-cart button must be visually tighter",
    ).toBeLessThanOrEqual(36);
    expect(
      box!.height,
      "add-to-cart button must still meet touch targets",
    ).toBeGreaterThanOrEqual(24);
  });
});

async function installHomeMocks(page: Page): Promise<void> {
  await installCommerceApiMock(page, { products });
  await page.route(/\/viz\/index\.html(\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/html",
      status: 200,
      body: [
        "<!doctype html>",
        "<html><head><title>Mock Visualizer</title>",
        "<style>html,body{margin:0;height:100%;background:#111;color:#fff;font-family:sans-serif;}",
        ".scene{position:absolute;inset:0;background:radial-gradient(circle at 30% 40%, #d4a574, #2a1810 70%);}",
        ".label{position:absolute;left:12px;bottom:12px;font-size:12px;opacity:.8;}",
        "</style></head>",
        "<body>",
        '<div class="scene"></div>',
        '<canvas width="640" height="480" aria-label="mock 3D scene"></canvas>',
        '<p class="label">live · 4 items</p>',
        "</body></html>",
      ].join(""),
    }),
  );
}
