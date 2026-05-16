/**
 * Mock data for demo mode.
 *
 * This file provides static fixtures for frontend demonstration when the BFF
 * is not running. All data shapes mirror the contracts defined in the BFF
 * modules (apps/bff/src/modules/*).
 *
 * TODO(types): Import types from @mini-commerce/contracts once promoted.
 */

import type {
  Product,
  Cart,
  CartItem,
  Order,
  OrderLine,
  HealthReport,
  CheckoutResponse,
  Money,
} from './expresso-api';

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
// ---------------------------------------------------------------------------

export const MOCK_PRODUCTS: Product[] = [
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
    productId: 'prod_cappuccino_001',
    sku: 'CAP-001',
    name: 'Cappuccino',
    description: 'Equal parts espresso, steamed milk, and velvety foam.',
    category: 'drink',
    price: money(475),
    inventory: 40,
  },
  {
    productId: 'prod_americano_001',
    sku: 'AME-001',
    name: 'Americano',
    description: 'Espresso diluted with hot water for a milder flavor.',
    category: 'drink',
    price: money(400),
    inventory: 60,
  },
  {
    productId: 'prod_croissant_001',
    sku: 'CRO-001',
    name: 'Butter Croissant',
    description: 'Flaky, buttery French-style croissant baked fresh daily.',
    category: 'food',
    price: money(375),
    inventory: 20,
  },
  {
    productId: 'prod_muffin_001',
    sku: 'MUF-001',
    name: 'Blueberry Muffin',
    description: 'Moist muffin packed with fresh blueberries and a crumb topping.',
    category: 'food',
    price: money(425),
    inventory: 15,
  },
  {
    productId: 'prod_sandwich_001',
    sku: 'SAN-001',
    name: 'Avocado Toast',
    description: 'Sourdough toast with smashed avocado, cherry tomatoes, and microgreens.',
    category: 'food',
    price: money(850),
    inventory: 12,
  },
  {
    productId: 'prod_mug_001',
    sku: 'MUG-001',
    name: 'Expresso Ceramic Mug',
    description: 'Handcrafted 12oz ceramic mug with the Expresso logo.',
    category: 'accessory',
    price: money(1800),
    inventory: 25,
  },
  {
    productId: 'prod_tumbler_001',
    sku: 'TUM-001',
    name: 'Insulated Tumbler',
    description: 'Double-walled stainless steel tumbler keeps drinks hot for 6 hours.',
    category: 'accessory',
    price: money(2400),
    inventory: 18,
  },
  {
    productId: 'prod_beans_001',
    sku: 'BEA-001',
    name: 'House Blend Beans (250g)',
    description: 'Medium roast whole bean coffee with notes of chocolate and caramel.',
    category: 'accessory',
    price: money(1650),
    inventory: 30,
  },
];

// ---------------------------------------------------------------------------
// Mock Cart State (aligned with BFF cart.types.ts)
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
  const product = MOCK_PRODUCTS.find((p) => p.productId === productId);
  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  const existingItem = mockCartItems.find((item) => item.productId === productId);
  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.lineTotal = money(existingItem.unitPrice.amountMinor * existingItem.quantity);
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

export function clearMockCart(): void {
  mockCartItems = [];
}

// ---------------------------------------------------------------------------
// Mock Orders (aligned with BFF orders.types.ts)
// ---------------------------------------------------------------------------

const mockOrders: Map<string, Order> = new Map();

export function createMockOrder(customerName: string): CheckoutResponse {
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
  return mockOrders.get(orderId) ?? null;
}

export function updateMockOrderStatus(
  orderId: string,
  newStatus: Order['status']
): Order | null {
  const order = mockOrders.get(orderId);
  if (!order) return null;

  order.status = newStatus;
  order.updatedAt = new Date().toISOString();
  return { ...order };
}

// ---------------------------------------------------------------------------
// Mock Health (aligned with BFF health.service.ts)
// ---------------------------------------------------------------------------

export function getMockHealth(): HealthReport {
  return {
    status: 'ok',
    service: 'bff-mock',
    version: '0.0.0-demo',
    uptimeSeconds: Math.floor((Date.now() / 1000) % 86400),
    checks: { db: 'skipped' },
  };
}
