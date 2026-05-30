import { expect, test, type Page, type Route } from '@playwright/test';
import {
  clickVisualCenter,
  expectCenterHits,
  expectCssUtilityContract,
  expectInViewport,
  expectNoHorizontalOverflow,
  expectVisualActionable,
} from '../fixtures/visual-ui';

test.describe.configure({ mode: 'parallel' });

type Money = {
  amountMinor: number;
  currency: 'USD';
};

type Product = {
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: 'drink' | 'food' | 'accessory';
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

type Cart = {
  cartId: string;
  items: CartItem[];
  itemCount: number;
  total: Money;
  updatedAt: string;
};

type OrderStatus = 'pending' | 'preparing' | 'prepared' | 'cancelled';

type Order = {
  orderId: string;
  customerName: string;
  status: OrderStatus;
  lines: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: Money;
    lineTotal: Money;
  }>;
  total: Money;
  placedAt: string;
  updatedAt: string;
};

const now = '2026-05-29T12:00:00.000Z';

const products: Product[] = [
  {
    productId: 'prod_espresso_visual',
    sku: 'VIS-ESP-01',
    name: 'Classic Espresso',
    description: 'Rich single-shot espresso for visual regression coverage.',
    category: 'drink',
    price: money(350),
    inventory: 50,
  },
  {
    productId: 'prod_cookie_visual',
    sku: 'VIS-COO-01',
    name: 'Chocolate Cookie',
    description: 'Chocolate cookie used to keep the catalog grid non-empty.',
    category: 'food',
    price: money(300),
    inventory: 30,
  },
  {
    productId: 'prod_notebook_visual',
    sku: 'VIS-NOT-01',
    name: 'Expresso Notebook',
    description: 'Notebook used to exercise accessory category styling.',
    category: 'accessory',
    price: money(1200),
    inventory: 25,
  },
];

const productUnderTest = products[0]!;

