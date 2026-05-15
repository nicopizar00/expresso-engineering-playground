import type { Money, OrderStatus } from "@mini-commerce/shared-types";

export interface OrderLine {
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

export interface Order {
  readonly orderId: string;
  readonly customerName: string;
  readonly status: OrderStatus;
  readonly lines: ReadonlyArray<OrderLine>;
  readonly total: Money;
  readonly placedAt: string;
  readonly updatedAt: string;
}

export interface CreateOrderInput {
  readonly customerName: string;
  readonly lines: ReadonlyArray<OrderLine>;
  readonly total: Money;
}

export interface ManageOrderResponse {
  readonly orderId: string;
  readonly action: "cancel" | "update_status" | "mark_prepared";
  readonly previousStatus: OrderStatus;
  readonly status: OrderStatus;
  readonly acceptedAt: string;
}
