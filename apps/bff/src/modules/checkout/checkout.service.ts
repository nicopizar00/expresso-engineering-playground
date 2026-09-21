import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from "@nestjs/common";
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
  async checkout(
    sessionId: string,
    payload: CheckoutDto,
  ): Promise<CheckoutResponse> {
    // Idempotent replay short-circuit. Runs BEFORE the cart-empty check so
    // a retry after a successful first call (which already cleared the cart)
    // does not surface a spurious "cart is empty" error.
    if (payload.idempotencyKey) {
      const replay = this.orders.findByClientRequestId(payload.idempotencyKey);
      if (replay) {
        this.logger.log(
          `checkout replay key=${payload.idempotencyKey} order=${replay.orderId}`,
        );
        return this.toResponse(replay, payload.cartId);
      }
    }

    const currentCart = this.cart.get(sessionId);
    if (currentCart.items.length === 0) {
      throw new BadRequestException("cart is empty");
    }
    // Also catches an expired reservation the client hasn't refreshed yet:
    // CartService already evicted it above, so cartId is now null and
    // never equals the client's stale value.
    if (currentCart.cartId !== payload.cartId) {
      throw new ConflictException(
        "cart id mismatch; refresh your cart and try again",
      );
    }

    const lines = currentCart.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    }));

    const currency = lines[0]?.unitPrice.currency ?? "EUR";
    const total = {
      amountMinor: lines.reduce(
        (sum, line) => sum + line.lineTotal.amountMinor,
        0,
      ),
      currency,
    };

    let order;
    try {
      order = await this.orders.create({
        lines,
        total,
        clientRequestId: payload.idempotencyKey,
      });
    } catch (err) {
      // CUP-001: once selected, only a successful Place Order clears the
      // cart — but a ConflictException here means the CAS inventory guard
      // found nothing left to sell. Retrying can never succeed for this
      // cup, and remove/re-add are both rejected once the cart is
      // occupied, so without this the user is stuck holding an
      // unfulfillable selection forever. Clear it so they see the real
      // out-of-stock state instead. Any other failure (network, DB) is
      // left alone — a plain retry is the correct recovery there.
      if (err instanceof ConflictException) {
        this.cart.clear(sessionId);
        this.domainEvents.emit();
        this.logger.log(
          `checkout key=${payload.idempotencyKey ?? "n/a"} cleared cart after inventory exhaustion`,
        );
      }
      throw err;
    }

    this.cart.clear(sessionId);
    this.domainEvents.emit();

    this.logger.log(
      `checkout key=${payload.idempotencyKey ?? "n/a"} order=${order.orderId}`,
    );

    return this.toResponse(order, payload.cartId);
  }

  // Replay returns the original creation receipt. The order's current status
  // (may now be cancelled/prepared) is intentionally not reflected here —
  // callers wanting live status should hit GET /orders/:id. `cartId` isn't
  // persisted on the order (checkout is the only place it's meaningful), so
  // it's just echoed back from whichever request produced this response.
  private toResponse(
    order: {
      orderId: string;
      customerName: string | null;
      total: CheckoutResponse["total"];
      placedAt: string;
    },
    cartId: string,
  ): CheckoutResponse {
    return {
      orderId: order.orderId,
      cartId,
      customerName: order.customerName,
      status: "pending",
      total: order.total,
      placedAt: order.placedAt,
    };
  }
}
