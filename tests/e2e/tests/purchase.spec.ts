import { expect, test, type Page } from "@playwright/test";
import {
  installCommerceApiMock as installCommerceRoutes,
  type Product,
} from "../fixtures/commerce-api";
import { CatalogPage } from "../pages/CatalogPage";

test.describe.configure({ mode: "parallel" });

type ApiMockMode = "happy" | "product-fetch-fails";

const products: Product[] = [
  {
    productId: "prod_espresso_001",
    sku: "ESP-001",
    name: "Classic Espresso",
    description:
      "Rich, bold single-shot espresso made from premium Arabica beans.",
    category: "drink",
    price: { amountMinor: 350, currency: "USD" },
    inventory: 50,
  },
  {
    productId: "prod_cookie_001",
    sku: "COO-001",
    name: "Chocolate Chip Cookie",
    description: "Warm, gooey chocolate chip cookie made with real butter.",
    category: "food",
    price: { amountMinor: 300, currency: "USD" },
    inventory: 30,
  },
];

const classicEspresso = products[0]!;

test.describe("End-to-end purchase flow", () => {
  test("happy path adds Classic Espresso, validates subtotal, and opens checkout", async ({
    page,
  }) => {
    await installCommerceApiMock(page);

    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.heading()).toBeVisible();
    await expect(catalog.heading()).toHaveText("Catalog");
    await expect(catalog.productName(classicEspresso.name)).toBeVisible();
    await expect(catalog.productName(classicEspresso.name)).toHaveText(
      classicEspresso.name,
    );

    await catalog.addItemToCart(classicEspresso.name);
    await expect(catalog.cartButton()).toHaveAccessibleName(
      "Shopping cart with 1 items",
    );

    const cart = await catalog.openCart();
    await expect(cart.productName(classicEspresso.name)).toBeVisible();
    await expect(cart.productName(classicEspresso.name)).toHaveText(
      classicEspresso.name,
    );
    await expect(cart.quantity(classicEspresso.name)).toHaveText("Qty: 1");
    await expect(cart.lineTotal(classicEspresso.name)).toHaveText("3.50 USD");
    await expect(cart.subtotal()).toHaveText("3.50 USD");

    await cart.clickCheckout();
    await expect(cart.dialog()).toBeHidden();
    await expect(page.getByTestId("cart-checkout-panel")).toContainText(
      classicEspresso.name,
    );
  });

  test("shows the product fetch error state when the catalog API returns 500", async ({
    page,
  }) => {
    await installCommerceApiMock(page, "product-fetch-fails");

    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.errorState()).toBeVisible();
    await expect(catalog.errorState()).toHaveText(
      /Failed to load products[\s\S]*Could not connect to the BFF|Failed to load products[\s\S]*GET \/catalog\/products/,
    );
  });
});

// Skipped: the homepage is desktop-only by design since the visualizer-stage
// redesign (docs/superpowers/specs/2026-09-10-homepage-visualizer-stage-design.md,
// Non-goals) — there is no responsive layout below ~1024px, so this scenario
// cannot pass as written. Not deleted: re-enable if mobile support returns.
test.describe.skip("End-to-end purchase flow - Mobile Chrome viewport", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("opens the cart drawer and reaches checkout on mobile", async ({
    page,
  }) => {
    await installCommerceApiMock(page);

    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.heading()).toBeVisible();
    await catalog.addItemToCart(classicEspresso.name);

    const cart = await catalog.openCart();
    await expect(cart.dialog()).toBeVisible();
    await expect(cart.subtotal()).toHaveText("3.50 USD");

    await cart.clickCheckout();
    await expect(cart.dialog()).toBeHidden();
    await expect(page.getByTestId("cart-checkout-panel")).toContainText(
      classicEspresso.name,
    );
  });
});

async function installCommerceApiMock(
  page: Page,
  mode: ApiMockMode = "happy",
): Promise<void> {
  await installCommerceRoutes(page, {
    products,
    failCatalog: mode === "product-fetch-fails",
  });
}
