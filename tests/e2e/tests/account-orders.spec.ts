import { expect, test, type Page } from "@playwright/test";
import {
  installCommerceApiMock,
  makeOrder,
  type Product,
} from "../fixtures/commerce-api";
import { StorefrontPage } from "../pages/StorefrontPage";

const products: Product[] = [
  {
    productId: "prod_espresso_001",
    sku: "ESP-001",
    name: "Classic Espresso",
    description: "Rich, bold single-shot espresso.",
    category: "drink",
    price: { amountMinor: 350, currency: "USD" },
  },
];
const ana = {
  username: "ana",
  email: "ana@example.test",
  password: "espresso-demo",
};
const HOUR = 60 * 60 * 1000;

async function signIn(page: Page, identifier: string, password: string) {
  await page.getByTestId("account-signin").click();
  const dialog = page.getByTestId("signin-dialog");
  await dialog.getByLabel("Username or email").fill(identifier);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("account orders", () => {
  test("sign-in lands on Account with the latest order card (hot) above the list", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      seedOrders: [
        makeOrder("ord_old", new Date(Date.now() - 24 * HOUR).toISOString(), {
          email: "ana@example.test",
        }),
        makeOrder("ord_new", new Date().toISOString(), { username: "ana" }),
        makeOrder("ord_other", new Date().toISOString(), { username: "ben" }),
      ],
    });
    await page.goto("/");
    await signIn(page, "ana", "espresso-demo");

    await expect(page.getByTestId("orders-list")).toHaveAttribute(
      "data-scope",
      "account",
    );
    const card = page.getByTestId("latest-order-card");
    await expect(card).toContainText("ord_new");
    await expect(card.getByTestId("order-temperature")).toHaveAttribute(
      "data-temperature",
      "hot",
    );
    const list = page.getByTestId("orders-list");
    await expect(
      list.getByRole("button", { name: /ord_new/ }).first(),
    ).toBeVisible();
    await expect(list.getByRole("button", { name: /ord_old/ })).toBeVisible();
    await expect(list.getByRole("button", { name: /ord_other/ })).toHaveCount(
      0,
    );
  });

  test("Order for: Me is disabled when signed out; Someone else validates the recipient", async ({
    page,
  }) => {
    await installCommerceApiMock(page, { products });
    const storefront = new StorefrontPage(page);
    await page.goto("/");
    await storefront.addProductToCart("Classic Espresso");
    const group = page.getByRole("radiogroup", { name: "Order for" });
    await expect(
      group.getByRole("radio", { name: "Me", exact: true }),
    ).toBeDisabled();
    await expect(group.getByRole("radio", { name: "Guest" })).toBeChecked();
    await group.getByRole("radio", { name: "Someone else" }).check();
    await page.getByTestId("order-for-recipient").fill("x");
    await page.getByRole("button", { name: "Place Order" }).click();
    await expect(
      page.getByTestId("cart-checkout-panel").getByRole("alert"),
    ).toHaveText("Enter a username (3-32 chars) or an email");
  });

  test("an order for someone else lands on This browser with an owner label", async ({
    page,
  }) => {
    await installCommerceApiMock(page, { products });
    const storefront = new StorefrontPage(page);
    await page.goto("/");
    await storefront.addProductToCart("Classic Espresso");
    const group = page.getByRole("radiogroup", { name: "Order for" });
    await group.getByRole("radio", { name: "Someone else" }).check();
    await page.getByTestId("order-for-recipient").fill("Cara@Example.test");
    await page.getByRole("button", { name: "Place Order" }).click();

    await storefront.backToOrdersButton().click();
    await expect(page.getByTestId("orders-list")).toHaveAttribute(
      "data-scope",
      "mine",
    );
    await expect(page.getByTestId("order-owner").first()).toHaveText(
      "for cara@example.test",
    );
  });

  test("signing out drops the Account tab", async ({ page }) => {
    await installCommerceApiMock(page, { products, accounts: [ana] });
    await page.goto("/");
    await signIn(page, "ana", "espresso-demo");
    await expect(page.getByRole("tab", { name: "My account" })).toBeVisible();
    await page.getByTestId("account-signout").click();
    await expect(page.getByRole("tab", { name: "My account" })).toHaveCount(0);
    await expect(page.getByTestId("orders-list")).toHaveAttribute(
      "data-scope",
      "mine",
    );
  });
});
