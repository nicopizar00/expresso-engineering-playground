import type { Money } from "@mini-commerce/shared-types";

export interface CheckoutResponse {
  readonly orderId: string;
  readonly cartId: string;
  readonly customerName: string | null;
  readonly total: Money;
  readonly placedAt: string;
}
