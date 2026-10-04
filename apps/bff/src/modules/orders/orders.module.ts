// Orders domain module — fictional mini-commerce store.
//
// Responsibility: order record after checkout, status lifecycle, simple
// mocked management actions.
// Public surface (current iteration — mocked, in-memory):
//   - GET  /orders/:id           — fetch a single order (404 for unknown)
//   - GET  /orders/:id/status    — status + hot/cold temperature read from
//                                  Postgres (cold after ORDER_COOL_DOWN_SECONDS)
//   - POST /orders/:id/manage    — apply cancel / update_status / mark_prepared
//
// Pre-seeded with `ord_demo` so the playground UI can exercise both
// endpoints without first running a checkout.
//
// Strong candidate for Phase 3 extraction (owns post-purchase state).
//
// TODO (next iterations):
//   - Real state machine (pending → preparing → prepared, plus cancelled)
//   - Idempotency keys backed by Postgres
//   - Publish order lifecycle events through a notification outbox

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
