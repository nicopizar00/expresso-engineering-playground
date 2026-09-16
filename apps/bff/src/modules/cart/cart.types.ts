import type { Money } from "@mini-commerce/shared-types";

export interface CartItem {
  readonly itemId: string;
  readonly productId: string;
  readonly name: string;
  readonly unitPrice: Money;
  readonly quantity: number;
  readonly lineTotal: Money;
}

export interface Cart {
  readonly cartId: string | null;
  readonly items: ReadonlyArray<CartItem>;
  readonly itemCount: number;
  readonly total: Money;
  readonly expiresAt: string | null;
  readonly updatedAt: string;
}
