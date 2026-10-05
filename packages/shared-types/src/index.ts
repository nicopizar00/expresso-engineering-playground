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

// Derived at read time from placedAt: an order is "hot" for the cool-down
// window after it is served (placed), then "cold". Never stored.
export type OrderTemperature = "hot" | "cold";
