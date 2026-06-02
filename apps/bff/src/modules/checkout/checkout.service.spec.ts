import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { CartService } from "../cart/cart.service";
import { OrdersService } from "../orders/orders.service";
import { CheckoutService } from "./checkout.service";

const CART_ITEMS = [
  {
    itemId: "ci_001",
    productId: "prod_espresso",
    name: "Espresso",
    quantity: 2,
    unitPrice: { amountMinor: 180, currency: "EUR" },
    lineTotal: { amountMinor: 360, currency: "EUR" },
  },
];

const ORDER = {
  orderId: "ord_001",
  customerName: "Test Customer",
  status: "pending",
  total: { amountMinor: 360, currency: "EUR" },
  lines: [],
  placedAt: "2026-05-29T12:00:00.000Z",
  updatedAt: "2026-05-29T12:00:00.000Z",
};

function makeCart(items = CART_ITEMS) {
  return {
    currentItems: vi.fn().mockReturnValue(items),
    clear: vi.fn(),
  };
}

function makeOrders() {
  return {
    create: vi.fn().mockResolvedValue(ORDER),
    findByClientRequestId: vi.fn().mockReturnValue(undefined),
  };
}

function makeDomainEvents() {
  return { emit: vi.fn() };
}

async function makeService(
  cart: ReturnType<typeof makeCart> = makeCart(),
  orders: ReturnType<typeof makeOrders> = makeOrders(),
  domainEvents: ReturnType<typeof makeDomainEvents> = makeDomainEvents(),
) {
  const module = await Test.createTestingModule({
    providers: [
      CheckoutService,
      { provide: CartService, useValue: cart },
      { provide: OrdersService, useValue: orders },
      { provide: DomainEventsService, useValue: domainEvents },
    ],
  }).compile();
  return module.get(CheckoutService);
}

describe("CheckoutService", () => {
  let service: CheckoutService;
  let cart: ReturnType<typeof makeCart>;
  let orders: ReturnType<typeof makeOrders>;
  let domainEvents: ReturnType<typeof makeDomainEvents>;

  beforeEach(async () => {
    cart = makeCart();
    orders = makeOrders();
    domainEvents = makeDomainEvents();
    service = await makeService(cart, orders, domainEvents);
  });

  describe("checkout()", () => {
    const PAYLOAD = { customerName: "Test Customer" };

    it("throws BadRequestException when cart is empty", async () => {
      cart = makeCart([]);
      service = await makeService(cart, orders, domainEvents);
      await expect(service.checkout(PAYLOAD)).rejects.toThrow(BadRequestException);
    });

    it("does not call orders.create or cart.clear on empty cart", async () => {
      cart = makeCart([]);
      service = await makeService(cart, orders, domainEvents);
      await expect(service.checkout(PAYLOAD)).rejects.toThrow();
      expect(orders.create).not.toHaveBeenCalled();
      expect(cart.clear).not.toHaveBeenCalled();
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("calls orders.create with lines derived from cart items", async () => {
      await service.checkout(PAYLOAD);
      expect(orders.create).toHaveBeenCalledOnce();
      expect(orders.create).toHaveBeenCalledWith({
        customerName: "Test Customer",
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
      });
    });

    it("clears the cart after creating the order", async () => {
      const callOrder: string[] = [];
      orders.create.mockImplementation(async () => {
        callOrder.push("create");
        return ORDER;
      });
      cart.clear.mockImplementation(() => {
        callOrder.push("clear");
      });
      await service.checkout(PAYLOAD);
      expect(callOrder).toEqual(["create", "clear"]);
    });

    it("emits a domain event after clearing the cart", async () => {
      await service.checkout(PAYLOAD);
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("passes idempotencyKey through to orders.create as clientRequestId", async () => {
      await service.checkout({ ...PAYLOAD, idempotencyKey: "key-fresh" });
      expect(orders.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientRequestId: "key-fresh" }),
      );
    });

    it("replays an existing order on a known key without touching cart or emitting", async () => {
      orders.findByClientRequestId.mockReturnValue(ORDER);

      const response = await service.checkout({ ...PAYLOAD, idempotencyKey: "key-replay" });

      expect(response.orderId).toBe(ORDER.orderId);
      expect(orders.create).not.toHaveBeenCalled();
      expect(cart.currentItems).not.toHaveBeenCalled();
      expect(cart.clear).not.toHaveBeenCalled();
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("does not surface 'cart is empty' on idempotent replay after a prior successful checkout", async () => {
      cart = makeCart([]);
      orders.findByClientRequestId.mockReturnValue(ORDER);
      service = await makeService(cart, orders, domainEvents);

      const response = await service.checkout({ ...PAYLOAD, idempotencyKey: "key-replay" });
      expect(response.orderId).toBe(ORDER.orderId);
    });

    it("returns the expected CheckoutResponse shape", async () => {
      const response = await service.checkout(PAYLOAD);
      expect(response).toMatchObject({
        orderId: "ord_001",
        cartId: "cart_demo",
        customerName: "Test Customer",
        status: "pending",
        total: { amountMinor: 360, currency: "EUR" },
      });
      expect(typeof response.placedAt).toBe("string");
    });
  });
});
