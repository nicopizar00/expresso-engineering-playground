// Cart domain module — fictional mini-commerce store.
//
// Responsibility: maintain a per-session in-memory cart for the
// playground (cart/session evolution — one cart per `sid` cookie, not one
// global cart).
// Public surface (current iteration — mocked):
//   - GET    /cart               — return the current session's cart
//   - POST   /cart/items         — add the one allowed product line
//   - PATCH  /cart/items/:itemId — always rejected once selected (CUP-001)
//   - DELETE /cart/items/:itemId — always rejected once selected (CUP-001)
//
// Depends on CatalogModule for product lookups via its public service
// surface, and SessionModule for session id resolution.
//
// TODO (next iterations):
//   - Back service with a Prisma-backed repository

import { Module } from "@nestjs/common";
import { DomainEventsModule } from "../../core/domain-events/domain-events.module";
import { SessionModule } from "../../core/session/session.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

@Module({
  imports: [CatalogModule, DomainEventsModule, SessionModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
