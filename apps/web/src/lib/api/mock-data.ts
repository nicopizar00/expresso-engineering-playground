/**
 * Mock data for demo mode.
 *
 * This file provides static fixtures for frontend demonstration when the BFF
 * is not running. All data shapes mirror the contracts defined in the BFF
 * modules (apps/bff/src/modules/*).
 *
 * ## Scenario System
 *
 * The mock layer supports scenarios for testing different UI states:
 * - happy: Normal operation with 7 sample products (includes checkout success)
 * - empty: Empty catalog and orders
 * - loading: Artificial delay (2s) to see loading states
 * - error: Simulate API failures (500/503)
 * - cart-filled: Pre-populated cart for checkout testing
 * - checkout-failure: Checkout always fails
 *
 * Note: Visualizer configured/missing states are controlled by the
 * NEXT_PUBLIC_VISUALIZER_URL environment variable, not by mock scenarios.
 *
 * TODO(types): Import types from @mini-commerce/contracts once promoted.
 * TODO(api-wire): Replace mock API with repository adapter when ready.
 */

import type {
  Product,
  Cart,
  CartItem,
  Order,
  HealthReport,
  CheckoutResponse,
  Money,
} from './expresso-api';

// ---------------------------------------------------------------------------
// Scenario Management
// ---------------------------------------------------------------------------

export type MockScenario =
  | 'happy'
  | 'empty'
  | 'loading'
  | 'error'
  | 'cart-filled'
  | 'checkout-failure';

let currentScenario: MockScenario = 'happy';

export function setMockScenario(scenario: MockScenario): void {
  currentScenario = scenario;
  // Reset cart state when switching scenarios
  if (scenario === 'empty') {
    mockCartItems = [];
  } else if (scenario === 'cart-filled') {
    // Pre-fill cart with sample items from the 7-product catalog
    mockCartItems = [
      {
        itemId: 'item_demo_001',
        productId: 'prod_espresso_001',
        name: 'Classic Espresso',
        unitPrice: money(350),
        quantity: 2,
        lineTotal: money(700),
      },
      {
        itemId: 'item_demo_002',
        productId: 'prod_latte_001',
        name: 'Vanilla Latte',
        unitPrice: money(525),
        quantity: 1,
        lineTotal: money(525),
      },
      {
        itemId: 'item_demo_003',
        productId: 'prod_cookie_001',
        name: 'Chocolate Chip Cookie',
        unitPrice: money(300),
        quantity: 3,
        lineTotal: money(900),
      },
    ];
  } else if (scenario === 'happy') {
    mockCartItems = [];
  }
}

export function getMockScenario(): MockScenario {
  return currentScenario;
}

export function shouldSimulateError(): boolean {
  return currentScenario === 'error' || currentScenario === 'checkout-failure';
}

export function shouldSimulateEmpty(): boolean {
  return currentScenario === 'empty';
}

export function getExtraLatency(): number {
  return currentScenario === 'loading' ? 2000 : 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(amountMinor: number, currency = 'USD'): Money {
  return { amountMinor, currency };
}

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Mock Products (aligned with BFF catalog.types.ts)
// Intentionally simple domain: espresso drinks, food, accessories
// ---------------------------------------------------------------------------

const FULL_PRODUCT_CATALOG: Product[] = [
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
    productId: 'prod_latte_001',
    sku: 'LAT-001',
    name: 'Vanilla Latte',
    description: 'Smooth espresso with steamed milk and a hint of vanilla.',
    category: 'drink',
    price: money(525),
    inventory: 35,
  },
  {
    productId: 'prod_water_001',
    sku: 'WAT-001',
    name: 'Sparkling Water',
    description: 'Refreshing sparkling mineral water, 500ml bottle.',
    category: 'drink',
    price: money(250),
    inventory: 100,
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
    productId: 'prod_sandwich_001',
    sku: 'SAN-001',
    name: 'Turkey Sandwich',
    description: 'Fresh turkey, lettuce, tomato on artisan bread.',
    category: 'food',
    price: money(850),
    inventory: 12,
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
  {
    productId: 'prod_backpack_001',
    sku: 'BAC-001',
    name: 'Expresso Backpack',
    description: 'Water-resistant backpack with padded laptop sleeve.',
    category: 'accessory',
    price: money(4500),
    inventory: 10,
  },
];

export const MOCK_PRODUCTS: Product[] = FULL_PRODUCT_CATALOG;

export function getMockProducts(): Product[] {
  if (shouldSimulateEmpty()) {
    return [];
  }
  return FULL_PRODUCT_CATALOG;
}

// ---------------------------------------------------------------------------
// Mock Cart State (aligned with BFF cart.types.ts)
// TODO(state): Replace localStorage cart with proper backend cart session
// ---------------------------------------------------------------------------

let mockCartItems: CartItem[] = [];

function calculateCartTotal(): Money {
  const total = mockCartItems.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0);
  return money(total);
}

