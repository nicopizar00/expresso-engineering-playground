import { expect, test, type Page, type Route } from "@playwright/test";
import { expectIframeCanvasPainted } from "../fixtures/visual-ui";

test.describe.configure({ mode: "parallel" });

type Money = { amountMinor: number; currency: "USD" };

type Product = {
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: "drink" | "food" | "accessory";
  price: Money;
  inventory: number;
};

type CartItem = {
  itemId: string;
  productId: string;
  name: string;
  unitPrice: Money;
  quantity: number;
  lineTotal: Money;
};

const products: Product[] = [
  {
    productId: "prod_espresso_home",
    sku: "HOM-ESP-01",
    name: "Workspace Espresso",
    description: "Espresso shot used to drive the homepage workspace tests.",
    category: "drink",
    price: money(350),
    inventory: 25,
  },
  {
    productId: "prod_cookie_home",
    sku: "HOM-COO-01",
    name: "Workspace Cookie",
    description: "Cookie that keeps the food category populated.",
    category: "food",
    price: money(225),
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
      vizBox!.y,
      "visualizer stage should sit above the catalog, not beside it",
    ).toBeLessThan(catalogBox!.y);
    expect(
      vizBox!.width,
      "visualizer stage should be the widest element on the page",
    ).toBeGreaterThan(catalogBox!.width);

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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

async function installHomeMocks(page: Page): Promise<void> {
  let cartItems: CartItem[] = [];

  await page.addInitScript(() => {
    localStorage.removeItem("expresso_demo_mode");
  });

  // Serve a non-trivial mock document so expectIframeCanvasPainted has pixels
  // to inspect. SVG gradient guarantees pixel variance regardless of WebGL
  // setup in CI.
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

  await page.route("**/api/bff/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/bff/, "") || "/";
    const method = request.method();

    if (method === "GET" && path === "/health") {
      return fulfillJson(route, 200, {
        checks: { db: "ok" },
        service: "bff",
        status: "ok",
        uptimeSeconds: 100,
        version: "home-e2e",
      });
    }
    if (method === "GET" && path === "/catalog/products") {
      return fulfillJson(route, 200, { items: products });
    }
    if (method === "GET" && path === "/cart") {
      return fulfillJson(route, 200, buildCart(cartItems));
    }
    if (method === "POST" && path === "/cart/items") {
      const body = request.postDataJSON() as {
        productId?: string;
        quantity?: number;
      } | null;
      const product = products.find((p) => p.productId === body?.productId);
      if (!product)
        return fulfillJson(route, 404, { message: "Product not found" });
      cartItems = upsertCartItem(cartItems, product, body?.quantity ?? 1);
      return fulfillJson(route, 200, buildCart(cartItems));
    }
    if (method === "GET" && path === "/orders") {
      return fulfillJson(route, 200, { items: [] });
    }
    return route.fallback();
  });
}

function money(amountMinor: number): Money {
  return { amountMinor, currency: "USD" };
}

function buildCart(items: CartItem[]) {
  const amountMinor = items.reduce(
    (sum, item) => sum + item.lineTotal.amountMinor,
    0,
  );
  return {
    cartId: "cart_home",
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    total: money(amountMinor),
    updatedAt: "2026-06-07T00:00:00.000Z",
  };
}

function upsertCartItem(
  items: CartItem[],
  product: Product,
  quantity: number,
): CartItem[] {
  const existing = items.find((i) => i.productId === product.productId);
  if (!existing) {
    return [
      ...items,
      {
        itemId: `ci_home_${items.length + 1}`,
        productId: product.productId,
        name: product.name,
        unitPrice: product.price,
        quantity,
        lineTotal: money(product.price.amountMinor * quantity),
      },
    ];
  }
  return items.map((item) =>
    item.productId === product.productId
      ? {
          ...item,
          quantity: item.quantity + quantity,
          lineTotal: money(
            item.unitPrice.amountMinor * (item.quantity + quantity),
          ),
        }
      : item,
  );
}

function fulfillJson(
  route: Route,
  status: number,
  body: unknown,
): Promise<void> {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}
