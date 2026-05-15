// Cart domain module — fictional mini-commerce store.
//
// Responsibility: maintain a single-user in-memory cart for the playground.
// Public surface (current iteration — mocked):
//   - GET  /cart          — return the current cart snapshot
//   - POST /cart/items    — add a product line to the cart
//
// Depends on CatalogModule for product lookups via its public service
// surface (the same access path a future extracted service would use).
//
// TODO (next iterations):
//   - PATCH /cart/items/:itemId, DELETE /cart/items/:itemId
//   - Key the cart by customerId / sessionId
//   - Back service with a Prisma-backed repository

import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

@Module({
  imports: [CatalogModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
