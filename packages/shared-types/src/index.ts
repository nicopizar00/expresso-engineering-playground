// Cross-cutting domain types for the mini-commerce engineering playground.
// Keep this surface small. Anything wire-format belongs in @mini-commerce/contracts.

export type ProductId = string & { readonly __brand: "ProductId" };
export type CartItemId = string & { readonly __brand: "CartItemId" };
export type OrderId = string & { readonly __brand: "OrderId" };
export type CustomerId = string & { readonly __brand: "CustomerId" };

export type Money = {
  readonly amountMinor: number;
  readonly currency: string;
};

// Lifecycle of a mini-commerce order. Kept intentionally small.
export type OrderStatus =
  | "pending"
  | "preparing"
  | "prepared"
  | "cancelled";

// Management actions exposed via POST /orders/:id/manage.
export type OrderManageAction =
  | "cancel"
  | "update_status"
  | "mark_prepared";
