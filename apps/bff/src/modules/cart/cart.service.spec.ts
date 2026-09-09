import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";
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

const SESSION_A = "sid_test_a";
const SESSION_B = "sid_test_b";

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
      const cart = service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.productId).toBe("prod_espresso");
      expect(cart.items[0]!.quantity).toBe(1);
      expect(cart.items[0]!.lineTotal).toEqual({ amountMinor: 180, currency: "EUR" });
    });

    it("emits a domain event", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("throws NotFoundException for an unknown product", () => {
      catalog.getById.mockImplementation(() => {
        throw new NotFoundException("product not found");
      });
      expect(() =>
        service.add(SESSION_A, { productId: "prod_unknown", quantity: 1 }),
      ).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when quantity is not 1", () => {
      expect(() =>
        service.add(SESSION_A, { productId: "prod_espresso", quantity: 2 }),
      ).toThrow(BadRequestException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("throws ConflictException on a second add while the cart is occupied", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      expect(() =>
        service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 }),
      ).toThrow(ConflictException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get(SESSION_A).items).toHaveLength(1);
    });

    it("two different sessions can each independently hold their own cup", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      service.add(SESSION_B, { productId: "prod_espresso", quantity: 1 });

      expect(service.get(SESSION_A).items).toHaveLength(1);
      expect(service.get(SESSION_B).items).toHaveLength(1);
      expect(service.get(SESSION_A).items[0]!.itemId).not.toBe(
        service.get(SESSION_B).items[0]!.itemId,
      );
    });
  });

  describe("updateQuantity()", () => {
    it("throws ConflictException once the cup is selected, regardless of requested quantity", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      const itemId = service.get(SESSION_A).items[0]!.itemId;
      expect(() => service.updateQuantity(SESSION_A, itemId, 2)).toThrow(ConflictException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get(SESSION_A).items[0]!.quantity).toBe(1);
    });

    it("throws NotFoundException for an unknown itemId", () => {
      expect(() => service.updateQuantity(SESSION_A, "ci_999", 1)).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe("remove()", () => {
    it("throws ConflictException once the cup is selected", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      domainEvents.emit.mockClear();
      const itemId = service.get(SESSION_A).items[0]!.itemId;
      expect(() => service.remove(SESSION_A, itemId)).toThrow(ConflictException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
      expect(service.get(SESSION_A).items).toHaveLength(1);
    });

    it("throws NotFoundException for an unknown itemId", () => {
      expect(() => service.remove(SESSION_A, "ci_999")).toThrow(NotFoundException);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe("get()", () => {
    it("returns an empty cart initially", () => {
      const cart = service.get(SESSION_A);
      expect(cart.items).toHaveLength(0);
      expect(cart.total).toEqual({ amountMinor: 0, currency: "EUR" });
    });

    it("does not emit domain events", () => {
      service.get(SESSION_A);
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("a session never seen before starts empty, same as any other", () => {
      expect(service.get("sid_never_seen").items).toHaveLength(0);
    });
  });

  describe("clear()", () => {
    it("only clears the given session, leaving others untouched", () => {
      service.add(SESSION_A, { productId: "prod_espresso", quantity: 1 });
      service.add(SESSION_B, { productId: "prod_espresso", quantity: 1 });

      service.clear(SESSION_A);

      expect(service.get(SESSION_A).items).toHaveLength(0);
      expect(service.get(SESSION_B).items).toHaveLength(1);
    });
  });
});
