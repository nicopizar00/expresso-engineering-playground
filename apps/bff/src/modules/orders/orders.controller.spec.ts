import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { SessionService } from "../../core/session/session.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import type { Order } from "./orders.types";

const DEMO_ORDER: Order = {
  orderId: "ord_demo",
  customerName: "Demo Customer",
  owner: null,
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
  temperature: "hot",
  coolsAt: "2026-05-14T12:05:00.000Z",
};

function makeController(
  overrides: Partial<typeof OrdersService.prototype> = {},
  sessionId = "sid_test",
) {
  const svc = {
    listAll: vi.fn().mockReturnValue([DEMO_ORDER]),
    listForSession: vi.fn().mockReturnValue([]),
    get: vi.fn().mockImplementation((id: string) => {
      if (id === "ord_demo") return DEMO_ORDER;
      throw new NotFoundException(`order ${id} not found`);
    }),
    ...overrides,
  };
  const session = { resolveSessionId: vi.fn().mockReturnValue(sessionId) };
  return {
    controller: new OrdersController(
      svc as unknown as OrdersService,
      session as unknown as SessionService,
    ),
    svc,
    session,
  };
}

describe("OrdersController", () => {
  describe("GET /orders", () => {
    const req = {} as Request;
    const res = {} as Response;

    it("without owner returns all orders and never touches the session", () => {
      const { controller, svc, session } = makeController();
      const result = controller.list(undefined, req, res);
      expect(result).toEqual({ items: [DEMO_ORDER] });
      expect(svc.listAll).toHaveBeenCalledOnce();
      expect(session.resolveSessionId).not.toHaveBeenCalled();
    });

    it("returns empty items when no orders exist", () => {
      const { controller } = makeController({
        listAll: vi.fn().mockReturnValue([]),
      });
      expect(controller.list(undefined, req, res)).toEqual({ items: [] });
    });

    it("owner=session resolves the session and lists only its orders", () => {
      const { controller, svc, session } = makeController({
        listForSession: vi.fn().mockReturnValue([DEMO_ORDER]),
      });
      const result = controller.list("session", req, res);
      expect(session.resolveSessionId).toHaveBeenCalledWith(req, res);
      expect(svc.listForSession).toHaveBeenCalledWith("sid_test");
      expect(svc.listAll).not.toHaveBeenCalled();
      expect(result.items.map((o) => o.orderId)).toEqual(["ord_demo"]);
    });

    it("owner=session returns an empty envelope for a fresh session", () => {
      const { controller } = makeController({}, "sid_brand_new");
      expect(controller.list("session", req, res)).toEqual({ items: [] });
    });

    it.each([
      ["unknown value", "bogus"],
      ["empty value", ""],
      ["repeated param", ["session", "session"]],
    ] as const)("owner %s → 400", (_label, owner) => {
      const { controller, svc, session } = makeController();
      expect(() =>
        controller.list(owner as string | string[], req, res),
      ).toThrow(BadRequestException);
      expect(svc.listAll).not.toHaveBeenCalled();
      expect(session.resolveSessionId).not.toHaveBeenCalled();
    });

    it("has no mine handler", () => {
      expect(
        Object.getOwnPropertyNames(OrdersController.prototype),
      ).not.toContain("mine");
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

  describe("GET /orders/:id/status", () => {
    it("delegates to OrdersService.getStatus()", async () => {
      const status = {
        orderId: "ord_demo",
        temperature: "hot",
        placedAt: "2026-05-14T12:00:00.000Z",
        coolsAt: "2026-05-14T12:05:00.000Z",
        checkedAt: "2026-05-14T12:01:00.000Z",
      };
      const { controller, svc } = makeController({
        getStatus: vi.fn().mockResolvedValue(status),
      });
      await expect(controller.status("ord_demo")).resolves.toEqual(status);
      expect(svc.getStatus).toHaveBeenCalledWith("ord_demo");
    });
  });
});
