import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { CartService } from "../cart/cart.service";
import { OrdersService } from "../orders/orders.service";
import { VisualizationEventsService } from "../visualization/visualization-events.service";
import type { CheckoutDto } from "./checkout.dto";
import type { CheckoutResponse } from "./checkout.types";

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly cart: CartService,
    private readonly orders: OrdersService,
    private readonly vizEvents: VisualizationEventsService,
  ) {}

  // Mocked checkout — no real payment is processed. Consumes the current
  // cart, hands it to OrdersService.create(), then clears the cart so the
  // playground UI starts fresh.
  // TODO: real payment + idempotency once persistence is wired.
  async checkout(payload: CheckoutDto): Promise<CheckoutResponse> {
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
    });

    this.cart.clear();
    this.vizEvents.emit();

    this.logger.log(
      `checkout key=${payload.idempotencyKey ?? "n/a"} order=${order.orderId}`,
    );

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
