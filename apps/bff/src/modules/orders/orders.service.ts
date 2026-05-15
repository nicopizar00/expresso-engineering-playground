import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { OrderStatus } from "@mini-commerce/shared-types";
import type { ManageOrderDto } from "./orders.dto";
import type {
  CreateOrderInput,
  ManageOrderResponse,
  Order,
} from "./orders.types";

// In-memory order store. Pre-seeded with `ord_demo` so the playground UI
// can exercise GET /orders/:id and POST /orders/:id/manage without first
// running a checkout.
//
// TODO(next-steps/orders-persistence): swap this Map for Prisma + an onModuleInit cache (mirror the CatalogService pattern so VisualizationService.orderItems() stays sync). See docs/next-steps/orders-persistence.md
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  // Frozen clock keeps responses deterministic across runs.
  private readonly placedAt = "2026-05-14T12:00:00.000Z";
  private readonly acceptedAt = "2026-05-14T12:05:00.000Z";
  private nextOrderSeq = 1;

  private readonly orders = new Map<string, Order>([
    [
      "ord_demo",
      {
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
          {
            productId: "prod_cookie",
            name: "Cookie",
            quantity: 1,
            unitPrice: { amountMinor: 200, currency: "EUR" },
            lineTotal: { amountMinor: 200, currency: "EUR" },
          },
        ],
        total: { amountMinor: 560, currency: "EUR" },
        placedAt: this.placedAt,
        updatedAt: this.placedAt,
      },
    ],
  ]);

  listAll(): ReadonlyArray<Order> {
    return Array.from(this.orders.values());
  }

  get(orderId: string): Order {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new NotFoundException(`order ${orderId} not found`);
    }
    return order;
  }

  // Called by CheckoutService. Returns the newly created order.
  create(input: CreateOrderInput): Order {
    const orderId = `ord_${String(this.nextOrderSeq).padStart(3, "0")}`;
    this.nextOrderSeq += 1;
    const order: Order = {
      orderId,
      customerName: input.customerName,
      status: "pending",
      lines: input.lines,
      total: input.total,
      placedAt: this.placedAt,
      updatedAt: this.placedAt,
    };
    this.orders.set(orderId, order);
    this.logger.log(`order created id=${orderId} total=${input.total.amountMinor}`);
    return order;
  }

  // Apply a mocked management action. Each action deterministically maps to
  // a next status. Invalid transitions return 400 so the API contract stays
  // predictable.
  manage(orderId: string, payload: ManageOrderDto): ManageOrderResponse {
    const current = this.get(orderId);
    const previousStatus = current.status;

    const nextStatus: OrderStatus = (() => {
      switch (payload.action) {
        case "cancel":
          return "cancelled";
        case "mark_prepared":
          return "prepared";
        case "update_status":
          if (!payload.nextStatus) {
            throw new BadRequestException(
              "nextStatus is required when action is update_status",
            );
          }
          return payload.nextStatus;
      }
    })();

    const updated: Order = {
      ...current,
      status: nextStatus,
      updatedAt: this.acceptedAt,
    };
    this.orders.set(orderId, updated);

    this.logger.log(
      `manage order=${orderId} action=${payload.action} ${previousStatus} -> ${nextStatus}`,
    );

    return {
      orderId,
      action: payload.action,
      previousStatus,
      status: nextStatus,
      acceptedAt: this.acceptedAt,
    };
  }
}
