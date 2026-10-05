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

async function openOrders(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Orders" })
    .click();
  await expect(page.getByTestId("home-orders")).toBeVisible();
  await page
    .getByRole("tablist", { name: "Order scope" })
    .getByRole("tab", { name: "All orders" })
    .click();
  await expect(page.getByTestId("orders-list")).toHaveAttribute(
    "data-scope",
    "all",
  );
}

function orderRow(page: Page, orderId: string) {
  return page.getByRole("button", { name: new RegExp(orderId) });
}

test.describe("order temperature badge", () => {
  test("a freshly placed order shows Hot in the list and the detail", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      seedOrders: [makeOrder("ord_hot_001", new Date().toISOString())],
    });
    await openOrders(page);

    const row = orderRow(page, "ord_hot_001");
    await expect(row.getByTestId("order-temperature")).toHaveText("Hot");
    await row.click();
    await expect(page.getByTestId("order-temperature")).toHaveAttribute(
      "data-temperature",
      "hot",
    );
  });

  test("an old order shows Cold", async ({ page }) => {
    await installCommerceApiMock(page, {
      products,
      seedOrders: [
        makeOrder("ord_cold_001", new Date(Date.now() - 600_000).toISOString()),
      ],
    });
    await openOrders(page);

    await expect(
      orderRow(page, "ord_cold_001").getByTestId("order-temperature"),
    ).toHaveText("Cold");
  });

  test("the detail flips from Hot to Cold at coolsAt without a reload", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      coolDownMs: 3_000,
      seedOrders: [makeOrder("ord_flip_001", new Date().toISOString())],
    });
    await openOrders(page);
    await orderRow(page, "ord_flip_001").click();

    const badge = page.getByTestId("order-temperature");
    await expect(badge).toHaveText("Hot");
    await expect(badge).toHaveText("Cold", { timeout: 8_000 });
  });

  test("the detail still flips to Cold when the refetch at coolsAt fails once", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      coolDownMs: 3_000,
      failStatusCalls: [2],
      seedOrders: [makeOrder("ord_retry_001", new Date().toISOString())],
    });
    await openOrders(page);
    await orderRow(page, "ord_retry_001").click();

    const badge = page.getByTestId("order-temperature");
    await expect(badge).toHaveText("Hot");
    await expect(badge).toHaveText("Cold", { timeout: 6_000 });
  });

  test("the list flips a row from Hot to Cold at coolsAt without a reload", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      coolDownMs: 3_000,
      seedOrders: [makeOrder("ord_listflip_001", new Date().toISOString())],
    });
    await openOrders(page);
    const badge = orderRow(page, "ord_listflip_001").getByTestId(
      "order-temperature",
    );
    await expect(badge).toHaveText("Hot");
    await expect(badge).toHaveText("Cold", { timeout: 8_000 });
  });

  test("My orders defaults on and excludes orders this browser did not place", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      seedOrders: [makeOrder("ord_someone_else", new Date().toISOString())],
    });
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: "Orders" })
      .click();
    const list = page.getByTestId("orders-list");
    await expect(list).toHaveAttribute("data-scope", "mine");
    await expect(list).toContainText("You have not placed any orders yet");
    await expect(list).not.toContainText("ord_someone_else");
  });
});
