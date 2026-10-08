import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  installCommerceApiMock,
  type CommerceApiMockOptions,
  type Product,
} from "../fixtures/commerce-api";
import { StorefrontPage } from "../pages/StorefrontPage";

test.describe.configure({ mode: "parallel" });

const products: Product[] = [
  {
    productId: "prod_espresso_001",
    sku: "ESP-001",
    name: "Classic Espresso",
    description:
      "Rich, bold single-shot espresso made from premium Arabica beans.",
    category: "drink",
    price: { amountMinor: 350, currency: "USD" },
  },
  {
    productId: "prod_cookie_001",
    sku: "COO-001",
    name: "Chocolate Chip Cookie",
    description: "Warm, gooey chocolate chip cookie made with real butter.",
    category: "food",
    price: { amountMinor: 300, currency: "USD" },
  },
  {
    productId: "prod_notebook_001",
    sku: "NOT-001",
    name: "Expresso Notebook",
    description:
      "A5 lined notebook with soft-touch cover and Expresso branding.",
    category: "accessory",
    price: { amountMinor: 1200, currency: "USD" },
  },
];

const productUnderTest = products[0]!;

const viewportProfiles = [
  {
    name: "Desktop Chrome",
    use: { viewport: { width: 1440, height: 900 } },
  },
  // Mobile Chrome removed: the homepage (see prepareCheckout →
  // storefront.gotoCatalog()) is desktop-only by design since the
  // visualizer-stage redesign
  // (docs/superpowers/specs/2026-09-10-homepage-visualizer-stage-design.md,
  // Non-goals) — no responsive layout exists below ~1024px.
];

for (const profile of viewportProfiles) {
  test.describe(`MVC-01 Catalog checkout - ${profile.name}`, () => {
    test.use(profile.use);

    test("completes catalog to cart to place order to my orders @smoke", async ({
      page,
    }) => {
      const storefront = await prepareCheckout(page);

      await expect(storefront.checkoutSummaryHeading()).toBeVisible();
      await expect(
        storefront.checkoutLineItem(productUnderTest.name),
      ).toBeVisible();

      await expectActionable(storefront.placeOrderButton());
      await storefront.placeOrder();

      await expect(page.getByTestId("home-orders")).toBeVisible();
      await expect(storefront.orderDetailsHeading()).toBeVisible();
      await expect(storefront.orderSuccessAlert()).toBeVisible();
      await expect(storefront.orderTemperature()).toHaveAttribute(
        "data-temperature",
        "hot",
      );

      const orderId = await storefront.currentOrderId();
      await expect(storefront.visibleOrderId(orderId)).toBeVisible();
      await expect(
        storefront.orderLineItem(productUnderTest.name),
      ).toBeVisible();

      await storefront.backToOrdersButton().click();
      await expect(storefront.ordersScopeTab("This browser")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(storefront.ordersList()).toContainText(orderId);
      await expect(
        page
          .getByRole("button", { name: new RegExp(orderId) })
          .getByTestId("order-temperature"),
      ).toHaveText("Hot");
    });

    test("surfaces a checkout network drop without losing cart context", async ({
      page,
    }) => {
      const storefront = await prepareCheckout(page, {
        checkoutFailure: "network-drop",
      });

      await expectActionable(storefront.placeOrderButton());
      await storefront.placeOrder();

      await expect(storefront.checkoutPanel()).toBeVisible();
      await expect(storefront.checkoutAlert()).toContainText(
        "An unexpected error occurred. Please try again.",
      );
      await expect(
        storefront.checkoutLineItem(productUnderTest.name),
      ).toBeVisible();
      await expect(storefront.placeOrderButton()).toBeEnabled();
    });
  });
}

async function prepareCheckout(
  page: Page,
  options: Omit<CommerceApiMockOptions, "products"> = {},
): Promise<StorefrontPage> {
  await installCommerceApiMock(page, { products, ...options });

  const storefront = new StorefrontPage(page);
  await storefront.gotoCatalog();

  await expect(storefront.catalogHeading()).toBeVisible();
  await expect(storefront.categoryTab("All")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(storefront.productHeading(productUnderTest.name)).toBeVisible();

  await expectActionable(storefront.categoryTab("Drinks"));
  await storefront.filterProductsByCategory("Drinks");
  await expect(storefront.categoryTab("Drinks")).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await expectActionable(storefront.addToCartButton(productUnderTest.name));
  await storefront.addProductToCart(productUnderTest.name);
  await expect(storefront.cartButton()).toHaveAccessibleName(
    "Shopping cart with 1 items",
  );

  await expectActionable(storefront.cartButton());
  await storefront.openCart();
  await expect(storefront.cartDialog()).toBeVisible();
  await expect(storefront.cartLineItem(productUnderTest.name)).toBeVisible();

  await expectActionable(storefront.proceedToCheckoutLink());
  await storefront.proceedToCheckoutFromCartDrawer();
  await expect(storefront.checkoutPanel()).toBeVisible();

  return storefront;
}

async function expectActionable(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
}
