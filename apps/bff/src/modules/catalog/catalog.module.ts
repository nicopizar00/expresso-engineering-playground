// Catalog domain module — fictional mini-commerce store.
//
// Responsibility: product catalog and product lookup.
// Public surface (current iteration — mocked):
//   - GET /catalog/products       — return a deterministic list of products
//   - GET /catalog/products/:id   — return one product or 404
//
// TODO (next iterations):
//   - Filtering and pagination
//   - Back service with a Prisma-backed repository

import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
