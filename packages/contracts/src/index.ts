// Wire-format types for the mini-commerce HTTP API.
//
// These are the canonical request/response shapes that cross the
// apps/web ↔ apps/bff boundary. The BFF DTO classes and the web API
// client both import from here so the two sides cannot drift silently
// — a divergence shows up as a TypeScript error at compile time.
//
// Cross-cutting domain primitives (Money, OrderTemperature, branded IDs)
// stay in `@mini-commerce/shared-types`.

import type { Money, OrderTemperature } from "@mini-commerce/shared-types";

export type { Money, OrderTemperature };

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

// Who the order is for. null = guest.
export type OrderOwner =
  | { readonly username: string }
  | { readonly email: string }
  | null;

export interface Order {
  readonly orderId: string;
  readonly customerName: string | null;
  readonly owner: OrderOwner;
  readonly lines: ReadonlyArray<OrderLine>;
  readonly total: Money;
  readonly placedAt: string;
  readonly updatedAt: string;
  // Derived on read: hot until coolsAt, cold afterwards.
  readonly temperature: OrderTemperature;
  readonly coolsAt: string;
}

export interface OrdersResponse {
  readonly items: ReadonlyArray<Order>;
}

// GET /orders/:id/status — read straight from Postgres.
export interface OrderStatusResponse {
  readonly orderId: string;
  readonly temperature: OrderTemperature;
  readonly placedAt: string;
  readonly coolsAt: string;
  // Server clock used to derive `temperature`.
  readonly checkedAt: string;
}

// GET /account/orders — the signed-in user's orders, newest first.
export interface AccountOrdersResponse {
  readonly items: ReadonlyArray<Order>;
  readonly latest: Order | null;
}

// GET /account/hot-status — the signed-in user's hot-order summary.
export interface HotStatusResponse {
  readonly hotCount: number;
  // Earliest coolsAt among hot orders; null when hotCount is 0.
  readonly nextCoolsAt: string | null;
  // The instant the count was taken; lets clients correct clock skew.
  readonly serverTime: string;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

// Omitted → self when signed in, guest when signed out.
export type OrderFor =
  | { readonly type: "self" }
  | { readonly type: "guest" }
  | { readonly type: "user"; readonly recipient: string };

export interface CheckoutRequest {
  // The reservation cartId returned by the cart, proving the client is
  // checking out the cart it actually holds (see Cart.cartId).
  readonly cartId: string;
  readonly idempotencyKey?: string;
  readonly orderFor?: OrderFor;
}

export interface CheckoutResponse {
  readonly orderId: string;
  readonly cartId: string;
  readonly customerName: string | null;
  readonly total: Money;
  readonly placedAt: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  readonly username: string;
  readonly email: string;
}

export interface RegisterRequest {
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

// identifier: username or email.
export interface LoginRequest {
  readonly identifier: string;
  readonly password: string;
}

export interface MeResponse {
  readonly user: AuthUser | null;
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
