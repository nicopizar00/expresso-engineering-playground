// Wire-format types for the mini-commerce HTTP API.
//
// These are the canonical request/response shapes that cross the
// apps/web ↔ apps/bff boundary. The BFF DTO classes and the web API
// client both import from here so the two sides cannot drift silently
// — a divergence shows up as a TypeScript error at compile time.
//
// Cross-cutting domain primitives (Money, OrderStatus, branded IDs)
// stay in `@mini-commerce/shared-types`.

import type {
  Money,
  OrderStatus,
  OrderManageAction,
} from "@mini-commerce/shared-types";

export type { Money, OrderStatus, OrderManageAction };

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type ProductCategory = "drink" | "food" | "accessory";

export interface Product {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly category: ProductCategory;
  readonly price: Money;
  readonly inventory: number;
}

export interface ProductsResponse {
  readonly items: ReadonlyArray<Product>;
}

export interface CreateProductRequest {
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly category: ProductCategory;
  readonly price: Money;
  readonly inventory: number;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartItem {
  readonly itemId: string;
  readonly productId: string;
  readonly name: string;
  readonly unitPrice: Money;
  readonly quantity: number;
  readonly lineTotal: Money;
}

export interface Cart {
  // null when the cart holds no active reservation (empty, or the prior
  // reservation's 1-hour window lapsed and was evicted).
  readonly cartId: string | null;
  readonly items: ReadonlyArray<CartItem>;
  readonly itemCount: number;
  readonly total: Money;
  // ISO timestamp the reservation lapses at; null alongside a null cartId.
  readonly expiresAt: string | null;
  readonly updatedAt: string;
}

export interface AddCartItemRequest {
  readonly productId: string;
  readonly quantity: number;
}

export interface UpdateCartItemRequest {
  readonly quantity: number;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderLine {
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

export interface Order {
  readonly orderId: string;
  readonly customerName: string | null;
  readonly status: OrderStatus;
  readonly lines: ReadonlyArray<OrderLine>;
  readonly total: Money;
  readonly placedAt: string;
  readonly updatedAt: string;
}

export interface OrdersResponse {
  readonly items: ReadonlyArray<Order>;
}

export interface ManageOrderRequest {
  readonly action: OrderManageAction;
  readonly nextStatus?: OrderStatus;
  readonly reason?: string;
}

export interface ManageOrderResponse {
  readonly orderId: string;
  readonly action: OrderManageAction;
  readonly previousStatus: OrderStatus;
  readonly status: OrderStatus;
  readonly acceptedAt: string;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CheckoutRequest {
  // The reservation cartId returned by the cart, proving the client is
  // checking out the cart it actually holds (see Cart.cartId).
  readonly cartId: string;
  readonly idempotencyKey?: string;
}

export interface CheckoutResponse {
  readonly orderId: string;
  readonly cartId: string;
  readonly customerName: string | null;
  readonly status: Extract<OrderStatus, "pending">;
  readonly total: Money;
  readonly placedAt: string;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthReport {
  readonly status: "ok";
  readonly service: "bff";
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly checks: {
    readonly db: "skipped" | "ok" | "down";
  };
}
