import { hashPassword } from "../src/core/auth/password";
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

  // Login feature demo data (fictional). Password is documented in
  // docs/next-steps/login.md. Upsert keeps existing hashes stable.
  const DEMO_PASSWORD = "espresso-demo";
  for (const u of [
    { username: "ana", email: "ana@example.test" },
    { username: "ben", email: "ben@example.test" },
  ]) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, passwordHash: await hashPassword(DEMO_PASSWORD) },
    });
  }
  console.log("Seeded demo users ana, ben.");

  const HOUR = 60 * 60 * 1000;
  const seedLine = {
    productId: "prod_espresso",
    name: "Cup of Coffee",
    quantity: 1,
    unitAmountMinor: 180,
    unitCurrency: "EUR",
    lineAmountMinor: 180,
    lineCurrency: "EUR",
  };
  const ownedOrders = [
    // Re-stamped on every seed so ana always has one hot order to show.
    {
      orderId: "ord_seed_ana_1",
      ownerUsername: "ana",
      placedAt: new Date(),
      refresh: true,
    },
    {
      orderId: "ord_seed_ana_2",
      ownerEmail: "ana@example.test",
      placedAt: new Date(Date.now() - 24 * HOUR),
    },
    {
      orderId: "ord_seed_ben_1",
      ownerUsername: "ben",
      placedAt: new Date(Date.now() - 2 * HOUR),
    },
    // For an unregistered recipient: register cara@example.test to see it.
    {
      orderId: "ord_seed_cara_1",
      ownerEmail: "cara@example.test",
      placedAt: new Date(Date.now() - 3 * HOUR),
    },
  ];
  for (const { refresh, ...o } of ownedOrders) {
    await prisma.order.upsert({
      where: { orderId: o.orderId },
      update: refresh ? { placedAt: o.placedAt } : {},
      create: {
        ...o,
        totalAmountMinor: 180,
        totalCurrency: "EUR",
        lines: { create: [seedLine] },
      },
    });
  }
  console.log(`Seeded ${ownedOrders.length} owned orders.`);

  const drinkParams = {
    bodyTopW: 0.25,
    bodyBotW: 0.3,
    bodyH: 0.28,
    saucerTopW: 0.48,
    saucerBotW: 0.32,
    saucerH: 0.06,
    gap: 0.04,
    handleW: 0.16,
    handleH: 0.22,
    handleGap: 0.03,
    coffeeShrink: 0.01,
    texSize: 16,
  };
  await prisma.assetConfig.upsert({
    where: { category: "drink" },
    update: { params: drinkParams },
    create: { category: "drink", params: drinkParams },
  });
  console.log("Seeded drink AssetConfig.");

  const foodParams = { width: 0.3, depth: 0.2, height: 0.1, texSize: 16 };
  await prisma.assetConfig.upsert({
    where: { category: "food" },
    update: { params: foodParams },
    create: { category: "food", params: foodParams },
  });
  console.log("Seeded food AssetConfig.");

  const accessoryParams = {
    width: 0.25,
    depth: 0.15,
    height: 0.35,
    texSize: 16,
  };
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
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
