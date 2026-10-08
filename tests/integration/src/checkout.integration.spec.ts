import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainEventsService } from "../../../apps/bff/src/core/domain-events/domain-events.service";
import { OrdersService } from "../../../apps/bff/src/modules/orders/orders.service";
import type { CreateOrderInput } from "../../../apps/bff/src/modules/orders/orders.types";
import { ensureIntegrationDb, INTEGRATION_URL } from "./db-setup";

// Real-Postgres proof for the idempotency claims the unit tests can only
// approximate: a sequential replay returns the original order, and the P2002
// unique-violation catch in OrdersService.create actually recovers a
// concurrent-retry race on the idempotency key.

// Order lines snapshot productId/name, so no Product row is needed.
const TEST_PRODUCT = {
  productId: "prod_int_espresso",
  name: "Integration Espresso",
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

async function makeOrders(): Promise<OrdersService> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "OrderLine", "Order" RESTART IDENTITY CASCADE`,
  );

  // OrdersService is bound to PrismaService at the type level only; at
  // runtime the live PrismaClient instance satisfies the same surface, so a
  // structural cast is sufficient.
  const orders = new OrdersService(prisma as never, new DomainEventsService());
  await orders.onModuleInit();
  return orders;
}

describe("OrdersService.create (real Postgres)", () => {
  it("sequential replay with same idempotency key returns the original order", async () => {
    const orders = await makeOrders();
    const key = "00000000-0000-4000-8000-000000000001";

    const first = await orders.create({
      ...baseInput(1),
      clientRequestId: key,
    });
    const second = await orders.create({
      ...baseInput(1),
      clientRequestId: key,
    });

    expect(second.orderId).toBe(first.orderId);
    // One order persisted despite two checkout calls.
    expect(await prisma.order.count()).toBe(1);
  });

  it("P2002 race recovery: concurrent retries with same key return one winner", async () => {
    const orders = await makeOrders();
    const key = "00000000-0000-4000-8000-000000000002";

    // Both calls miss the in-memory idempotency cache (empty at this point),
    // both enter their own transaction. One commits with the unique key; the
    // other catches P2002 and refetches the winner.
    const [a, b] = await Promise.all([
      orders.create({ ...baseInput(1), clientRequestId: key }),
      orders.create({ ...baseInput(1), clientRequestId: key }),
    ]);

    expect(a.orderId).toBe(b.orderId);
    // Exactly one order persisted; the loser's insert failed on the key.
    expect(await prisma.order.count()).toBe(1);
  });
});