test.describe('visual UI integrity - desktop', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('keeps the CSS utility contract and desktop header hitboxes intact', async ({
    page,
  }) => {
    await installVisualMocks(page);
    await page.goto('/');

    await expectCssUtilityContract(page);
    await expectNoHorizontalOverflow(page);

    for (const label of ['Catalog', 'Orders', 'Performance', '3D', 'API']) {
      const navLink = page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: label });
      await expectVisualActionable(navLink, { minHeight: 32, minWidth: 32 });
    }

    await expectVisualActionable(cartButton(page), { minHeight: 40, minWidth: 40 });
    await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeHidden();

    await clickVisualCenter(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: '3D' })
    );
    await expect(page).toHaveURL(/\/visualizer$/);

    await clickVisualCenter(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'API' })
    );
    await expect(page).toHaveURL(/\/dev$/);
  });

  test('opens product quick view and keeps modal controls visually actionable', async ({
    page,
  }) => {
    await installVisualMocks(page);
    await page.goto('/');

    const productVisual = page.getByRole('button', {
      name: `View details for ${productUnderTest.name}`,
    });
    await expectVisualActionable(productVisual, { minHeight: 180, minWidth: 240 });

    const visualBox = await productVisual.boundingBox();
    expect(visualBox).not.toBeNull();
    expect(visualBox!.width / visualBox!.height).toBeGreaterThan(1.25);
    expect(visualBox!.width / visualBox!.height).toBeLessThan(1.45);

    await clickVisualCenter(productVisual);

    const dialog = page.getByRole('dialog', { name: productUnderTest.name });
    await expect(dialog).toBeVisible();
    await expectInViewport(dialog);

    await expectVisualActionable(dialog.getByRole('button', { name: 'Close' }));
    await expectVisualActionable(dialog.getByRole('button', { name: 'Increase quantity' }));
    await expectVisualActionable(dialog.getByRole('button', { name: 'Add to Cart' }), {
      minHeight: 40,
      minWidth: 160,
    });

    await clickVisualCenter(dialog.getByRole('button', { name: 'Add to Cart' }));
    await expect(cartButton(page)).toHaveAccessibleName('Shopping cart with 1 items');
    await expect(dialog).toBeHidden({ timeout: 2_500 });
  });

  test('opens cart drawer from a coordinate click and reaches checkout', async ({
    page,
  }) => {
    await installVisualMocks(page);
    await page.goto('/');

    await clickVisualCenter(
      page.getByRole('button', { name: `Add ${productUnderTest.name} to cart` })
    );
    await expect(cartButton(page)).toHaveAccessibleName('Shopping cart with 1 items');

    await clickVisualCenter(cartButton(page));

    const drawer = page.getByRole('dialog', { name: 'Cart' });
    await expect(drawer).toBeVisible();
    await expectInViewport(drawer);
    await expectCenterHits(drawer);

    const drawerBox = await drawer.boundingBox();
    const viewport = page.viewportSize();
    expect(drawerBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(drawerBox!.y, 'drawer must be fixed to the top of the viewport').toBe(0);
    expect(
      drawerBox!.x + drawerBox!.width,
      'drawer must be right-aligned in the viewport'
    ).toBeCloseTo(viewport!.width, 0);

    await expectVisualActionable(drawer.getByRole('button', { name: 'Close cart' }));
    await expectVisualActionable(drawer.getByRole('button', { name: 'Increase quantity' }));
    await expectVisualActionable(
      drawer.getByRole('button', {
        name: `Remove ${productUnderTest.name} from cart`,
      })
    );

    const checkout = drawer.getByRole('link', { name: /Proceed to Checkout/i });
    await expectVisualActionable(checkout, { minHeight: 40, minWidth: 200 });
    await clickVisualCenter(checkout);
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('places an order and manages status through visual controls', async ({
    page,
  }) => {
    await installVisualMocks(page);
    await addProductAndOpenCheckout(page);

    await expectVisualActionable(page.getByLabel('Your Name'), {
      minHeight: 32,
      minWidth: 240,
    });
    await page.getByLabel('Your Name').fill('Visual TDD Customer');

    const placeOrder = page.getByRole('button', { name: 'Place Order' });
    await expectVisualActionable(placeOrder, { minHeight: 40, minWidth: 240 });
    await clickVisualCenter(placeOrder);

    await expect(page).toHaveURL(/\/orders\/ord_visual_1001$/);
    await expect(page.getByRole('heading', { name: 'Order Details' })).toBeVisible();
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();

    const startPreparing = page.getByRole('button', { name: 'Start Preparing' });
    await startPreparing.scrollIntoViewIfNeeded();
    await expectVisualActionable(startPreparing, { minHeight: 36, minWidth: 120 });
    await clickVisualCenter(startPreparing);
    await expect(page.getByText('Preparing', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Preparing', { exact: true })).toBeVisible();
  });

  test('renders visualizer shell with a mocked iframe document', async ({ page }) => {
    await installVisualMocks(page);
    await page.goto('/visualizer');

    const frame = page.locator('iframe[title="3D Visualizer - Hello Room"]');
    await expect(frame).toHaveAttribute('src', '/viz/index.html');

    const frameBox = await frame.boundingBox();
    expect(frameBox).not.toBeNull();
    expect(frameBox!.height, 'visualizer iframe should be inspectable').toBeGreaterThanOrEqual(
      360
    );

    await expectVisualActionable(page.getByRole('button', { name: /Reload/i }), {
      minHeight: 32,
      minWidth: 32,
    });
    await expectVisualActionable(page.getByRole('link', { name: /Open Standalone/i }), {
      minHeight: 32,
      minWidth: 120,
    });
  });
});

for (const viewport of [
  { height: 844, label: 'mobile 390', width: 390 },
  { height: 568, label: 'mobile 320', width: 320 },
]) {
  test.describe(`visual UI integrity - ${viewport.label}`, () => {
    test.use({
      hasTouch: true,
      isMobile: true,
      viewport: { width: viewport.width, height: viewport.height },
    });

    test('keeps mobile header controls in viewport and navigates from menu', async ({
      page,
    }) => {
      await installVisualMocks(page);
      await page.goto('/');

      await expectNoHorizontalOverflow(page);
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

      await expectVisualActionable(cartButton(page), { minHeight: 40, minWidth: 40 });

      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      await expectVisualActionable(menuButton, { minHeight: 40, minWidth: 40 });
      await clickVisualCenter(menuButton);

      const mobileNav = page.getByRole('navigation', { name: 'Mobile' });
      await expect(mobileNav).toBeVisible();

      const visualizerLink = mobileNav.getByRole('link', { name: '3D' });
      await expectVisualActionable(visualizerLink, { minHeight: 40, minWidth: 120 });
      await clickVisualCenter(visualizerLink);
      await expect(page).toHaveURL(/\/visualizer$/);
    });
  });
}

async function addProductAndOpenCheckout(page: Page): Promise<void> {
  await page.goto('/');
  await clickVisualCenter(
    page.getByRole('button', { name: `Add ${productUnderTest.name} to cart` })
  );
  await clickVisualCenter(cartButton(page));
  await clickVisualCenter(page.getByRole('link', { name: /Proceed to Checkout/i }));
  await expect(page).toHaveURL(/\/checkout$/);
}

async function installVisualMocks(page: Page): Promise<void> {
  let cartItems: CartItem[] = [];
  let order: Order | null = null;

  await page.addInitScript(() => {
    localStorage.removeItem('expresso_demo_mode');
  });

  await page.route('**/viz/index.html', (route) =>
    route.fulfill({
      body: [
        '<!doctype html>',
        '<html><head><title>Mock Visualizer</title></head>',
        '<body style="margin:0;font-family:sans-serif;background:#fff;color:#111;">',
        '<main style="min-height:360px;display:grid;place-items:center;">',
        '<canvas width="640" height="360" aria-label="mock 3D scene"></canvas>',
        '<p>live · 4 items</p>',
        '</main>',
        '</body></html>',
      ].join(''),
      contentType: 'text/html',
      status: 200,
    })
  );

  await page.route('**/api/bff/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/bff/, '') || '/';
    const method = request.method();

    if (method === 'GET' && path === '/health') {
      return fulfillJson(route, 200, {
        checks: { db: 'ok' },
        service: 'bff',
        status: 'ok',
        uptimeSeconds: 100,
        version: 'visual-e2e',
      });
    }

    if (method === 'GET' && path === '/catalog/products') {
      return fulfillJson(route, 200, { items: products });
    }

    if (method === 'GET' && path === '/cart') {
      return fulfillJson(route, 200, buildCart(cartItems));
    }

    if (method === 'POST' && path === '/cart/items') {
      const body = request.postDataJSON() as
        | { productId?: string; quantity?: number }
        | null;
      const product = products.find((item) => item.productId === body?.productId);

      if (!product) {
        return fulfillJson(route, 404, { message: 'Product not found' });
      }

      cartItems = upsertCartItem(cartItems, product, body?.quantity ?? 1);
      return fulfillJson(route, 200, buildCart(cartItems));
    }

    const cartItemMatch = path.match(/^\/cart\/items\/([^/]+)$/);
    if (cartItemMatch?.[1] && method === 'PATCH') {
      const body = request.postDataJSON() as { quantity?: number } | null;
      cartItems = cartItems.map((item) =>
        item.itemId === cartItemMatch[1]
          ? {
              ...item,
              lineTotal: money(item.unitPrice.amountMinor * (body?.quantity ?? item.quantity)),
              quantity: body?.quantity ?? item.quantity,
            }
          : item
      );
      return fulfillJson(route, 200, buildCart(cartItems));
    }

    if (cartItemMatch?.[1] && method === 'DELETE') {
      cartItems = cartItems.filter((item) => item.itemId !== cartItemMatch[1]);
      return fulfillJson(route, 200, buildCart(cartItems));
    }

    if (method === 'POST' && path === '/checkout') {
      const body = request.postDataJSON() as { customerName?: string } | null;
      order = buildOrder(body?.customerName ?? 'Visual Customer', cartItems, 'pending');
      cartItems = [];
      return fulfillJson(route, 200, {
        cartId: 'cart_visual',
        orderId: order.orderId,
        status: order.status,
        total: order.total,
      });
    }

    if (method === 'GET' && path === '/orders') {
      return fulfillJson(route, 200, { items: order ? [order] : [] });
    }

    const orderMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderMatch?.[1] && method === 'GET') {
      if (!order || order.orderId !== orderMatch[1]) {
        return fulfillJson(route, 404, { message: 'Order not found' });
      }
      return fulfillJson(route, 200, order);
    }

    const manageMatch = path.match(/^\/orders\/([^/]+)\/manage$/);
    if (manageMatch?.[1] && method === 'POST') {
      if (!order || order.orderId !== manageMatch[1]) {
        return fulfillJson(route, 404, { message: 'Order not found' });
      }

      const previousStatus = order.status;
      order = { ...order, status: 'preparing', updatedAt: '2026-05-29T12:01:00.000Z' };
      return fulfillJson(route, 200, {
        acceptedAt: order.updatedAt,
        action: 'update_status',
        orderId: order.orderId,
        previousStatus,
        status: order.status,
      });
    }

    return route.fallback();
  });
}

function buildCart(items: CartItem[]): Cart {
  const amountMinor = items.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0);
  return {
    cartId: 'cart_visual',
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    total: money(amountMinor),
    updatedAt: now,
  };
}

