import { expect, type Page, test } from '@playwright/test';

type Money = { amountMinor: number; currency: string };
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

const products: Product[] = [
  {
    productId: 'prod_espresso',
    sku: 'ESP-001',
    name: 'Classic Espresso',
    description: 'Rich, bold espresso made from premium beans.',
    category: 'drink',
    price: { amountMinor: 350, currency: 'EUR' },
    inventory: 20,
  },
  {
    productId: 'prod_cookie',
    sku: 'COO-001',
    name: 'Chocolate Chip Cookie',
    description: 'A warm cookie for checkout confidence.',
    category: 'food',
    price: { amountMinor: 300, currency: 'EUR' },
    inventory: 12,
  },
  {
    productId: 'prod_mug',
    sku: 'MUG-001',
    name: 'Expresso Mug',
    description: 'Ceramic mug for the engineering playground.',
    category: 'accessory',
    price: { amountMinor: 1200, currency: 'EUR' },
    inventory: 8,
  },
];

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().startsWith('Failed to load resource:')
    ) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function installCommerceMock(
  page: Page,
  options: { failAddToCart?: boolean } = {}
) {
  let itemSeq = 1;
  let cartItems: CartItem[] = [];
  const orders = new Map<string, Order>();

  const money = (amountMinor: number): Money => ({ amountMinor, currency: 'EUR' });
  const cart = () => {
    const amountMinor = cartItems.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0);
    return {
      cartId: 'cart_e2e',
      items: cartItems,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      total: money(amountMinor),
      updatedAt: '2026-05-29T12:00:00.000Z',
    };
  };

  const buildOrder = (customerName: string): Order => {
    const now = new Date().toISOString();
    return {
      orderId: `ord_e2e_${String(orders.size + 1).padStart(3, '0')}`,
      customerName,
      status: 'pending',
      lines: cartItems.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      total: cart().total,
      placedAt: now,
      updatedAt: now,
    };
  };

  await page.addInitScript(() => {
    localStorage.removeItem('expresso_demo_mode');
  });

  await page.route('**/api/bff/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/bff', '');
    const method = request.method();

    if (method === 'GET' && path === '/health') {
      await route.fulfill({
        json: {
          status: 'ok',
          service: 'bff',
          version: 'e2e',
          uptimeSeconds: 42,
          checks: { db: 'ok' },
        },
      });
      return;
    }

    if (method === 'GET' && path === '/catalog/products') {
      await route.fulfill({ json: { items: products } });
      return;
    }

    if (method === 'GET' && path === '/cart') {
      await route.fulfill({ json: cart() });
      return;
    }

    if (method === 'POST' && path === '/cart/items') {
      if (options.failAddToCart) {
        await route.fulfill({ status: 500, json: { message: 'cart unavailable' } });
        return;
      }
      const body = request.postDataJSON() as { productId: string; quantity: number };
      const product = products.find((item) => item.productId === body.productId);
      if (!product) {
        await route.fulfill({ status: 404, json: { message: 'not found' } });
        return;
      }
      cartItems = [
        ...cartItems,
        {
          itemId: `ci_${String(itemSeq++).padStart(3, '0')}`,
          productId: product.productId,
          name: product.name,
          unitPrice: product.price,
          quantity: body.quantity,
          lineTotal: money(product.price.amountMinor * body.quantity),
        },
      ];
      await route.fulfill({ status: 201, json: cart() });
      return;
    }

    const cartItemMatch = path.match(/^\/cart\/items\/([^/]+)$/);
    if (cartItemMatch && method === 'PATCH') {
      const itemId = decodeURIComponent(cartItemMatch[1]!);
      const body = request.postDataJSON() as { quantity: number };
      cartItems = cartItems.map((item) =>
        item.itemId === itemId
          ? {
              ...item,
              quantity: body.quantity,
              lineTotal: money(item.unitPrice.amountMinor * body.quantity),
            }
          : item
      );
      await route.fulfill({ json: cart() });
      return;
    }

    if (cartItemMatch && method === 'DELETE') {
      const itemId = decodeURIComponent(cartItemMatch[1]!);
      cartItems = cartItems.filter((item) => item.itemId !== itemId);
      await route.fulfill({ json: cart() });
      return;
    }

    if (method === 'POST' && path === '/checkout') {
      const body = request.postDataJSON() as { customerName: string };
      const order = buildOrder(body.customerName);
      orders.set(order.orderId, order);
      cartItems = [];
      await route.fulfill({
        status: 201,
        json: {
          orderId: order.orderId,
          cartId: 'cart_e2e',
          customerName: order.customerName,
          status: 'pending',
          total: order.total,
          placedAt: order.placedAt,
        },
      });
      return;
    }

    if (method === 'GET' && path === '/orders') {
      await route.fulfill({ json: { items: Array.from(orders.values()) } });
      return;
    }

    const orderMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderMatch && method === 'GET') {
      const order = orders.get(decodeURIComponent(orderMatch[1]!));
      await route.fulfill(
        order ? { json: order } : { status: 404, json: { message: 'not found' } }
      );
      return;
    }

    const manageMatch = path.match(/^\/orders\/([^/]+)\/manage$/);
    if (manageMatch && method === 'POST') {
      const orderId = decodeURIComponent(manageMatch[1]!);
      const order = orders.get(orderId);
      if (!order) {
        await route.fulfill({ status: 404, json: { message: 'not found' } });
        return;
      }
      const body = request.postDataJSON() as {
        action: 'update_status' | 'mark_prepared' | 'cancel';
        nextStatus?: OrderStatus;
      };
      const previousStatus = order.status;
      const status =
        body.action === 'mark_prepared'
          ? 'prepared'
          : body.action === 'cancel'
            ? 'cancelled'
            : body.nextStatus ?? order.status;
      const updated = { ...order, status, updatedAt: new Date().toISOString() };
      orders.set(orderId, updated);
      await route.fulfill({
        status: 202,
        json: {
          orderId,
          action: body.action,
          previousStatus,
          status,
          acceptedAt: updated.updatedAt,
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { message: `Unhandled ${method} ${path}` } });
  });

  await page.route('**/viz/index.html', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><main><h1>Visualizer Ready</h1><p>live · 3 items</p></main></body></html>',
    });
  });
}

