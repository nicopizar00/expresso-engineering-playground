// Checkout domain module — fictional mini-commerce store.
//
// Responsibility: convert the current cart into an order. No real payment
// processing is performed in this iteration.
// Public surface (current iteration — mocked):
//   - POST /checkout       — checkout the current cart, returns the new order
//
// Depends on CartModule and OrdersModule via their public services.
//
// TODO (next iterations):
//   - Real idempotency keyed by Idempotency-Key header
//   - Payment integration placeholder
//   - Emit order.placed via NotificationsModule (outbox)

import { Module } from "@nestjs/common";
import { CartModule } from "../cart/cart.module";
import { OrdersModule } from "../orders/orders.module";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";

@Module({
  imports: [CartModule, OrdersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
