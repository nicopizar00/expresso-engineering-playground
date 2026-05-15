import type { Money, OrderStatus } from "@mini-commerce/shared-types";

export interface CheckoutResponse {
  readonly orderId: string;
  readonly cartId: string;
  readonly customerName: string;
  readonly status: Extract<OrderStatus, "pending">;
  readonly total: Money;
  readonly placedAt: string;
}
