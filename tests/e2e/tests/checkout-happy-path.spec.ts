import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { StorefrontPage } from '../pages/StorefrontPage';

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

type CommerceMockOptions = {
  checkoutFailure?: 'network-drop';
};

const now = '2026-05-29T12:00:00.000Z';

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
  {
    productId: 'prod_notebook_001',
    sku: 'NOT-001',
    name: 'Expresso Notebook',
    description: 'A5 lined notebook with soft-touch cover and Expresso branding.',
    category: 'accessory',
    price: money(1200),
    inventory: 25,
  },
];

const productUnderTest = products[0]!;

const viewportProfiles = [
  {
    name: 'Desktop Chrome',
    use: { viewport: { width: 1440, height: 900 } },
  },
  {
    name: 'Mobile Chrome',
    use: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    },
  },
];

for (const profile of viewportProfiles) {
  test.describe(`MVC-01 Catalog checkout - ${profile.name}`, () => {
    test.use(profile.use);

    test('completes catalog to cart to checkout to order management @smoke', async ({
      page,
    }) => {
      const storefront = await prepareCheckout(page);
      const customerName = `E2E Shopper ${profile.name}`;

      await expect(storefront.checkoutSummaryHeading()).toBeVisible();
      await expect(storefront.checkoutLineItem(productUnderTest.name)).toBeVisible();
      await expect(storefront.placeOrderButton()).toBeDisabled();

      await expectActionable(storefront.customerNameInput());
      await storefront.fillCustomerName(customerName);
      await expectActionable(storefront.placeOrderButton());
      await storefront.placeOrder();

      await expect(page).toHaveURL(/\/orders\/ord_e2e_1001$/);
      await expect(storefront.orderDetailsHeading()).toBeVisible();
      await expect(storefront.orderSuccessAlert()).toBeVisible();
      await expect(storefront.orderStatus('Pending')).toBeVisible();

      const orderId = storefront.currentOrderId();
      await expect(storefront.visibleOrderId(orderId)).toBeVisible();
      await expect(storefront.orderCustomer(customerName)).toBeVisible();
      await expect(storefront.orderLineItem(productUnderTest.name)).toBeVisible();

      await expectActionable(storefront.startPreparingButton());
      await storefront.startPreparingOrder();
      await expect(storefront.orderStatus('Preparing')).toBeVisible();
      await expect(storefront.markPreparedButton()).toBeVisible();
    });

    test('surfaces a checkout network drop without losing cart context', async ({
      page,
    }) => {
      const storefront = await prepareCheckout(page, {
        checkoutFailure: 'network-drop',
      });

      await expectActionable(storefront.customerNameInput());
      await storefront.fillCustomerName('Network Failure Shopper');
      await expectActionable(storefront.placeOrderButton());
      await storefront.placeOrder();

      await expect(page).toHaveURL(/\/checkout$/);
      await expect(storefront.checkoutAlert()).toContainText(
        'An unexpected error occurred. Please try again.'
      );
      await expect(storefront.checkoutLineItem(productUnderTest.name)).toBeVisible();
      await expect(storefront.placeOrderButton()).toBeEnabled();
    });
  });
}

async function prepareCheckout(
  page: Page,
  options: CommerceMockOptions = {}
): Promise<StorefrontPage> {
  await installCommerceApiMock(page, options);

  const storefront = new StorefrontPage(page);
  await storefront.gotoCatalog();

  await expect(storefront.catalogHeading()).toBeVisible();
  await expect(storefront.categoryTab('All')).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(storefront.productHeading(productUnderTest.name)).toBeVisible();

  await expectActionable(storefront.categoryTab('Drinks'));
  await storefront.filterProductsByCategory('Drinks');
  await expect(storefront.categoryTab('Drinks')).toHaveAttribute(
    'aria-selected',
    'true'
  );

  await expectActionable(storefront.addToCartButton(productUnderTest.name));
  await storefront.addProductToCart(productUnderTest.name);
  await expect(storefront.cartButton()).toHaveAccessibleName(
    'Shopping cart with 1 items'
  );

  await expectActionable(storefront.cartButton());
  await storefront.openCart();
  await expect(storefront.cartDialog()).toBeVisible();
  await expect(storefront.cartLineItem(productUnderTest.name)).toBeVisible();

  await expectActionable(storefront.proceedToCheckoutLink());
  await storefront.proceedToCheckoutFromCartDrawer();
  await expect(storefront.checkoutHeading()).toBeVisible();

  return storefront;
}

async function expectActionable(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
}

async function installCommerceApiMock(
  page: Page,
  options: CommerceMockOptions
): Promise<void> {
  let cartItems: CartItem[] = [];
  let order: Order | null = null;

  await page.addInitScript(() => {
    localStorage.removeItem('expresso_demo_mode');
  });

  await page.route('**/api/bff/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/bff/, '') || '/';
    const method = request.method();

    if (method === 'GET' && path === '/health') {
      return fulfillJson(route, 200, {
        status: 'ok',
        service: 'bff',
        version: 'e2e',
        uptimeSeconds: 120,
        checks: { db: 'ok' },
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
              quantity: body?.quantity ?? item.quantity,
              lineTotal: money(
                item.unitPrice.amountMinor * (body?.quantity ?? item.quantity)
              ),
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
      if (options.checkoutFailure === 'network-drop') {
        return route.abort('failed');
      }

      const body = request.postDataJSON() as { customerName?: string } | null;
      const cart = buildCart(cartItems);

      if (cart.items.length === 0 || !body?.customerName?.trim()) {
        return fulfillJson(route, 400, { message: 'Invalid checkout request' });
      }

      order = {
        orderId: 'ord_e2e_1001',
        customerName: body.customerName.trim(),
        status: 'pending',
        lines: cart.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        total: cart.total,
        placedAt: now,
        updatedAt: now,
      };
      cartItems = [];

      return fulfillJson(route, 200, {
        orderId: order.orderId,
        cartId: cart.cartId,
        customerName: order.customerName,
        status: order.status,
        total: order.total,
        placedAt: order.placedAt,
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

    const manageOrderMatch = path.match(/^\/orders\/([^/]+)\/manage$/);
    if (manageOrderMatch?.[1] && method === 'POST') {
      if (!order || order.orderId !== manageOrderMatch[1]) {
        return fulfillJson(route, 404, { message: 'Order not found' });
      }

      const body = request.postDataJSON() as
        | { action?: string; nextStatus?: OrderStatus }
        | null;
      const previousStatus = order.status;
      const nextStatus =
        body?.action === 'cancel'
          ? 'cancelled'
          : body?.action === 'mark_prepared'
            ? 'prepared'
            : body?.nextStatus ?? order.status;

      order = {
        ...order,
        status: nextStatus,
        updatedAt: '2026-05-29T12:05:00.000Z',
      };

      return fulfillJson(route, 200, {
        orderId: order.orderId,
        action: body?.action,
        previousStatus,
        status: order.status,
        acceptedAt: order.updatedAt,
      });
    }

    return fulfillJson(route, 404, { message: `Unhandled mock route ${path}` });
  });
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
  const totalAmount = items.reduce(
    (sum, item) => sum + item.lineTotal.amountMinor,
    0
  );

  return {
    cartId: 'cart_e2e_001',
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    total: money(totalAmount),
    updatedAt: now,
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
