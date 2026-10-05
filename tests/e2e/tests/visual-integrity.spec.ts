import { expect, test, type Page } from "@playwright/test";
import { installCommerceApiMock, type Product } from "../fixtures/commerce-api";
import {
  clickVisualCenter,
  expectCenterHits,
  expectCssUtilityContract,
  expectInViewport,
  expectNoHorizontalOverflow,
  expectVisualActionable,
} from "../fixtures/visual-ui";

test.describe.configure({ mode: "parallel" });

const products: Product[] = [
  {
    productId: "prod_espresso_visual",
    sku: "VIS-ESP-01",
    name: "Classic Espresso",
    description: "Rich single-shot espresso for visual regression coverage.",
    category: "drink",
    price: { amountMinor: 350, currency: "USD" },
    inventory: 50,
  },
  {
    productId: "prod_cookie_visual",
    sku: "VIS-COO-01",
    name: "Chocolate Cookie",
    description: "Chocolate cookie used to keep the catalog grid non-empty.",
    category: "food",
    price: { amountMinor: 300, currency: "USD" },
    inventory: 30,
  },
  {
    productId: "prod_notebook_visual",
    sku: "VIS-NOT-01",
    name: "Expresso Notebook",
    description: "Notebook used to exercise accessory category styling.",
    category: "accessory",
    price: { amountMinor: 1200, currency: "USD" },
    inventory: 25,
  },
];

const productUnderTest = products[0]!;

test.describe("visual UI integrity - desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("keeps the CSS utility contract and desktop header hitboxes intact", async ({
    page,
  }) => {
    await installVisualMocks(page);
    await page.goto("/");

    await expectCssUtilityContract(page);
    await expectNoHorizontalOverflow(page);

    for (const label of ["Catalog", "Orders", "Performance", "API"]) {
      const navButton = page
        .getByRole("navigation", { name: "Main" })
        .getByRole("button", { name: label });
      await expectVisualActionable(navButton, { minHeight: 32, minWidth: 32 });
    }

    await expectVisualActionable(cartButton(page), {
      minHeight: 40,
      minWidth: 40,
    });
    await expect(
      page.getByRole("button", { name: "Toggle menu" }),
    ).toBeHidden();

    await expect(page.getByTestId("visualizer-embed")).toBeVisible();

    await clickVisualCenter(
      page
        .getByRole("navigation", { name: "Main" })
        .getByRole("button", { name: "API" }),
    );
    await expect(page.getByTestId("home-dev")).toBeVisible();
  });

  test("opens product quick view and keeps modal controls visually actionable", async ({
    page,
  }) => {
    await installVisualMocks(page);
    await page.goto("/");

    const productVisual = page.getByRole("button", {
      name: `View details for ${productUnderTest.name}`,
    });
    await expectVisualActionable(productVisual, {
      minHeight: 180,
      minWidth: 240,
    });

    const visualBox = await productVisual.boundingBox();
    expect(visualBox).not.toBeNull();
    expect(visualBox!.width / visualBox!.height).toBeGreaterThan(1.25);
    expect(visualBox!.width / visualBox!.height).toBeLessThan(1.45);

    await clickVisualCenter(productVisual);

    const dialog = page.getByRole("dialog", { name: productUnderTest.name });
    await expect(dialog).toBeVisible();
    await expectInViewport(dialog);

    await expectVisualActionable(dialog.getByRole("button", { name: "Close" }));
    await expectVisualActionable(
      dialog.getByRole("button", { name: "Add to Cart" }),
      {
        minHeight: 40,
        minWidth: 160,
      },
    );

    await clickVisualCenter(
      dialog.getByRole("button", { name: "Add to Cart" }),
    );
    await expect(cartButton(page)).toHaveAccessibleName(
      "Shopping cart with 1 items",
    );
    await expect(dialog).toBeHidden({ timeout: 2_500 });
  });

  test("opens cart drawer from a coordinate click and reaches checkout", async ({
    page,
  }) => {
    await installVisualMocks(page);
    await page.goto("/");

    await clickVisualCenter(
      page.getByRole("button", {
        name: `Add ${productUnderTest.name} to cart`,
      }),
    );
    await expect(cartButton(page)).toHaveAccessibleName(
      "Shopping cart with 1 items",
    );

    await clickVisualCenter(cartButton(page));

    const drawer = page.getByRole("dialog", { name: "Cart" });
    await expect(drawer).toBeVisible();
    await expectInViewport(drawer);
    await expectCenterHits(drawer);

    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(
      drawerBox!.y,
      "drawer must sit below the sticky header",
    ).toBeGreaterThan(40);

    await expectVisualActionable(
      drawer.getByRole("button", { name: "Close cart" }),
    );

    const checkout = drawer.getByRole("button", {
      name: /Proceed to Checkout/i,
    });
    await expectVisualActionable(checkout, { minHeight: 40, minWidth: 200 });
    await clickVisualCenter(checkout);
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId("cart-checkout-panel")).toContainText(
      productUnderTest.name,
    );
  });

  test("places an order and shows it hot through visual controls", async ({
    page,
  }) => {
    await installVisualMocks(page);
    await addProductAndOpenCheckout(page);

    const placeOrder = page.getByRole("button", { name: "Place Order" });
    await expectVisualActionable(placeOrder, { minHeight: 40, minWidth: 240 });
    await clickVisualCenter(placeOrder);

    await expect(page.getByTestId("home-orders")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Order Details" }),
    ).toBeVisible();
    const badge = page.getByTestId("order-temperature");
    await expect(badge).toHaveText("Hot");

    const back = page.getByRole("button", { name: /Back to orders/i });
    await back.scrollIntoViewIfNeeded();
    await expectVisualActionable(back, { minHeight: 20, minWidth: 80 });
    // The text-style Back link renders ~21.5px tall, below clickVisualCenter's
    // 24px default, so click after the explicit 20px actionable check.
    await back.click();

    const mine = page
      .getByRole("tablist", { name: "Order scope" })
      .getByRole("tab", { name: "My orders" });
    await expectVisualActionable(mine, { minHeight: 28, minWidth: 70 });
    await expect(page.getByTestId("orders-list")).toHaveAttribute(
      "data-scope",
      "mine",
    );
  });

  test("renders the visualizer stage with a mocked iframe document", async ({
    page,
  }) => {
    await installVisualMocks(page);
    await page.goto("/");

    const frame = page.locator('iframe[title="3D Visualizer - Hello Room"]');
    await expect(frame).toHaveAttribute("src", /\/viz\/index\.html\?embed=1$/);

    const vizSection = page.locator(".home-stage-viz");
    const vizBox = await vizSection.boundingBox();
    const frameBox = await frame.boundingBox();
    expect(frameBox).not.toBeNull();
    expect(vizBox).not.toBeNull();
    expect(
      frameBox!.y + frameBox!.height,
      "visualizer iframe must stay contained inside its section, not overflow into the strip below",
    ).toBeLessThanOrEqual(vizBox!.y + vizBox!.height + 1);
    expect(
      frameBox!.height,
      "visualizer iframe should be inspectable, not collapsed to nothing",
    ).toBeGreaterThan(40);

    await expectVisualActionable(
      page.getByRole("button", { name: /Reload/i }),
      {
        minHeight: 24,
        minWidth: 24,
      },
    );
    await expectVisualActionable(
      page.getByRole("link", { name: /Open Standalone/i }),
      {
        minHeight: 24,
        minWidth: 24,
      },
    );
  });
});

