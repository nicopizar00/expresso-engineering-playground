import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { CatalogService } from "../catalog/catalog.service";
import { CartService } from "./cart.service";

const PRODUCT = {
  productId: "prod_espresso",
  sku: "ESP-001",
  name: "Espresso",
  description: "Short and strong",
  category: "coffee" as const,
  price: { amountMinor: 180, currency: "EUR" },
  inventory: 100,
};

function makeCatalog() {
  return {
    getById: vi.fn().mockReturnValue(PRODUCT),
  };
}

function makeDomainEvents() {
  return { emit: vi.fn() };
}

async function makeService(
  catalog: ReturnType<typeof makeCatalog> = makeCatalog(),
  domainEvents: ReturnType<typeof makeDomainEvents> = makeDomainEvents(),
) {
  const module = await Test.createTestingModule({
    providers: [
      CartService,
      { provide: CatalogService, useValue: catalog },
      { provide: DomainEventsService, useValue: domainEvents },
    ],
  }).compile();
  return module.get(CartService);
}

describe("CartService", () => {
  let service: CartService;
  let catalog: ReturnType<typeof makeCatalog>;
  let domainEvents: ReturnType<typeof makeDomainEvents>;

  beforeEach(async () => {
    catalog = makeCatalog();
    domainEvents = makeDomainEvents();
    service = await makeService(catalog, domainEvents);
  });

  describe("add()", () => {
    it("returns a cart with the added item", () => {
      const cart = service.add({ productId: "prod_espresso", quantity: 2 });
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.productId).toBe("prod_espresso");
      expect(cart.items[0]!.quantity).toBe(2);
      expect(cart.items[0]!.lineTotal).toEqual({ amountMinor: 360, currency: "EUR" });
    });

    it("emits a domain event", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("throws NotFoundException for an unknown product", () => {
      catalog.getById.mockImplementation(() => {
        throw new NotFoundException("product not found");
      });
      expect(() => service.add({ productId: "prod_unknown", quantity: 1 })).toThrow(
        NotFoundException,
      );
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("computes total from all lines", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      service.add({ productId: "prod_espresso", quantity: 2 });
      const cart = service.get();
      expect(cart.total).toEqual({ amountMinor: 540, currency: "EUR" });
    });
  });

  describe("updateQuantity()", () => {
    it("updates quantity and recomputes lineTotal", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      const itemId = service.get().items[0]!.itemId;
      const cart = service.updateQuantity(itemId, 3);
      expect(cart.items[0]!.quantity).toBe(3);
      expect(cart.items[0]!.lineTotal).toEqual({ amountMinor: 540, currency: "EUR" });
    });

    it("emits a domain event", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      const itemId = service.get().items[0]!.itemId;
      service.updateQuantity(itemId, 2);
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("throws NotFoundException for an unknown itemId", () => {
      expect(() => service.updateQuantity("ci_999", 1)).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe("remove()", () => {
    it("removes the item from the cart", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      const itemId = service.get().items[0]!.itemId;
      const cart = service.remove(itemId);
      expect(cart.items).toHaveLength(0);
    });

    it("emits a domain event", () => {
      service.add({ productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      const itemId = service.get().items[0]!.itemId;
      service.remove(itemId);
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("throws NotFoundException for an unknown itemId", () => {
      expect(() => service.remove("ci_999")).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe("get()", () => {
    it("returns an empty cart initially", () => {
      const cart = service.get();
      expect(cart.items).toHaveLength(0);
      expect(cart.total).toEqual({ amountMinor: 0, currency: "EUR" });
    });

    it("does not emit domain events", () => {
      service.get();
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });
});
