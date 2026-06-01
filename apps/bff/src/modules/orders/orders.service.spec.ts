import { NotFoundException, BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order as DbOrder, OrderLine as DbOrderLine } from "@prisma/client";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { PrismaService } from "../../prisma.service";
import { CatalogService } from "../catalog/catalog.service";
import { OrdersService } from "./orders.service";
import type { CreateOrderInput, ManageOrderResponse } from "./orders.types";

const DB_ORDER: DbOrder & { lines: DbOrderLine[] } = {
  id: 1,
  orderId: "ord_demo",
  clientRequestId: null,
  customerName: "Demo Customer",
  status: "pending",
  totalAmountMinor: 560,
  totalCurrency: "EUR",
  placedAt: new Date("2026-05-14T12:00:00.000Z"),
  updatedAt: new Date("2026-05-14T12:00:00.000Z"),
  lines: [
    {
      id: 1,
      orderId: "ord_demo",
      productId: "prod_espresso",
      name: "Espresso",
      quantity: 2,
      unitAmountMinor: 180,
      unitCurrency: "EUR",
      lineAmountMinor: 360,
      lineCurrency: "EUR",
    },
    {
      id: 2,
      orderId: "ord_demo",
      productId: "prod_cookie",
      name: "Cookie",
      quantity: 1,
      unitAmountMinor: 200,
      unitCurrency: "EUR",
      lineAmountMinor: 200,
      lineCurrency: "EUR",
    },
  ],
};

