/**
 * Centralized BFF client for the mini-commerce / Expresso playground.
 *
 * All HTTP traffic from the web app goes through here. v0.app-generated
 * components MUST NOT import `fetch` directly — they receive view models
 * produced from these responses.
 *
 * The base URL comes from NEXT_PUBLIC_API_BASE_URL (root `.env` →
 * `apps/web/.env.local` override). The fallback keeps the client usable in
 * `next dev` without any env file. Never hardcode a non-local URL here.
 *
 * ## Demo Mode
 *
 * Set NEXT_PUBLIC_DEMO_MODE=true to use mock data instead of the BFF.
 * This allows full frontend exploration without running the backend.
 *
 * ## Endpoint Verification (as of 2025-01)
 *
 * The following endpoints are VERIFIED against BFF controllers:
 *
 * | Endpoint                     | BFF Controller       | Status    |
 * |------------------------------|----------------------|-----------|
 * | GET  /health                 | health.controller    | VERIFIED  |
 * | GET  /catalog/products       | catalog.controller   | VERIFIED  |
 * | GET  /catalog/products/:id   | catalog.controller   | VERIFIED  |
 * | GET  /cart                   | cart.controller      | VERIFIED  |
 * | POST /cart/items             | cart.controller      | VERIFIED  |
 * | POST /checkout               | checkout.controller  | VERIFIED  |
 * | GET  /orders/:id             | orders.controller    | VERIFIED  |
 * | POST /orders/:id/manage      | orders.controller    | VERIFIED  |
 *
 * ## Missing Endpoints (frontend has workarounds)
 *
 * - DELETE /cart/items/:itemId — Not implemented in BFF
 * - PATCH  /cart/items/:itemId — Not implemented in BFF
 * - GET    /orders              — Not implemented (no list endpoint)
 *
 * TODO(types): Replace these inline response shapes with imports from
 *   `@mini-commerce/contracts` once those types are promoted out of the BFF
 *   modules (see docs/frontend/v0-wiring-plan.md §"Expected data contracts").
 */

import {
  MOCK_PRODUCTS,
  getMockCart,
  getMockProducts,
  addMockCartItem,
  createMockOrder,
  getMockOrder,
  updateMockOrderStatus,
  getMockHealth,
  shouldSimulateError,
  getExtraLatency,
  setMockScenario,
  getMockScenario,
  getSampleOrderId,
  type MockScenario,
} from './mock-data';

// ---------------------------------------------------------------------------
// Types — canonical wire shapes re-exported from @mini-commerce/contracts.
// The contracts package is the single source of truth shared with the BFF.
// Any drift between this file and the BFF DTOs surfaces as a tsc error.
// ---------------------------------------------------------------------------

import type {
  Money,
  ProductCategory,
  Product,
  ProductsResponse,
  CartItem,
  Cart,
  AddCartItemRequest,
  CheckoutRequest,
  CheckoutResponse,
  OrderStatus,
  OrderLine,
  Order,
  OrderManageAction,
  ManageOrderRequest,
  ManageOrderResponse,
  HealthReport,
} from '@mini-commerce/contracts';

export type {
  Money,
  ProductCategory,
  Product,
  ProductsResponse,
  CartItem,
  Cart,
  CheckoutResponse,
  OrderStatus,
  OrderLine,
  Order,
  OrderManageAction,
  ManageOrderResponse,
  HealthReport,
};

// Legacy aliases retained for callers in apps/web.
export type AddCartItemInput = AddCartItemRequest;
export type CheckoutInput = CheckoutRequest;
export type ManageOrderInput = ManageOrderRequest;

// ---------------------------------------------------------------------------
// Demo Mode Detection
// ---------------------------------------------------------------------------

function isDemoMode(): boolean {
  if (typeof window === 'undefined') {
    // Server-side: check env
    return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  }
  // Client-side: check env (baked at build) or localStorage override
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
    localStorage.getItem('expresso_demo_mode') === 'true'
  );
}

/**
 * Toggle demo mode at runtime (client-side only).
 * Useful for development and demonstrations.
 */
export function setDemoMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    if (enabled) {
      localStorage.setItem('expresso_demo_mode', 'true');
    } else {
      localStorage.removeItem('expresso_demo_mode');
    }
    // Reload to apply
    window.location.reload();
  }
}

export function getDemoModeStatus(): boolean {
  return isDemoMode();
}

// Re-export scenario management for demo controls
export { setMockScenario, getMockScenario, getSampleOrderId, type MockScenario };

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'http://localhost:3001';

function resolveBaseUrl(): string {
  // Read at call time, not module load time, so SSR + test overrides work.
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return raw && raw.length > 0 ? raw.replace(/\/$/, '') : DEFAULT_BASE_URL;
}

