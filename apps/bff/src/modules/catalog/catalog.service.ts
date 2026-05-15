import { Injectable, NotFoundException } from "@nestjs/common";
import type { Product, ProductsResponse } from "./catalog.types";

// Deterministic mock catalog. Same inputs always yield same outputs so
// contract / snapshot tests can rely on them.
const CATALOG: ReadonlyArray<Product> = [
  {
    productId: "prod_espresso",
    sku: "SKU-ESP-01",
    name: "Espresso",
    description: "Single shot of espresso.",
    category: "drink",
    price: { amountMinor: 180, currency: "EUR" },
    inventory: 120,
  },
  {
    productId: "prod_latte",
    sku: "SKU-LAT-01",
    name: "Latte",
    description: "Espresso with steamed milk.",
    category: "drink",
    price: { amountMinor: 320, currency: "EUR" },
    inventory: 80,
  },
  {
    productId: "prod_sandwich",
    sku: "SKU-SND-01",
    name: "Sandwich",
    description: "Cheese and tomato on sourdough.",
    category: "food",
    price: { amountMinor: 550, currency: "EUR" },
    inventory: 25,
  },
  {
    productId: "prod_cookie",
    sku: "SKU-CKE-01",
    name: "Cookie",
    description: "Chocolate chip cookie.",
    category: "food",
    price: { amountMinor: 200, currency: "EUR" },
    inventory: 60,
  },
  {
    productId: "prod_water",
    sku: "SKU-WTR-01",
    name: "Water",
    description: "Still mineral water, 500ml.",
    category: "drink",
    price: { amountMinor: 150, currency: "EUR" },
    inventory: 200,
  },
  {
    productId: "prod_notebook",
    sku: "SKU-NTB-01",
    name: "Notebook",
    description: "A5 dotted notebook, 96 pages.",
    category: "accessory",
    price: { amountMinor: 900, currency: "EUR" },
    inventory: 15,
  },
  {
    productId: "prod_backpack",
    sku: "SKU-BPK-01",
    name: "Backpack",
    description: "Canvas backpack, 18L.",
    category: "accessory",
    price: { amountMinor: 4500, currency: "EUR" },
    inventory: 8,
  },
];

@Injectable()
export class CatalogService {
  // TODO: replace with Prisma-backed repository call.
  list(): ProductsResponse {
    return { items: CATALOG };
  }

  // Lookup by productId. `prod_unknown` is treated as missing so error-path
  // tests have a stable case to hit without seeding any store.
  getById(productId: string): Product {
    const product = CATALOG.find((p) => p.productId === productId);
    if (!product) {
      throw new NotFoundException(`product ${productId} not found`);
    }
    return product;
  }
}