function makePrisma() {
  // $transaction invokes the callback against the same mock so existing
  // assertions on prisma.order.create still see the call; product.updateMany
  // defaults to a single-row success (inventory check passes) and is
  // overridden per-test for oversell scenarios.
  const prisma: any = {
    order: {
      findMany: vi.fn().mockResolvedValue([DB_ORDER]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    product: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  prisma.$transaction = vi.fn(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
  return prisma;
}

function makeDomainEvents() {
  return { emit: vi.fn() };
}

function makeCatalog() {
  return { applyInventoryDelta: vi.fn() };
}

async function makeService(
  prisma: ReturnType<typeof makePrisma>,
  domainEvents: ReturnType<typeof makeDomainEvents> = makeDomainEvents(),
  catalog: ReturnType<typeof makeCatalog> = makeCatalog(),
) {
  const module = await Test.createTestingModule({
    providers: [
      OrdersService,
      { provide: PrismaService, useValue: prisma },
      { provide: DomainEventsService, useValue: domainEvents },
      { provide: CatalogService, useValue: catalog },
    ],
  }).compile();

  const service = module.get(OrdersService);
  await service.onModuleInit();
  return service;
}

describe("OrdersService", () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof makePrisma>;
  let domainEvents: ReturnType<typeof makeDomainEvents>;
  let catalog: ReturnType<typeof makeCatalog>;

  beforeEach(async () => {
    prisma = makePrisma();
    domainEvents = makeDomainEvents();
    catalog = makeCatalog();
    service = await makeService(prisma, domainEvents, catalog);
  });

  describe("onModuleInit()", () => {
    it("calls prisma.order.findMany with include and orderBy", async () => {
      expect(prisma.order.findMany).toHaveBeenCalledOnce();
      expect(prisma.order.findMany).toHaveBeenCalledWith({
        include: { lines: true },
        orderBy: { placedAt: "asc" },
      });
    });

    it("populates cache with mapped orders", async () => {
      const items = service.listAll();
      expect(items).toHaveLength(1);
      expect(items[0].orderId).toBe("ord_demo");
    });

    it("derives nextOrderSeq from max numeric orderId suffix", async () => {
      const newInput: CreateOrderInput = {
        customerName: "Test",
        lines: [],
        total: { amountMinor: 0, currency: "EUR" },
      };
      prisma.order.create.mockResolvedValue({
        ...DB_ORDER,
        id: 2,
        orderId: "ord_001",
      });

      await service.create(newInput);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: "ord_001",
          }),
        }),
      );
    });
  });

  describe("listAll()", () => {
    it("returns orders from the warm cache", () => {
      const result = service.listAll();
      expect(result).toHaveLength(1);
      expect(result[0].orderId).toBe("ord_demo");
    });

    it("maps DB columns to the Order DTO shape", () => {
      const [order] = service.listAll();
      expect(order.customerName).toBe("Demo Customer");
      expect(order.status).toBe("pending");
      expect(order.total).toEqual({ amountMinor: 560, currency: "EUR" });
      expect(order.lines).toHaveLength(2);
    });

    it("is synchronous — does not return a Promise", () => {
      expect(service.listAll()).not.toBeInstanceOf(Promise);
    });

    it("maps order line fields correctly", () => {
      const [order] = service.listAll();
      const [line1] = order.lines;
      expect(line1.productId).toBe("prod_espresso");
      expect(line1.name).toBe("Espresso");
      expect(line1.quantity).toBe(2);
      expect(line1.unitPrice).toEqual({ amountMinor: 180, currency: "EUR" });
      expect(line1.lineTotal).toEqual({ amountMinor: 360, currency: "EUR" });
    });

    it("converts placedAt and updatedAt to ISO strings", () => {
      const [order] = service.listAll();
      expect(typeof order.placedAt).toBe("string");
      expect(typeof order.updatedAt).toBe("string");
      expect(order.placedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(order.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("get()", () => {
    it("returns the order when found in cache", () => {
      expect(service.get("ord_demo").orderId).toBe("ord_demo");
    });

    it("throws NotFoundException for an unknown orderId", () => {
      expect(() => service.get("ord_unknown")).toThrow(NotFoundException);
    });

    it("is synchronous — does not return a Promise", () => {
      expect(service.get("ord_demo")).not.toBeInstanceOf(Promise);
    });
  });

  describe("create()", () => {
    const INPUT: CreateOrderInput = {
      customerName: "Test Customer",
      lines: [
        {
          productId: "prod_latte",
          name: "Latte",
          quantity: 1,
          unitPrice: { amountMinor: 320, currency: "EUR" },
          lineTotal: { amountMinor: 320, currency: "EUR" },
        },
      ],
      total: { amountMinor: 320, currency: "EUR" },
    };

    it("persists via prisma.order.create with nested lines", async () => {
      const newRow: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER,
        id: 2,
        orderId: "ord_001",
        customerName: "Test Customer",
        totalAmountMinor: 320,
      };
      prisma.order.create.mockResolvedValue(newRow);

      const order = await service.create(INPUT);
      expect(order.orderId).toBe("ord_001");
      expect(prisma.order.create).toHaveBeenCalledOnce();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: "ord_001",
            customerName: "Test Customer",
            status: "pending",
            totalAmountMinor: 320,
            totalCurrency: "EUR",
            lines: {
              create: expect.any(Array),
            },
          }),
          include: { lines: true },
        }),
      );
    });

    it("appends the new order to the cache", async () => {
      const newRow: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER,
        id: 2,
        orderId: "ord_001",
        customerName: "Test Customer",
        totalAmountMinor: 320,
      };
      prisma.order.create.mockResolvedValue(newRow);

      await service.create(INPUT);
      const items = service.listAll();
      expect(items).toHaveLength(2);
      expect(items[1].orderId).toBe("ord_001");
      // Creating an order pushes a visualization snapshot for SSE subscribers.
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("decrements inventory atomically per line inside the transaction", async () => {
      const newRow: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER, id: 2, orderId: "ord_001",
      };
      prisma.order.create.mockResolvedValue(newRow);

      await service.create(INPUT);

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { productId: "prod_latte", inventory: { gte: 1 } },
        data: { inventory: { decrement: 1 } },
      });
    });

    it("applies inventory delta to catalog cache after the transaction commits", async () => {
      const newRow: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER, id: 2, orderId: "ord_001",
      };
      prisma.order.create.mockResolvedValue(newRow);

      await service.create(INPUT);

      expect(catalog.applyInventoryDelta).toHaveBeenCalledWith("prod_latte", -1);
    });

    it("throws ConflictException when inventory CAS guard fails", async () => {
      prisma.product.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.create(INPUT)).rejects.toThrow(ConflictException);
      // Order row was never created, cache was never mutated, no event emitted.
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(catalog.applyInventoryDelta).not.toHaveBeenCalled();
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.listAll()).toHaveLength(1);
    });

    it("aborts before later lines if an earlier line fails the guard", async () => {
      // Two-line order where the second product is sold out.
      const TWO_LINE: CreateOrderInput = {
        ...INPUT,
        lines: [
          INPUT.lines[0]!,
          { ...INPUT.lines[0]!, productId: "prod_sold_out" },
        ],
      };
      prisma.product.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(service.create(TWO_LINE)).rejects.toThrow(ConflictException);
      // First-line decrement was attempted (and would roll back with the tx),
      // but the order row must not have been created.
      expect(prisma.product.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it("increments nextOrderSeq for successive creates", async () => {
      const newRow1: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER,
        id: 2,
        orderId: "ord_001",
        customerName: "Test Customer",
      };
      const newRow2: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER,
        id: 3,
        orderId: "ord_002",
        customerName: "Another Customer",
      };
      prisma.order.create
        .mockResolvedValueOnce(newRow1)
        .mockResolvedValueOnce(newRow2);

      await service.create(INPUT);
      await service.create(INPUT);
      const items = service.listAll();
      expect(items.map((o) => o.orderId)).toContain("ord_001");
      expect(items.map((o) => o.orderId)).toContain("ord_002");
    });

    it("persists clientRequestId when supplied", async () => {
      const newRow: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER, id: 2, orderId: "ord_001", clientRequestId: "key-1",
      };
      prisma.order.create.mockResolvedValue(newRow);

      await service.create({ ...INPUT, clientRequestId: "key-1" });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientRequestId: "key-1" }),
        }),
      );
    });

    it("replays from cache without touching the DB on a known key", async () => {
      // First call seeds the idempotency index.
      const firstRow: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER, id: 2, orderId: "ord_001", clientRequestId: "key-1",
      };
      prisma.order.create.mockResolvedValue(firstRow);
      const first = await service.create({ ...INPUT, clientRequestId: "key-1" });

      // Reset call counters so we can assert the replay path is a pure short-circuit.
      prisma.$transaction.mockClear();
      prisma.product.updateMany.mockClear();
      prisma.order.create.mockClear();
      catalog.applyInventoryDelta.mockClear();
      domainEvents.emit.mockClear();

      const replay = await service.create({ ...INPUT, clientRequestId: "key-1" });

      expect(replay.orderId).toBe(first.orderId);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(catalog.applyInventoryDelta).not.toHaveBeenCalled();
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("recovers from a concurrent-retry race via the P2002 unique violation", async () => {
      // Both retries reached the transaction; the other one won. Our tx
      // rolled back (so no inventory drift). We refetch and return the winner.
      const winner: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER, id: 2, orderId: "ord_001", clientRequestId: "key-race",
      };
      prisma.order.create.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
          meta: { target: ["clientRequestId"] },
        }),
      );
      prisma.order.findUnique.mockResolvedValue(winner);

      const replay = await service.create({ ...INPUT, clientRequestId: "key-race" });

      expect(replay.orderId).toBe("ord_001");
      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { clientRequestId: "key-race" },
        include: { lines: true },
      });
      // Race recovery skips the catalog cache delta — the winner's tx already
      // decremented inventory, and ours rolled back.
      expect(catalog.applyInventoryDelta).not.toHaveBeenCalled();
    });

    it("warms idempotencyIndex from DB on boot so cross-process replays hit the cache", async () => {
      const dbOrderWithKey: DbOrder & { lines: DbOrderLine[] } = {
        ...DB_ORDER, clientRequestId: "key-boot",
      };
      const freshPrisma = makePrisma();
      freshPrisma.order.findMany.mockResolvedValue([dbOrderWithKey]);
      const freshService = await makeService(freshPrisma);

      const replay = freshService.findByClientRequestId("key-boot");
      expect(replay?.orderId).toBe("ord_demo");
    });
  });

  describe("manage()", () => {
    it("cancels an order and updates cache", async () => {
      prisma.order.update.mockResolvedValue(DB_ORDER);

      const response = await service.manage("ord_demo", { action: "cancel" });

      expect(response).toEqual({
        orderId: "ord_demo",
        action: "cancel",
        previousStatus: "pending",
        status: "cancelled",
        acceptedAt: expect.any(String),
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { orderId: "ord_demo" },
        data: { status: "cancelled" },
      });
      expect(service.get("ord_demo").status).toBe("cancelled");
      // Managing an order pushes a visualization snapshot for SSE subscribers.
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("marks an order as prepared and updates cache", async () => {
      prisma.order.update.mockResolvedValue(DB_ORDER);

      const response = await service.manage("ord_demo", { action: "mark_prepared" });

      expect(response.status).toBe("prepared");
      expect(service.get("ord_demo").status).toBe("prepared");
    });

    it("updates status via update_status action", async () => {
      prisma.order.update.mockResolvedValue(DB_ORDER);

      const response = await service.manage("ord_demo", {
        action: "update_status",
        nextStatus: "preparing",
      });

      expect(response.status).toBe("preparing");
      expect(service.get("ord_demo").status).toBe("preparing");
    });

    it("throws BadRequestException if update_status has no nextStatus", async () => {
      await expect(
        service.manage("ord_demo", { action: "update_status" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException for unknown orderId", async () => {
      await expect(
        service.manage("ord_unknown", { action: "cancel" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("does not call DB if order not found", async () => {
      await expect(
        service.manage("ord_unknown", { action: "cancel" }),
      ).rejects.toThrow();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("returns ManageOrderResponse with acceptedAt timestamp", async () => {
      prisma.order.update.mockResolvedValue(DB_ORDER);

      const response = await service.manage("ord_demo", { action: "cancel" });

      expect(response.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(response.previousStatus).toBe("pending");
      expect(response.orderId).toBe("ord_demo");
    });
  });
});
