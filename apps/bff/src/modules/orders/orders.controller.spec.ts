import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import type { Order } from "./orders.types";

const DEMO_ORDER: Order = {
  orderId: "ord_demo",
  customerName: "Demo Customer",
  status: "pending",
  lines: [
    {
      productId: "prod_espresso",
      name: "Espresso",
      quantity: 2,
      unitPrice: { amountMinor: 180, currency: "EUR" },
      lineTotal: { amountMinor: 360, currency: "EUR" },
    },
  ],
  total: { amountMinor: 360, currency: "EUR" },
  placedAt: "2026-05-14T12:00:00.000Z",
  updatedAt: "2026-05-14T12:00:00.000Z",
};

function makeController(overrides: Partial<typeof OrdersService.prototype> = {}) {
  const svc = {
    listAll: vi.fn().mockReturnValue([DEMO_ORDER]),
    get: vi.fn().mockImplementation((id: string) => {
      if (id === "ord_demo") return DEMO_ORDER;
      throw new NotFoundException(`order ${id} not found`);
    }),
    ...overrides,
  };
  return {
    controller: new OrdersController(svc as unknown as OrdersService),
    svc,
  };
}

describe("OrdersController", () => {
  describe("GET /orders", () => {
    it("returns items from OrdersService.listAll()", () => {
      const { controller } = makeController();
      const result = controller.list();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].orderId).toBe("ord_demo");
    });

    it("wraps the array in an OrdersResponse envelope", () => {
      const { controller } = makeController();
      const result = controller.list();
      expect(result).toHaveProperty("items");
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("returns empty items when no orders exist", () => {
      const { controller } = makeController({ listAll: vi.fn().mockReturnValue([]) });
      const result = controller.list();
      expect(result.items).toHaveLength(0);
    });

    it("is synchronous — delegates to synchronous listAll()", () => {
      const { controller, svc } = makeController();
      controller.list();
      expect(svc.listAll).toHaveBeenCalledOnce();
    });
  });

  describe("GET /orders/:id", () => {
    it("returns the order when found", () => {
      const { controller } = makeController();
      expect(controller.get("ord_demo").orderId).toBe("ord_demo");
    });

    it("throws NotFoundException for unknown id", () => {
      const { controller } = makeController();
      expect(() => controller.get("ord_nope")).toThrow(NotFoundException);
    });
  });
});
