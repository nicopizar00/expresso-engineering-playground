import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUCTS = [
  {
    productId: "prod_espresso",
    sku: "SKU-ESP-01",
    name: "Cup of Coffee",
    description: "The one orderable product in this slice.",
    category: "drink",
    priceAmountMinor: 180,
    priceCurrency: "EUR",
    inventory: 120,
  },
];

async function main() {
  // CUP-001: the public catalog MUST return exactly one product. Delete any
  // product seeded by an older version of this script — OrderLine stores a
  // denormalized productId/name snapshot, so this is safe even if historical
  // orders reference a productId that no longer exists in Product.
  await prisma.product.deleteMany({
    where: { productId: { not: "prod_espresso" } },
  });

  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { productId: product.productId },
      update: product,
      create: product,
    });
  }
  console.log(`Seeded ${PRODUCTS.length} products.`);

  await prisma.order.upsert({
    where: { orderId: "ord_demo" },
    update: {},
    create: {
      orderId: "ord_demo",
      customerName: "Demo Customer",
      status: "pending",
      totalAmountMinor: 560,
      totalCurrency: "EUR",
      placedAt: new Date("2026-05-14T12:00:00.000Z"),
      lines: {
        create: [
          {
            productId: "prod_espresso",
            name: "Espresso",
            quantity: 2,
            unitAmountMinor: 180,
            unitCurrency: "EUR",
            lineAmountMinor: 360,
            lineCurrency: "EUR",
          },
          {
            productId: "prod_cookie",
            name: "Cookie",
            quantity: 1,
            unitAmountMinor: 200,
            unitCurrency: "EUR",
            lineAmountMinor: 200,
            lineCurrency: "EUR",
          },
        ],
      },
    },
  });
  console.log("Seeded ord_demo order.");

  const drinkParams = {
    bodyTopW: 0.25, bodyBotW: 0.30, bodyH: 0.28,
    saucerTopW: 0.48, saucerBotW: 0.32, saucerH: 0.06,
    gap: 0.04,
    handleW: 0.16, handleH: 0.22, handleGap: 0.03,
    coffeeShrink: 0.01, texSize: 16,
  };
  await prisma.assetConfig.upsert({
    where: { category: "drink" },
    update: { params: drinkParams },
    create: { category: "drink", params: drinkParams },
  });
  console.log("Seeded drink AssetConfig.");

  const foodParams = { width: 0.30, depth: 0.20, height: 0.10, texSize: 16 };
  await prisma.assetConfig.upsert({
    where: { category: "food" },
    update: { params: foodParams },
    create: { category: "food", params: foodParams },
  });
  console.log("Seeded food AssetConfig.");

  const accessoryParams = { width: 0.25, depth: 0.15, height: 0.35, texSize: 16 };
  await prisma.assetConfig.upsert({
    where: { category: "accessory" },
    update: { params: accessoryParams },
    create: { category: "accessory", params: accessoryParams },
  });
  console.log("Seeded accessory AssetConfig.");

  await prisma.assetModel.upsert({
    where: { category_variant: { category: "drink", variant: "default" } },
    update: {
      assetUrl: "/viz/models/classic_espreso_cup.glb",
      assetFormat: "glb",
      isPrimary: true,
    },
    create: {
      category: "drink",
      variant: "default",
      assetUrl: "/viz/models/classic_espreso_cup.glb",
      assetFormat: "glb",
      isPrimary: true,
    },
  });
  console.log("Seeded drink AssetModel.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