function upsertCartItem(items: CartItem[], product: Product, quantity: number): CartItem[] {
  const existing = items.find((item) => item.productId === product.productId);

  if (!existing) {
    return [
      ...items,
      {
        itemId: 'ci_visual_001',
        lineTotal: money(product.price.amountMinor * quantity),
        name: product.name,
        productId: product.productId,
        quantity,
        unitPrice: product.price,
      },
    ];
  }

  return items.map((item) => {
    if (item.productId !== product.productId) return item;

    const nextQuantity = item.quantity + quantity;
    return {
      ...item,
      lineTotal: money(item.unitPrice.amountMinor * nextQuantity),
      quantity: nextQuantity,
    };
  });
}

function buildOrder(
  customerName: string,
  cartItems: CartItem[],
  status: OrderStatus
): Order {
  return {
    customerName,
    lines: cartItems.map((item) => ({
      lineTotal: item.lineTotal,
      name: item.name,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    orderId: 'ord_visual_1001',
    placedAt: now,
    status,
    total: buildCart(cartItems).total,
    updatedAt: now,
  };
}

function cartButton(page: Page) {
  return page.getByRole('button', { name: /Shopping cart with \d+ items/i });
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

function money(amountMinor: number): Money {
  return { amountMinor, currency: 'USD' };
}
