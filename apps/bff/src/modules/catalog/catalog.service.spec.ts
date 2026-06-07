import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { PrismaService } from "../../prisma.service";
import { CatalogService } from "./catalog.service";
import type { CreateProductDto } from "./catalog.types";

const DB_ROW = {
  id: 1,
  productId: "prod_espresso",
  sku: "SKU-ESP-01",
  name: "Espresso",
  description: "Single shot of espresso.",
  category: "drink",
  priceAmountMinor: 180,
  priceCurrency: "EUR",
  inventory: 120,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function makePrisma() {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue([DB_ROW]),
      create: vi.fn(),
    },
  };
}

function makeDomainEvents() {
  return { emit: vi.fn() };
}

async function makeService(
  prisma: ReturnType<typeof makePrisma>,
  domainEvents: ReturnType<typeof makeDomainEvents>,
) {
  const module = await Test.createTestingModule({
    providers: [
      CatalogService,
      { provide: PrismaService, useValue: prisma },
      { provide: DomainEventsService, useValue: domainEvents },
    ],
  }).compile();

  const service = module.get(CatalogService);
  await service.onModuleInit();
  return service;
}

describe("CatalogService", () => {
  let service: CatalogService;
  let prisma: ReturnType<typeof makePrisma>;
  let domainEvents: ReturnType<typeof makeDomainEvents>;

  beforeEach(async () => {
    prisma = makePrisma();
    domainEvents = makeDomainEvents();
    service = await makeService(prisma, domainEvents);
  });

  describe("list()", () => {
    it("returns products from the warm cache", () => {
      const result = service.list();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].productId).toBe("prod_espresso");
    });

    it("maps DB columns to the Product DTO shape", () => {
      const [product] = service.list().items;
      expect(product.price).toEqual({ amountMinor: 180, currency: "EUR" });
      expect(product.category).toBe("drink");
    });

    it("is synchronous — does not return a Promise", () => {
      expect(service.list()).not.toBeInstanceOf(Promise);
    });
  });

  describe("getById()", () => {
    it("returns the product when found in cache", () => {
      expect(service.getById("prod_espresso").name).toBe("Espresso");
    });

    it("throws NotFoundException for an unknown productId", () => {
      expect(() => service.getById("prod_unknown")).toThrow(NotFoundException);
    });
  });

  describe("applyInventoryDelta()", () => {
    it("decrements the cached inventory for the matched product", () => {
      service.applyInventoryDelta("prod_espresso", -5);
      expect(service.getById("prod_espresso").inventory).toBe(115);
    });

    it("supports positive deltas (e.g. cancel/refund flows)", () => {
      service.applyInventoryDelta("prod_espresso", 3);
      expect(service.getById("prod_espresso").inventory).toBe(123);
    });

    it("is a no-op for unknown productIds", () => {
      const before = service.list().items.map((p) => p.inventory);
      service.applyInventoryDelta("prod_unknown", -10);
      const after = service.list().items.map((p) => p.inventory);
      expect(after).toEqual(before);
    });
  });

  describe("create()", () => {
    const DTO: CreateProductDto = {
      sku: "SKU-NEW-01",
      name: "Croissant",
      description: "Buttery croissant.",
      category: "food",
      price: { amountMinor: 250, currency: "EUR" },
      inventory: 40,
    } as CreateProductDto;

    it("persists via prisma.product.create and returns the mapped product", async () => {
      const newRow = { ...DB_ROW, id: 2, productId: "prod_abcd1234", sku: "SKU-NEW-01", name: "Croissant" };
      prisma.product.create.mockResolvedValue(newRow);

      const product = await service.create(DTO);
      expect(product.name).toBe("Croissant");
      expect(prisma.product.create).toHaveBeenCalledOnce();
    });

    it("appends the new product to the cache so list() sees it immediately", async () => {
      const newRow = { ...DB_ROW, id: 2, productId: "prod_abcd1234", sku: "SKU-NEW-01", name: "Croissant" };
      prisma.product.create.mockResolvedValue(newRow);

      await service.create(DTO);
      expect(service.list().items).toHaveLength(2);
    });

    it("emits a domain-change signal so the visualization SSE stream sees the new product", async () => {
      const newRow = { ...DB_ROW, id: 2, productId: "prod_abcd1234", sku: "SKU-NEW-01", name: "Croissant" };
      prisma.product.create.mockResolvedValue(newRow);

      expect(domainEvents.emit).not.toHaveBeenCalled();
      await service.create(DTO);
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });
  });
});
