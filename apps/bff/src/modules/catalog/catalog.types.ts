// Lightweight DTO/response shapes for the catalog module.
// Wire-format types stay here until they migrate to packages/contracts.

import type { Money } from "@mini-commerce/shared-types";

export interface Product {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly category: "drink" | "food" | "accessory";
  readonly price: Money;
  readonly inventory: number;
}

export interface ProductsResponse {
  readonly items: ReadonlyArray<Product>;
}
