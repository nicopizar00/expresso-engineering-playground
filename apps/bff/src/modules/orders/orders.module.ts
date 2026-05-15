// Orders domain module — fictional mini-commerce store.
//
// Responsibility: order record after checkout, status lifecycle, simple
// mocked management actions.
// Public surface (current iteration — mocked, in-memory):
//   - GET  /orders/:id           — fetch a single order (404 for unknown)
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
//   - Outbox for order.placed / order.prepared events to NotificationsModule

import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
