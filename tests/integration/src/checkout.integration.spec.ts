import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CatalogService } from "../../../apps/bff/src/modules/catalog/catalog.service";
import { DomainEventsService } from "../../../apps/bff/src/core/domain-events/domain-events.service";
import { OrdersService } from "../../../apps/bff/src/modules/orders/orders.service";
import type { CreateOrderInput } from "../../../apps/bff/src/modules/orders/orders.types";
import { ensureIntegrationDb, INTEGRATION_URL } from "./db-setup";

// Real-Postgres proof for the two correctness claims the unit tests can only
// approximate: (1) the per-line CAS decrement blocks oversell under concurrent
// checkouts, and (2) the P2002 unique-violation catch in OrdersService.create
// actually recovers a concurrent-retry race on the idempotency key.

const TEST_PRODUCT = {
  productId: "prod_int_espresso",
  sku: "SKU-INT-ESP-01",
  name: "Integration Espresso",
  description: "Integration test product. Truncated between tests.",
  category: "drink",
  priceAmountMinor: 200,
  priceCurrency: "EUR",
};

const baseInput = (quantity = 1): CreateOrderInput => ({
  customerName: "Integration Tester",
  lines: [
    {
      productId: TEST_PRODUCT.productId,
      name: TEST_PRODUCT.name,
      quantity,
      unitPrice: { amountMinor: 200, currency: "EUR" },
      lineTotal: { amountMinor: 200 * quantity, currency: "EUR" },
    },
  ],
  total: { amountMinor: 200 * quantity, currency: "EUR" },
});

let prisma: PrismaClient;

beforeAll(async () => {
  await ensureIntegrationDb();
  prisma = new PrismaClient({ datasources: { db: { url: INTEGRATION_URL } } });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function makeOrders(seedInventory: number): Promise<{
  orders: OrdersService;
  catalog: CatalogService;
  domainEvents: DomainEventsService;
}> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "OrderLine", "Order", "Product" RESTART IDENTITY CASCADE`,
  );
  await prisma.product.create({
    data: { ...TEST_PRODUCT, inventory: seedInventory },
  });

  const domainEvents = new DomainEventsService();
  // CatalogService and OrdersService are bound to PrismaService at the type
  // level only; at runtime the live PrismaClient instance satisfies the same
  // surface, so a structural cast is sufficient.
  const catalog = new CatalogService(prisma as never);
  await catalog.onModuleInit();
  const orders = new OrdersService(prisma as never, domainEvents, catalog);
  await orders.onModuleInit();
  return { orders, catalog, domainEvents };
}

describe("OrdersService.create (real Postgres)", () => {
  it("CAS guard prevents oversell under concurrent checkouts", async () => {
    const { orders } = await makeOrders(1);

    const results = await Promise.allSettled([
      orders.create(baseInput(1)),
      orders.create(baseInput(1)),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );

    const product = await prisma.product.findUnique({
      where: { productId: TEST_PRODUCT.productId },
    });
    expect(product?.inventory).toBe(0);

    expect(await prisma.order.count()).toBe(1);
  });

  it("sequential replay with same idempotency key returns the original order", async () => {
    const { orders } = await makeOrders(5);
    const key = "00000000-0000-4000-8000-000000000001";

    const first = await orders.create({ ...baseInput(1), clientRequestId: key });
    const second = await orders.create({ ...baseInput(1), clientRequestId: key });

    expect(second.orderId).toBe(first.orderId);
    expect(await prisma.order.count()).toBe(1);

    const product = await prisma.product.findUnique({
      where: { productId: TEST_PRODUCT.productId },
    });
    // Inventory decremented exactly once despite two checkout calls.
    expect(product?.inventory).toBe(4);
  });

  it("P2002 race recovery: concurrent retries with same key return one winner", async () => {
    const { orders } = await makeOrders(5);
    const key = "00000000-0000-4000-8000-000000000002";

    // Both calls miss the in-memory idempotency cache (empty at this point),
    // both enter their own transaction. One commits with the unique key; the
    // other catches P2002 and refetches the winner.
    const [a, b] = await Promise.all([
      orders.create({ ...baseInput(1), clientRequestId: key }),
      orders.create({ ...baseInput(1), clientRequestId: key }),
    ]);

    expect(a.orderId).toBe(b.orderId);
    expect(await prisma.order.count()).toBe(1);

    const product = await prisma.product.findUnique({
      where: { productId: TEST_PRODUCT.productId },
    });
    // Exactly one decrement persisted; the loser's tx rolled back.
    expect(product?.inventory).toBe(4);
  });
});
