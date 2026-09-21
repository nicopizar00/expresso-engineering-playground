import { BadRequestException, ConflictException } from "@nestjs/common";
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
  customerName: null,
  status: "pending",
  total: { amountMinor: 360, currency: "EUR" },
  lines: [],
  placedAt: "2026-05-29T12:00:00.000Z",
  updatedAt: "2026-05-29T12:00:00.000Z",
};

const SESSION_ID = "sid_test";
const CART_ID = "cart_11111111-1111-1111-1111-111111111111";

function makeCart(items = CART_ITEMS, cartId: string | null = CART_ID) {
  return {
    get: vi.fn().mockReturnValue({
      cartId: items.length > 0 ? cartId : null,
      items,
      itemCount: items.length,
      total: { amountMinor: 0, currency: "EUR" },
      expiresAt: null,
      updatedAt: "2026-05-29T12:00:00.000Z",
    }),
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
    const PAYLOAD = { cartId: CART_ID };

    it("throws BadRequestException when cart is empty", async () => {
      cart = makeCart([]);
      service = await makeService(cart, orders, domainEvents);
      await expect(service.checkout(SESSION_ID, PAYLOAD)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws ConflictException when the cartId does not match the current cart", async () => {
      await expect(
        service.checkout(SESSION_ID, { ...PAYLOAD, cartId: "cart_other" }),
      ).rejects.toThrow(ConflictException);
      expect(orders.create).not.toHaveBeenCalled();
    });

    it("throws ConflictException when the cart carries no cartId (expired reservation, not yet re-added)", async () => {
      cart.get.mockReturnValue({
        cartId: null,
        items: CART_ITEMS,
        itemCount: 1,
        total: { amountMinor: 0, currency: "EUR" },
        expiresAt: null,
        updatedAt: "2026-05-29T12:00:00.000Z",
      });
      await expect(service.checkout(SESSION_ID, PAYLOAD)).rejects.toThrow(
        ConflictException,
      );
    });

    it("does not call orders.create or cart.clear on empty cart", async () => {
      cart = makeCart([]);
      service = await makeService(cart, orders, domainEvents);
      await expect(service.checkout(SESSION_ID, PAYLOAD)).rejects.toThrow();
      expect(orders.create).not.toHaveBeenCalled();
      expect(cart.clear).not.toHaveBeenCalled();
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("calls orders.create with lines derived from cart items and no customer name", async () => {
      await service.checkout(SESSION_ID, PAYLOAD);
      expect(orders.create).toHaveBeenCalledOnce();
      expect(orders.create).toHaveBeenCalledWith({
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
      await service.checkout(SESSION_ID, PAYLOAD);
      expect(callOrder).toEqual(["create", "clear"]);
    });

    it("emits a domain event after clearing the cart", async () => {
      await service.checkout(SESSION_ID, PAYLOAD);
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("passes idempotencyKey through to orders.create as clientRequestId", async () => {
      await service.checkout(SESSION_ID, {
        ...PAYLOAD,
        idempotencyKey: "key-fresh",
      });
      expect(orders.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientRequestId: "key-fresh" }),
      );
    });

    it("replays an existing order on a known key without touching cart or emitting", async () => {
      orders.findByClientRequestId.mockReturnValue(ORDER);

      const response = await service.checkout(SESSION_ID, {
        ...PAYLOAD,
        idempotencyKey: "key-replay",
      });

      expect(response.orderId).toBe(ORDER.orderId);
      expect(orders.create).not.toHaveBeenCalled();
      expect(cart.get).not.toHaveBeenCalled();
      expect(cart.clear).not.toHaveBeenCalled();
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("does not surface 'cart is empty' on idempotent replay after a prior successful checkout", async () => {
      cart = makeCart([]);
      orders.findByClientRequestId.mockReturnValue(ORDER);
      service = await makeService(cart, orders, domainEvents);

      const response = await service.checkout(SESSION_ID, {
        ...PAYLOAD,
        idempotencyKey: "key-replay",
      });
      expect(response.orderId).toBe(ORDER.orderId);
    });

    it("clears the cart and emits when order creation fails with insufficient inventory", async () => {
      orders.create.mockRejectedValueOnce(
        new ConflictException(
          "insufficient inventory for product prod_espresso",
        ),
      );
      await expect(service.checkout(SESSION_ID, PAYLOAD)).rejects.toThrow(
        ConflictException,
      );
      expect(cart.clear).toHaveBeenCalledOnce();
      expect(domainEvents.emit).toHaveBeenCalledOnce();
    });

    it("does not clear the cart when order creation fails with a non-conflict error", async () => {
      orders.create.mockRejectedValueOnce(new Error("db connection lost"));
      await expect(service.checkout(SESSION_ID, PAYLOAD)).rejects.toThrow(
        "db connection lost",
      );
      expect(cart.clear).not.toHaveBeenCalled();
      expect(domainEvents.emit).not.toHaveBeenCalled();
    });

    it("returns the expected CheckoutResponse shape", async () => {
      const response = await service.checkout(SESSION_ID, PAYLOAD);
      expect(response).toMatchObject({
        orderId: "ord_001",
        cartId: CART_ID,
        customerName: null,
        status: "pending",
        total: { amountMinor: 360, currency: "EUR" },
      });
      expect(typeof response.placedAt).toBe("string");
    });
  });
});