export class ExpressoApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(`${method} ${path} → HTTP ${status}`);
    this.name = 'ExpressoApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  const url = `${resolveBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    // TODO(api-wire): Add AbortController + per-call timeout for production use
    ...init,
  });

  const text = await res.text();
  const parsed = text.length > 0 ? safeJson(text) : null;

  if (!res.ok) {
    throw new ExpressoApiError(method, path, res.status, parsed);
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Mock Implementations
// ---------------------------------------------------------------------------

const mockApi = {
  async getHealth(): Promise<HealthReport> {
    await simulateLatency();
    if (shouldSimulateError()) {
      throw new ExpressoApiError('GET', '/health', 503, { message: 'Service unavailable (mock)' });
    }
    return getMockHealth();
  },

  async getProducts(): Promise<ProductsResponse> {
    await simulateLatency();
    if (shouldSimulateError()) {
      throw new ExpressoApiError('GET', '/catalog/products', 500, { message: 'Internal error (mock)' });
    }
    return { items: getMockProducts() };
  },

  async getProductById(productId: string): Promise<Product> {
    await simulateLatency();
    if (shouldSimulateError()) {
      throw new ExpressoApiError('GET', `/catalog/products/${productId}`, 500, { message: 'Internal error (mock)' });
    }
    const products = getMockProducts();
    const product = products.find((p) => p.productId === productId);
    if (!product) {
      throw new ExpressoApiError('GET', `/catalog/products/${productId}`, 404, {
        message: 'Product not found',
      });
    }
    return product;
  },

  async addCartItem(input: AddCartItemInput): Promise<Cart> {
    await simulateLatency();
    return addMockCartItem(input.productId, input.quantity);
  },

  async getCart(): Promise<Cart> {
    await simulateLatency();
    return getMockCart();
  },

  async checkout(input: CheckoutInput): Promise<CheckoutResponse> {
    await simulateLatency(300);
    const cart = getMockCart();
    if (cart.items.length === 0) {
      throw new ExpressoApiError('POST', '/checkout', 400, {
        message: 'Cart is empty',
      });
    }
    return createMockOrder(input.customerName);
  },

  async getOrderById(orderId: string): Promise<Order> {
    await simulateLatency();
    const order = getMockOrder(orderId);
    if (!order) {
      throw new ExpressoApiError('GET', `/orders/${orderId}`, 404, {
        message: 'Order not found',
      });
    }
    return order;
  },

  async manageOrder(
    orderId: string,
    input: ManageOrderInput
  ): Promise<ManageOrderResponse> {
    await simulateLatency();
    const order = getMockOrder(orderId);
    if (!order) {
      throw new ExpressoApiError('POST', `/orders/${orderId}/manage`, 404, {
        message: 'Order not found',
      });
    }

    const previousStatus = order.status;
    let newStatus: OrderStatus = order.status;

    if (input.action === 'cancel') {
      newStatus = 'cancelled';
    } else if (input.action === 'mark_prepared') {
      newStatus = 'prepared';
    } else if (input.action === 'update_status' && input.nextStatus) {
      newStatus = input.nextStatus;
    }

    updateMockOrderStatus(orderId, newStatus);

    return {
      orderId,
      action: input.action,
      previousStatus,
      status: newStatus,
      acceptedAt: new Date().toISOString(),
    };
  },
};

function simulateLatency(ms = 150): Promise<void> {
  const extra = getExtraLatency();
  return new Promise((resolve) => setTimeout(resolve, ms + extra));
}

// ---------------------------------------------------------------------------
// Real API Implementations
// ---------------------------------------------------------------------------

const realApi = {
  getHealth(): Promise<HealthReport> {
    return request<HealthReport>('GET', '/health');
  },

  getProducts(): Promise<ProductsResponse> {
    return request<ProductsResponse>('GET', '/catalog/products');
  },

  getProductById(productId: string): Promise<Product> {
    return request<Product>(
      'GET',
      `/catalog/products/${encodeURIComponent(productId)}`
    );
  },

  addCartItem(input: AddCartItemInput): Promise<Cart> {
    // TODO(api-wire): BFF cart is session-based; consider cookie/header strategy
    return request<Cart>('POST', '/cart/items', input);
  },

  getCart(): Promise<Cart> {
    // TODO(api-wire): BFF cart is session-based; consider cookie/header strategy
    return request<Cart>('GET', '/cart');
  },

  checkout(input: CheckoutInput): Promise<CheckoutResponse> {
    return request<CheckoutResponse>('POST', '/checkout', input);
  },

  getOrderById(orderId: string): Promise<Order> {
    return request<Order>('GET', `/orders/${encodeURIComponent(orderId)}`);
  },

  manageOrder(orderId: string, input: ManageOrderInput): Promise<ManageOrderResponse> {
    return request<ManageOrderResponse>(
      'POST',
      `/orders/${encodeURIComponent(orderId)}/manage`,
      input
    );
  },
};

// ---------------------------------------------------------------------------
// Public API Surface
//
// Automatically switches between mock and real implementations based on
// NEXT_PUBLIC_DEMO_MODE or localStorage override.
// ---------------------------------------------------------------------------

export const expressoApi = {
  getHealth(): Promise<HealthReport> {
    return isDemoMode() ? mockApi.getHealth() : realApi.getHealth();
  },

  getProducts(): Promise<ProductsResponse> {
    return isDemoMode() ? mockApi.getProducts() : realApi.getProducts();
  },

  getProductById(productId: string): Promise<Product> {
    return isDemoMode()
      ? mockApi.getProductById(productId)
      : realApi.getProductById(productId);
  },

  addCartItem(input: AddCartItemInput): Promise<Cart> {
    return isDemoMode() ? mockApi.addCartItem(input) : realApi.addCartItem(input);
  },

  getCart(): Promise<Cart> {
    return isDemoMode() ? mockApi.getCart() : realApi.getCart();
  },

  checkout(input: CheckoutInput): Promise<CheckoutResponse> {
    return isDemoMode() ? mockApi.checkout(input) : realApi.checkout(input);
  },

  getOrderById(orderId: string): Promise<Order> {
    return isDemoMode()
      ? mockApi.getOrderById(orderId)
      : realApi.getOrderById(orderId);
  },

  manageOrder(orderId: string, input: ManageOrderInput): Promise<ManageOrderResponse> {
    return isDemoMode()
      ? mockApi.manageOrder(orderId, input)
      : realApi.manageOrder(orderId, input);
  },
};

export type ExpressoApi = typeof expressoApi;

// ---------------------------------------------------------------------------
// Utility: Format money for display
// TODO(v0-export): Move to a shared utils file if reused across components
// ---------------------------------------------------------------------------

export function formatMoney(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}
