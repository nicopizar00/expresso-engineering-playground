import { Controller, Get, Param } from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import type { Product, ProductsResponse } from "./catalog.types";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("products")
  list(): ProductsResponse {
    return this.catalog.list();
  }

  @Get("products/:id")
  get(@Param("id") id: string): Product {
    return this.catalog.getById(id);
  }
}
