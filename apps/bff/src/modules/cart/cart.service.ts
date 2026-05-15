import { Injectable, Logger } from "@nestjs/common";
import type { Money } from "@mini-commerce/shared-types";
import { CatalogService } from "../catalog/catalog.service";
import type { AddCartItemDto } from "./cart.dto";
import type { Cart, CartItem } from "./cart.types";

// Single-user in-memory cart. Sufficient for a playground where the BFF runs
// locally and the goal is manual interaction + smoke validation, not a real
// multi-tenant cart. State is per-process and resets on restart.
//
// TODO: replace with a cart store keyed by customerId + sessionId once
// persistence lands.
const CART_ID = "cart_demo";

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private items: CartItem[] = [];
  private nextItemSeq = 1;
  // Frozen clock keeps responses deterministic so smoke/contract tests are
  // stable across runs.
  private updatedAt = "2026-05-14T12:00:00.000Z";

  constructor(private readonly catalog: CatalogService) {}

  add(payload: AddCartItemDto): Cart {
    // Re-uses CatalogService through its public surface — same access path a
    // future extracted catalog service would use over the wire.
    const product = this.catalog.getById(payload.productId);
    const lineTotal: Money = {
      amountMinor: product.price.amountMinor * payload.quantity,
      currency: product.price.currency,
    };
    const item: CartItem = {
      itemId: `ci_${String(this.nextItemSeq).padStart(3, "0")}`,
      productId: product.productId,
      name: product.name,
      unitPrice: product.price,
      quantity: payload.quantity,
      lineTotal,
    };
    this.nextItemSeq += 1;
    this.items = [...this.items, item];
    this.logger.log(
      `cart add product=${product.productId} qty=${payload.quantity}`,
    );
    return this.snapshot();
  }

  get(): Cart {
    return this.snapshot();
  }

  // Consumed by CheckoutService after a successful checkout to reset state.
  clear(): void {
    this.items = [];
    this.nextItemSeq = 1;
  }

  // Internal helper used by CheckoutService to build the order from the
  // current cart without re-fetching products.
  currentItems(): ReadonlyArray<CartItem> {
    return this.items;
  }

  private snapshot(): Cart {
    const currency = this.items[0]?.unitPrice.currency ?? "EUR";
    const amountMinor = this.items.reduce(
      (sum, item) => sum + item.lineTotal.amountMinor,
      0,
    );
    const itemCount = this.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    return {
      cartId: CART_ID,
      items: this.items,
      itemCount,
      total: { amountMinor, currency },
      updatedAt: this.updatedAt,
    };
  }
}
