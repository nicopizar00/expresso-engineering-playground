import { expect, test, type Page, type Route } from '@playwright/test';
import { CatalogPage } from '../pages/CatalogPage';

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

type ApiMockMode = 'happy' | 'product-fetch-fails';

const products: Product[] = [
  {
    productId: 'prod_espresso_001',
    sku: 'ESP-001',
    name: 'Classic Espresso',
    description: 'Rich, bold single-shot espresso made from premium Arabica beans.',
    category: 'drink',
    price: money(350),
    inventory: 50,
  },
  {
    productId: 'prod_cookie_001',
    sku: 'COO-001',
    name: 'Chocolate Chip Cookie',
    description: 'Warm, gooey chocolate chip cookie made with real butter.',
    category: 'food',
    price: money(300),
    inventory: 30,
  },
];

const classicEspresso = products[0]!;

test.describe('End-to-end purchase flow', () => {
  test('happy path adds Classic Espresso, validates subtotal, and opens checkout', async ({
    page,
  }) => {
    await installCommerceApiMock(page);

    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.heading()).toBeVisible();
    await expect(catalog.heading()).toHaveText('Product Catalog');
    await expect(catalog.productName(classicEspresso.name)).toBeVisible();
    await expect(catalog.productName(classicEspresso.name)).toHaveText(
      classicEspresso.name
    );

    await catalog.addItemToCart(classicEspresso.name);
    await expect(catalog.cartButton()).toHaveAccessibleName(
      'Shopping cart with 1 items'
    );

    const cart = await catalog.openCart();
    await expect(cart.productName(classicEspresso.name)).toBeVisible();
    await expect(cart.productName(classicEspresso.name)).toHaveText(
      classicEspresso.name
    );
    await expect(cart.quantity(classicEspresso.name)).toHaveText('1');
    await expect(cart.lineTotal(classicEspresso.name)).toHaveText('3.50 USD');
    await expect(cart.subtotal()).toHaveText('3.50 USD');

    await cart.clickCheckout();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  });

  test('adds multiple quantities of the same item', async ({ page }) => {
    await installCommerceApiMock(page);

    const catalog = new CatalogPage(page);
    await catalog.goto();
    await expect(catalog.heading()).toBeVisible();

    await catalog.addItemToCart(classicEspresso.name);
    await catalog.addItemToCart(classicEspresso.name);
    await expect(catalog.cartButton()).toHaveAccessibleName(
      'Shopping cart with 2 items'
    );

    const cart = await catalog.openCart();
    await expect(cart.quantity(classicEspresso.name)).toHaveText('2');
    await expect(cart.lineTotal(classicEspresso.name)).toHaveText('7.00 USD');
    await expect(cart.subtotal()).toHaveText('7.00 USD');

    await cart.increaseQuantity(classicEspresso.name);
    await expect(cart.quantity(classicEspresso.name)).toHaveText('3');
    await expect(cart.subtotal()).toHaveText('10.50 USD');
  });

  test('removes all items and shows the empty cart state', async ({ page }) => {
    await installCommerceApiMock(page);

    const catalog = new CatalogPage(page);
    await catalog.goto();
    await expect(catalog.heading()).toBeVisible();

    await catalog.addItemToCart(classicEspresso.name);
    const cart = await catalog.openCart();
    await expect(cart.productName(classicEspresso.name)).toBeVisible();

    await cart.removeProduct(classicEspresso.name);
    await expect(cart.emptyCartState()).toBeVisible();
    await expect(cart.emptyCartState()).toHaveText(
      /Your cart is empty[\s\S]*Add some products to your cart to get started\.[\s\S]*Browse Products/
    );
    await expect(catalog.cartButton()).toHaveAccessibleName(
      'Shopping cart with 0 items'
    );
  });

  test('shows the product fetch error state when the catalog API returns 500', async ({
    page,
  }) => {
    await installCommerceApiMock(page, 'product-fetch-fails');

    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.errorState()).toBeVisible();
    await expect(catalog.errorState()).toHaveText(
      /Failed to load products[\s\S]*Could not connect to the BFF|Failed to load products[\s\S]*GET \/catalog\/products/
    );
  });
});

