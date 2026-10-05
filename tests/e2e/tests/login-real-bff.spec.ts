import { expect, test, type Page } from "@playwright/test";
import { StorefrontPage } from "../pages/StorefrontPage";

// Exercises the REAL BFF — no route mocking. Requires `./dev up` (Postgres +
// BFF healthy), same as session-isolation.spec.ts.
const suffix = () => Math.random().toString(16).slice(2, 10);

async function register(page: Page, username: string, email: string) {
  await page.getByTestId("account-signin").click();
  const dialog = page.getByTestId("signin-dialog");
  await dialog.getByRole("tab", { name: "Register" }).click();
  await dialog.getByLabel("Username").fill(username);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill("e2e-password");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("account-chip")).toHaveText(username);
}

test.describe("Login and account orders (real BFF)", () => {
  test("register, order for self, see it hot on the account card", async ({
    page,
  }) => {
    const s = suffix();
    const storefront = new StorefrontPage(page);
    await storefront.gotoCatalog();
    await register(page, `e2e_${s}`, `e2e_${s}@example.test`);

    await storefront.gotoCatalog();
    await storefront.addProductToCart("Cup of Coffee");
    await storefront.openCart();
    await storefront.proceedToCheckoutFromCartDrawer();
    await expect(
      page
        .getByRole("radiogroup", { name: "Order for" })
        .getByRole("radio", { name: "Me", exact: true }),
    ).toBeChecked();
    await storefront.placeOrder();
    const orderId = await storefront.currentOrderId();

    await storefront.backToOrdersButton().click();
    const card = page.getByTestId("latest-order-card");
    await expect(card).toContainText(orderId);
    await expect(card.getByTestId("order-temperature")).toHaveAttribute(
      "data-temperature",
      "hot",
    );
  });

  test("an order for an unregistered email appears after that email registers elsewhere", async ({
    browser,
  }) => {
    const s = suffix();
    const email = `later_${s}@example.test`;
    const placer = await browser.newContext();
    const recipient = await browser.newContext();
    try {
      const a = new StorefrontPage(await placer.newPage());
      await a.gotoCatalog();
      await a.addProductToCart("Cup of Coffee");
      await a.openCart();
      await a.proceedToCheckoutFromCartDrawer();
      const group = a.page.getByRole("radiogroup", { name: "Order for" });
      await group.getByRole("radio", { name: "Someone else" }).check();
      await a.page.getByTestId("order-for-recipient").fill(email.toUpperCase());
      await a.placeOrder();
      const orderId = await a.currentOrderId();

      const b = new StorefrontPage(await recipient.newPage());
      await b.gotoCatalog();
      await register(b.page, `later_${s}`, email);
      await expect(b.page.getByTestId("latest-order-card")).toContainText(
        orderId,
      );
    } finally {
      await placer.close();
      await recipient.close();
    }
  });

  test("guest checkout still works and never shows the Account tab", async ({
    page,
  }) => {
    const storefront = new StorefrontPage(page);
    await storefront.gotoCatalog();
    await storefront.addProductToCart("Cup of Coffee");
    await storefront.openCart();
    await storefront.proceedToCheckoutFromCartDrawer();
    await expect(
      page
        .getByRole("radiogroup", { name: "Order for" })
        .getByRole("radio", { name: "Guest", exact: true }),
    ).toBeChecked();
    await storefront.placeOrder();
    await expect(storefront.orderSuccessAlert()).toBeVisible();
    await expect(page.getByRole("tab", { name: "My account" })).toHaveCount(0);
  });
});
