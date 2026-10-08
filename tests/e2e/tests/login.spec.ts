import { expect, test } from "@playwright/test";
import { installCommerceApiMock, type Product } from "../fixtures/commerce-api";

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

test.describe("account control", () => {
  test("signs in by email, shows the chip, and signs out", async ({ page }) => {
    await installCommerceApiMock(page, { products, accounts: [ana] });
    await page.goto("/");

    await page.getByTestId("account-signin").click();
    const dialog = page.getByTestId("signin-dialog");
    await dialog.getByLabel("Username or email").fill("Ana@Example.test");
    await dialog.getByLabel("Password").fill("espresso-demo");
    await dialog.getByRole("button", { name: "Sign in" }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("account-chip")).toHaveText("ana");

    await page.getByTestId("account-signout").click();
    await expect(page.getByTestId("account-signin")).toBeVisible();
  });

  test("shows invalid credentials inline", async ({ page }) => {
    await installCommerceApiMock(page, { products, accounts: [ana] });
    await page.goto("/");
    await page.getByTestId("account-signin").click();
    const dialog = page.getByTestId("signin-dialog");
    await dialog.getByLabel("Username or email").fill("ana");
    await dialog.getByLabel("Password").fill("wrong-password");
    await dialog.getByRole("button", { name: "Sign in" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Invalid credentials");
  });

  test("register reports a taken email on the email field", async ({
    page,
  }) => {
    await installCommerceApiMock(page, { products, accounts: [ana] });
    await page.goto("/");
    await page.getByTestId("account-signin").click();
    const dialog = page.getByTestId("signin-dialog");
    await dialog.getByRole("tab", { name: "Register" }).click();
    await dialog.getByLabel("Username").fill("ana2");
    await dialog.getByLabel("Email").fill("ANA@example.test");
    await dialog.getByLabel("Password").fill("espresso-demo");
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Email taken");
    await expect(dialog.getByLabel("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
