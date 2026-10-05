// Orders domain module — fictional mini-commerce store.
//
// Responsibility: the order record after checkout. Placing an order is the
// final step — there is no preparation lifecycle or cancel. Hot/cold
// temperature is derived on read from placedAt.
// Public surface:
//   - GET /orders               — every order (oldest first)
//   - GET /orders/mine          — the caller's orders (session cookie), newest first
//   - GET /orders/:id           — a single order (404 for unknown)
//   - GET /orders/:id/status    — temperature read from Postgres
//                                 (cold after ORDER_COOL_DOWN_SECONDS)
//
// Pre-seeded with `ord_demo` (no session) so the playground has history.
//
// Strong candidate for Phase 3 extraction (owns post-purchase state).

import { Module } from "@nestjs/common";
import { DomainEventsModule } from "../../core/domain-events/domain-events.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ORDER_COOL_DOWN_MS, parseCoolDownSeconds } from "./order-temperature";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [DomainEventsModule, CatalogModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    {
      provide: ORDER_COOL_DOWN_MS,
      // Throws at bootstrap on an invalid value, so a misconfigured BFF
      // fails fast instead of serving wrong temperatures.
      useFactory: () =>
        parseCoolDownSeconds(process.env.ORDER_COOL_DOWN_SECONDS) * 1000,
    },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
