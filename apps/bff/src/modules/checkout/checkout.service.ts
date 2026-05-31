import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { CartService } from "../cart/cart.service";
import { OrdersService } from "../orders/orders.service";
import type { CheckoutDto } from "./checkout.dto";
import type { CheckoutResponse } from "./checkout.types";

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly cart: CartService,
    private readonly orders: OrdersService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  // Mocked checkout — no real payment is processed. Consumes the current
  // cart, hands it to OrdersService.create(), then clears the cart so the
  // playground UI starts fresh. When `idempotencyKey` is supplied, a retry
  // replays the original order without re-validating the (now-empty) cart.
  async checkout(payload: CheckoutDto): Promise<CheckoutResponse> {
    // Idempotent replay short-circuit. Runs BEFORE the cart-empty check so
    // a retry after a successful first call (which already cleared the cart)
    // does not surface a spurious "cart is empty" error.
    if (payload.idempotencyKey) {
      const replay = this.orders.findByClientRequestId(payload.idempotencyKey);
      if (replay) {
        this.logger.log(
          `checkout replay key=${payload.idempotencyKey} order=${replay.orderId}`,
        );
        return this.toResponse(replay);
      }
    }

    const items = this.cart.currentItems();
    if (items.length === 0) {
      throw new BadRequestException("cart is empty");
    }

    const lines = items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    }));

    const currency = lines[0]?.unitPrice.currency ?? "EUR";
    const total = {
      amountMinor: lines.reduce((sum, line) => sum + line.lineTotal.amountMinor, 0),
      currency,
    };

    const order = await this.orders.create({
      customerName: payload.customerName,
      lines,
      total,
      clientRequestId: payload.idempotencyKey,
    });

    this.cart.clear();
    this.domainEvents.emit();

    this.logger.log(
      `checkout key=${payload.idempotencyKey ?? "n/a"} order=${order.orderId}`,
    );

    return this.toResponse(order);
  }

  // Replay returns the original creation receipt. The order's current status
  // (may now be cancelled/prepared) is intentionally not reflected here —
  // callers wanting live status should hit GET /orders/:id.
  private toResponse(order: { orderId: string; customerName: string; total: CheckoutResponse["total"]; placedAt: string }): CheckoutResponse {
    return {
      orderId: order.orderId,
      cartId: "cart_demo",
      customerName: order.customerName,
      status: "pending",
      total: order.total,
      placedAt: order.placedAt,
    };
  }
}
