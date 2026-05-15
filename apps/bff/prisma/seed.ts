import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCTS = [
  { productId: "prod_espresso", sku: "SKU-ESP-01", name: "Espresso",  description: "Single shot of espresso.",        category: "drink",     priceAmountMinor: 180,  priceCurrency: "EUR", inventory: 120 },
  { productId: "prod_latte",    sku: "SKU-LAT-01", name: "Latte",     description: "Espresso with steamed milk.",     category: "drink",     priceAmountMinor: 320,  priceCurrency: "EUR", inventory: 80  },
  { productId: "prod_sandwich", sku: "SKU-SND-01", name: "Sandwich",  description: "Cheese and tomato on sourdough.", category: "food",      priceAmountMinor: 550,  priceCurrency: "EUR", inventory: 25  },
  { productId: "prod_cookie",   sku: "SKU-CKE-01", name: "Cookie",    description: "Chocolate chip cookie.",          category: "food",      priceAmountMinor: 200,  priceCurrency: "EUR", inventory: 60  },
  { productId: "prod_water",    sku: "SKU-WTR-01", name: "Water",     description: "Still mineral water, 500ml.",     category: "drink",     priceAmountMinor: 150,  priceCurrency: "EUR", inventory: 200 },
  { productId: "prod_notebook", sku: "SKU-NTB-01", name: "Notebook",  description: "A5 dotted notebook, 96 pages.",   category: "accessory", priceAmountMinor: 900,  priceCurrency: "EUR", inventory: 15  },
  { productId: "prod_backpack", sku: "SKU-BPK-01", name: "Backpack",  description: "Canvas backpack, 18L.",           category: "accessory", priceAmountMinor: 4500, priceCurrency: "EUR", inventory: 8   },
];

async function main() {
  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { productId: product.productId },
      update: {},
      create: product,
    });
  }
  console.log(`Seeded ${PRODUCTS.length} products.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