test.describe('End-to-end purchase flow - Mobile Chrome viewport', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('opens the cart drawer and reaches checkout on mobile', async ({ page }) => {
    await installCommerceApiMock(page);

    const catalog = new CatalogPage(page);
    await catalog.goto();

    await expect(catalog.heading()).toBeVisible();
    await catalog.addItemToCart(classicEspresso.name);

    const cart = await catalog.openCart();
    await expect(cart.dialog()).toBeVisible();
    await expect(cart.subtotal()).toHaveText('3.50 USD');

    await cart.clickCheckout();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  });
});

async function installCommerceApiMock(
  page: Page,
  mode: ApiMockMode = 'happy'
): Promise<void> {
  let cartItems: CartItem[] = [];

  await page.addInitScript(() => {
    localStorage.removeItem('expresso_demo_mode');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (isProductListRequest(method, path)) {
      if (mode === 'product-fetch-fails') {
        return fulfillJson(route, 500, { message: 'Catalog unavailable' });
      }
      return fulfillJson(route, 200, { items: products });
    }

    if (method === 'GET' && path === '/api/bff/health') {
      return fulfillJson(route, 200, {
        status: 'ok',
        service: 'bff',
        version: 'e2e',
        uptimeSeconds: 600,
        checks: { db: 'ok' },
      });
    }

    if (method === 'GET' && path === '/api/bff/cart') {
      return fulfillJson(route, 200, buildCart(cartItems));
    }

    if (method === 'POST' && path === '/api/bff/cart/items') {
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

    const cartItemMatch = path.match(/^\/api\/bff\/cart\/items\/([^/]+)$/);
    if (cartItemMatch?.[1] && method === 'PATCH') {
      const body = request.postDataJSON() as { quantity?: number } | null;
      cartItems = cartItems.map((item) => {
        if (item.itemId !== cartItemMatch[1]) {
          return item;
        }

        const quantity = body?.quantity ?? item.quantity;
        return {
          ...item,
          quantity,
          lineTotal: money(item.unitPrice.amountMinor * quantity),
        };
      });
      return fulfillJson(route, 200, buildCart(cartItems));
    }

    if (cartItemMatch?.[1] && method === 'DELETE') {
      cartItems = cartItems.filter((item) => item.itemId !== cartItemMatch[1]);
      return fulfillJson(route, 200, buildCart(cartItems));
    }

    return route.fallback();
  });
}

function isProductListRequest(method: string, path: string): boolean {
  return (
    method === 'GET' &&
    (path === '/api/products' || path === '/api/bff/catalog/products')
  );
}

function upsertCartItem(
  currentItems: CartItem[],
  product: Product,
  quantity: number
): CartItem[] {
  const existing = currentItems.find((item) => item.productId === product.productId);

  if (!existing) {
    return [
      ...currentItems,
      {
        itemId: `item_${product.productId}`,
        productId: product.productId,
        name: product.name,
        unitPrice: product.price,
        quantity,
        lineTotal: money(product.price.amountMinor * quantity),
      },
    ];
  }

  return currentItems.map((item) => {
    if (item.productId !== product.productId) {
      return item;
    }

    const nextQuantity = item.quantity + quantity;
    return {
      ...item,
      quantity: nextQuantity,
      lineTotal: money(item.unitPrice.amountMinor * nextQuantity),
    };
  });
}

function buildCart(items: CartItem[]): Cart {
  return {
    cartId: 'cart_e2e_001',
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    total: money(
      items.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0)
    ),
    updatedAt: '2026-05-29T12:00:00.000Z',
  };
}

function money(amountMinor: number): Money {
  return { amountMinor, currency: 'USD' };
}

async function fulfillJson(
  route: Route,
  status: number,
  body: unknown
): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}