function buildMockCart(): Cart {
  return {
    cartId: 'cart_demo_001',
    items: [...mockCartItems],
    itemCount: mockCartItems.reduce((sum, item) => sum + item.quantity, 0),
    total: calculateCartTotal(),
    updatedAt: new Date().toISOString(),
  };
}

export function getMockCart(): Cart {
  return buildMockCart();
}

export function addMockCartItem(productId: string, quantity: number): Cart {
  const product = FULL_PRODUCT_CATALOG.find((p) => p.productId === productId);
  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  const existingIdx = mockCartItems.findIndex((item) => item.productId === productId);
  if (existingIdx >= 0) {
    const existing = mockCartItems[existingIdx]!;
    const nextQuantity = existing.quantity + quantity;
    mockCartItems[existingIdx] = {
      ...existing,
      quantity: nextQuantity,
      lineTotal: money(existing.unitPrice.amountMinor * nextQuantity),
    };
  } else {
    mockCartItems.push({
      itemId: generateId('item'),
      productId: product.productId,
      name: product.name,
      unitPrice: product.price,
      quantity,
      lineTotal: money(product.price.amountMinor * quantity),
    });
  }

  return buildMockCart();
}

export function updateMockCartItem(itemId: string, quantity: number): Cart {
  const idx = mockCartItems.findIndex((item) => item.itemId === itemId);
  if (idx < 0) {
    throw new Error(`Cart item not found: ${itemId}`);
  }
  const existing = mockCartItems[idx]!;
  mockCartItems[idx] = {
    ...existing,
    quantity,
    lineTotal: money(existing.unitPrice.amountMinor * quantity),
  };
  return buildMockCart();
}

export function removeMockCartItem(itemId: string): Cart {
  const exists = mockCartItems.some((item) => item.itemId === itemId);
  if (!exists) {
    throw new Error(`Cart item not found: ${itemId}`);
  }
  mockCartItems = mockCartItems.filter((item) => item.itemId !== itemId);
  return buildMockCart();
}

export function clearMockCart(): void {
  mockCartItems = [];
}

// ---------------------------------------------------------------------------
// Mock Orders (aligned with BFF orders.types.ts)
// ---------------------------------------------------------------------------

const mockOrders: Map<string, Order> = new Map();

// Pre-populate a sample order for order lookup testing (uses 7-product catalog)
const sampleOrder: Order = {
  orderId: 'ord_sample_001',
  customerName: 'Demo Customer',
  status: 'preparing',
  lines: [
    {
      productId: 'prod_espresso_001',
      name: 'Classic Espresso',
      quantity: 2,
      unitPrice: money(350),
      lineTotal: money(700),
    },
    {
      productId: 'prod_cookie_001',
      name: 'Chocolate Chip Cookie',
      quantity: 1,
      unitPrice: money(300),
      lineTotal: money(300),
    },
  ],
  total: money(1000),
  placedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
  updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
};
mockOrders.set(sampleOrder.orderId, sampleOrder);

export function createMockOrder(customerName: string): CheckoutResponse {
  if (currentScenario === 'checkout-failure') {
    throw new Error('Payment processing failed (mock error)');
  }

  const orderId = generateId('ord');
  const cart = buildMockCart();
  const placedAt = new Date().toISOString();

  const order: Order = {
    orderId,
    customerName,
    status: 'pending',
    lines: cart.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    total: cart.total,
    placedAt,
    updatedAt: placedAt,
  };

  mockOrders.set(orderId, order);
  clearMockCart();

  return {
    orderId,
    cartId: cart.cartId,
    customerName,
    status: 'pending',
    total: cart.total,
    placedAt,
  };
}

export function getMockOrder(orderId: string): Order | null {
  if (shouldSimulateEmpty()) {
    return null;
  }
  return mockOrders.get(orderId) ?? null;
}

export function getAllMockOrders(): { items: Order[] } {
  if (shouldSimulateEmpty()) {
    return { items: [] };
  }
  return { items: Array.from(mockOrders.values()) };
}

export function updateMockOrderStatus(
  orderId: string,
  newStatus: Order['status']
): Order | null {
  const order = mockOrders.get(orderId);
  if (!order) return null;

  const updated: Order = {
    ...order,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };
  mockOrders.set(orderId, updated);
  return updated;
}

/**
 * Get the sample order ID for testing order lookup.
 * Use this in the Demo Guide to help reviewers test the order detail page.
 */
export function getSampleOrderId(): string {
  return 'ord_sample_001';
}

// ---------------------------------------------------------------------------
// Mock Health (aligned with BFF health.service.ts)
// ---------------------------------------------------------------------------

export function getMockHealth(): HealthReport {
  if (shouldSimulateError()) {
    throw new Error('Health check failed (mock error)');
  }
  return {
    status: 'ok',
    service: 'bff',
    version: '0.0.0-demo',
    uptimeSeconds: Math.floor((Date.now() / 1000) % 86400),
    checks: { db: 'skipped' },
  };
}
