import { expect, test, type Page } from "@playwright/test";
import {
  installCommerceApiMock,
  makeOrder,
  type Product,
} from "../fixtures/commerce-api";

const products: Product[] = [
  {
    productId: "prod_espresso_001",
    sku: "ESP-001",
    name: "Classic Espresso",
    description: "Rich, bold single-shot espresso.",
    category: "drink",
    price: { amountMinor: 350, currency: "USD" },
    inventory: 50,
  },
];
const ana = {
  username: "ana",
  email: "ana@example.test",
  password: "espresso-demo",
};
const HOUR = 60 * 60 * 1000;

async function signIn(page: Page) {
  await page.getByTestId("account-signin").click();
  const dialog = page.getByTestId("signin-dialog");
  await dialog.getByLabel("Username or email").fill(ana.username);
  await dialog.getByLabel("Password").fill(ana.password);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("hot coffee banner", () => {
  test("signed out: no banner and no hot-status request", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/account/hot-status")) calls.push(r.url());
    });
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      seedOrders: [
        makeOrder("ord_hot", new Date().toISOString(), { username: "ana" }),
      ],
    });
    await page.goto("/");
    await expect(page.getByTestId("account-signin")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("hot-coffee-banner")).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test("signed in with two hot coffees: count and countdown", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      seedOrders: [
        makeOrder("ord_a", new Date().toISOString(), { username: "ana" }),
        makeOrder("ord_b", new Date().toISOString(), {
          email: "ana@example.test",
        }),
        makeOrder("ord_cold", new Date(Date.now() - HOUR).toISOString(), {
          username: "ana",
        }),
        makeOrder("ord_ben", new Date().toISOString(), { username: "ben" }),
      ],
    });
    await page.goto("/");
    await signIn(page);
    const banner = page.getByTestId("hot-coffee-banner");
    await expect(banner.getByTestId("hot-coffee-count")).toHaveText(
      "☕ 2 hot coffees",
    );
    await expect(banner.getByTestId("hot-coffee-count")).toHaveAttribute(
      "role",
      "status",
    );
    await expect(banner.getByTestId("hot-coffee-countdown")).toHaveText(
      /next one cools in \d+:\d{2}/,
    );
  });

  test("banner disappears when the last coffee cools", async ({ page }) => {
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      coolDownMs: 4_000,
      seedOrders: [
        makeOrder("ord_a", new Date().toISOString(), { username: "ana" }),
      ],
    });
    await page.goto("/");
    await signIn(page);
    const banner = page.getByTestId("hot-coffee-banner");
    await expect(banner.getByTestId("hot-coffee-count")).toHaveText(
      "☕ 1 hot coffee",
    );
    // Refetch fires 500 ms after nextCoolsAt — well before the 15 s poll.
    await expect(banner).toHaveCount(0, { timeout: 8_000 });
  });

  test("signing out hides the banner", async ({ page }) => {
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      seedOrders: [
        makeOrder("ord_a", new Date().toISOString(), { username: "ana" }),
      ],
    });
    await page.goto("/");
    await signIn(page);
    await expect(page.getByTestId("hot-coffee-banner")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByTestId("hot-coffee-banner")).toHaveCount(0);
  });
});