test('certifies catalog, cart CRUD, checkout, and order management', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await installCommerceMock(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Product Catalog' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Drinks/ })).toBeVisible();
  await page.getByRole('tab', { name: /Food/ }).click();
  await expect(page.getByText('Chocolate Chip Cookie')).toBeVisible();
  await page.getByRole('tab', { name: /All/ }).click();

  await page.getByRole('button', { name: 'View details for Classic Espresso' }).click();
  const dialog = page.getByRole('dialog', { name: 'Classic Espresso' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Increase quantity' }).click();
  await dialog.getByRole('button', { name: /Add to Cart/ }).click();
  await expect(dialog).toBeHidden();

  const cartButton = page.getByRole('button', { name: 'Shopping cart with 2 items' });
  await expect(cartButton).toBeVisible();
  await cartButton.click();
  const cartDrawer = page.getByRole('dialog', { name: 'Cart' });
  await expect(cartDrawer).toBeVisible();
  await cartDrawer.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(page.getByRole('button', { name: 'Shopping cart with 3 items' })).toBeVisible();
  await cartDrawer.getByRole('link', { name: /Proceed to Checkout/ }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText('Classic Espresso')).toBeVisible();
  await page.getByLabel('Your Name').fill('UAT Browser Customer');
  await page.getByRole('button', { name: 'Place Order' }).click();

  await expect(page).toHaveURL(/\/orders\/ord_e2e_001$/);
  await expect(page.getByText('Order placed successfully')).toBeVisible();
  await page.getByRole('button', { name: 'Start Preparing' }).click();
  await expect(page.getByText('Preparing')).toBeVisible();
  await page.getByRole('button', { name: 'Mark as Prepared' }).click();
  await expect(page.getByText('Prepared')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Orders' })
    .click();
  await expect(page.getByText('UAT Browser Customer')).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('keeps product mutation failures visible and out of console errors', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await installCommerceMock(page, { failAddToCart: true });

  await page.goto('/');
  await page.getByRole('button', { name: 'Add Classic Espresso to cart' }).click();
  await expect(page.getByText('Could not add to cart. Please try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shopping cart with 0 items' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('certifies dialog focus restore, shell navigation, performance copy, and visualizer embed', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await installCommerceMock(page);

  await page.goto('/');
  const viewButton = page.getByRole('button', { name: 'View details for Classic Espresso' });
  await viewButton.click();
  await expect(page.getByRole('dialog', { name: 'Classic Espresso' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Classic Espresso' })).toBeHidden();
  await expect(viewButton).toBeFocused();

  const cartButton = page.getByRole('button', { name: 'Shopping cart with 0 items' });
  await cartButton.click();
  await expect(page.getByRole('dialog', { name: 'Cart' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Cart' })).toBeHidden();
  await expect(cartButton).toBeFocused();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Performance' }).click();
  await expect(page).toHaveURL(/\/performance$/);
  await expect(page.getByText(/simulated/i)).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: '3D' }).click();
  await expect(page).toHaveURL(/\/visualizer$/);
  await expect(page.getByRole('heading', { name: '3D Visualizer' })).toBeVisible();
  await expect(page.frameLocator('iframe[title="3D Visualizer - Hello Room"]').getByText('Visualizer Ready')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Standalone/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'API' }).click();
  await expect(page).toHaveURL(/\/dev$/);
  await expect(page.getByRole('heading', { name: 'Developer Tools' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});
