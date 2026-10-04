import type {
  Money,
  OrderStatus,
  OrderTemperature,
} from "@mini-commerce/shared-types";

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
}

export interface OrderStatusResponse {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly temperature: OrderTemperature;
  readonly placedAt: string;
  readonly coolsAt: string;
  readonly checkedAt: string;
}

export interface ManageOrderResponse {
  readonly orderId: string;
  readonly action: "cancel" | "update_status" | "mark_prepared";
  readonly previousStatus: OrderStatus;
  readonly status: OrderStatus;
  readonly acceptedAt: string;
}