for (const viewport of [
  { height: 844, label: "mobile 390", width: 390 },
  { height: 568, label: "mobile 320", width: 320 },
]) {
  test.describe(`visual UI integrity - ${viewport.label}`, () => {
    test.use({
      hasTouch: true,
      isMobile: true,
      viewport: { width: viewport.width, height: viewport.height },
    });

    test("keeps mobile header controls in viewport and navigates from menu", async ({
      page,
    }) => {
      await installVisualMocks(page);
      await page.goto("/");

      await expectNoHorizontalOverflow(page);
      await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

      await expectVisualActionable(cartButton(page), {
        minHeight: 40,
        minWidth: 40,
      });

      const menuButton = page.getByRole("button", { name: "Toggle menu" });
      await expectVisualActionable(menuButton, { minHeight: 40, minWidth: 40 });
      await clickVisualCenter(menuButton);

      const mobileNav = page.getByRole("navigation", { name: "Mobile" });
      await expect(mobileNav).toBeVisible();

      const ordersButton = mobileNav.getByRole("button", { name: "Orders" });
      await expectVisualActionable(ordersButton, {
        minHeight: 40,
        minWidth: 120,
      });
      await clickVisualCenter(ordersButton);
      await expect(page.getByTestId("home-orders")).toBeVisible();
    });
  });
}

async function addProductAndOpenCheckout(page: Page): Promise<void> {
  await page.goto("/");
  await clickVisualCenter(
    page.getByRole("button", { name: `Add ${productUnderTest.name} to cart` }),
  );
  await clickVisualCenter(cartButton(page));
  await clickVisualCenter(
    page.getByRole("button", { name: /Proceed to Checkout/i }),
  );
  await expect(page.getByTestId("cart-checkout-panel")).toContainText(
    productUnderTest.name,
  );
}

async function installVisualMocks(page: Page): Promise<void> {
  await installCommerceApiMock(page, { products });
  await page.route(/\/viz\/index\.html(\?.*)?$/, (route) =>
    route.fulfill({
      body: [
        "<!doctype html>",
        "<html><head><title>Mock Visualizer</title></head>",
        '<body style="margin:0;font-family:sans-serif;background:#fff;color:#111;">',
        '<main style="min-height:360px;display:grid;place-items:center;">',
        '<canvas width="640" height="360" aria-label="mock 3D scene"></canvas>',
        "<p>live · 4 items</p>",
        "</main>",
        "</body></html>",
      ].join(""),
      contentType: "text/html",
      status: 200,
    }),
  );
}

function cartButton(page: Page) {
  return page.getByRole("button", { name: /Shopping cart with \d+ items/i });
}
