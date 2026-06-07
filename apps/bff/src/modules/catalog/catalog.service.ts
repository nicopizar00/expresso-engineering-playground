import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
// TODO(vercel-build): @prisma/client types require `prisma generate` — ensured by package.json#build
import type { Product as DbProduct } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { PrismaService } from "../../prisma.service";
import type { CreateProductDto, Product, ProductsResponse } from "./catalog.types";

function toProduct(row: DbProduct): Product {
  return {
    productId: row.productId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category as Product["category"],
    price: { amountMinor: row.priceAmountMinor, currency: row.priceCurrency },
    inventory: row.inventory,
  };
}

@Injectable()
export class CatalogService implements OnModuleInit {
  private cache: Product[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  async onModuleInit() {
    const rows = await this.prisma.product.findMany({ orderBy: { createdAt: "asc" } });
    this.cache = rows.map(toProduct);
  }

  // Synchronous — reads from the in-memory cache populated at startup.
  // Keeping this sync preserves the VisualizationService contract without
  // requiring async changes across the module graph.
  list(): ProductsResponse {
    return { items: this.cache };
  }

  getById(productId: string): Product {
    const product = this.cache.find((p) => p.productId === productId);
    if (!product) {
      throw new NotFoundException(`product ${productId} not found`);
    }
    return product;
  }

  // Mirror a committed inventory change into the in-memory cache so reads
  // (catalog list, visualization) reflect it without a DB round-trip. Called
  // by OrdersService.create after its transaction commits. No-op for unknown
  // productIds — the DB is the source of truth and may legitimately know
  // about products this process has not yet cached.
  applyInventoryDelta(productId: string, delta: number): void {
    this.cache = this.cache.map((p) =>
      p.productId === productId
        ? { ...p, inventory: p.inventory + delta }
        : p,
    );
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const productId = `prod_${randomUUID().slice(0, 8)}`;
    const row = await this.prisma.product.create({
      data: {
        productId,
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        priceAmountMinor: dto.price.amountMinor,
        priceCurrency: dto.price.currency,
        inventory: dto.inventory,
      },
    });
    const product = toProduct(row);
    this.cache = [...this.cache, product];
    // Visualization SSE consumers need to see new catalog products land
    // without waiting for the next cart/checkout/order mutation. Mirrors
    // the pattern in CartService, OrdersService, and CheckoutService.
    this.domainEvents.emit();
    return product;
  }
}
