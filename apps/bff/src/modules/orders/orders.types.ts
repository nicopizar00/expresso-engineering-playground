import type { Money, OrderTemperature } from "@mini-commerce/shared-types";

export interface OrderLine {
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

// Who the order is for (login feature). null = guest.
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
  // Derived on read from placedAt (see order-temperature.ts); never stored.
  readonly temperature: OrderTemperature;
  readonly coolsAt: string;
}

// What the service caches: an Order minus its read-time temperature fields.
export type StoredOrder = Omit<Order, "temperature" | "coolsAt">;

export interface OrdersResponse {
  readonly items: ReadonlyArray<Order>;
}

export interface CreateOrderInput {
  readonly customerName?: string;
  readonly lines: ReadonlyArray<OrderLine>;
  readonly total: Money;
  // Optional caller-supplied idempotency key. When set, a retry with the same
  // key returns the original order without re-decrementing inventory.
  readonly clientRequestId?: string;
  // Anonymous owner (the caller's `sid`). Stored, never serialized.
  readonly sessionId?: string;
  // At most one is set (see checkout/order-for.ts); both absent = guest.
  readonly ownerUsername?: string;
  readonly ownerEmail?: string;
}

export interface OrderStatusResponse {
  readonly orderId: string;
  readonly temperature: OrderTemperature;
  readonly placedAt: string;
  readonly coolsAt: string;
  readonly checkedAt: string;
}

export interface AccountOrdersResponse {
  readonly items: ReadonlyArray<Order>;
  // items[0] — the card the web app highlights; null with no orders.
  readonly latest: Order | null;
}
