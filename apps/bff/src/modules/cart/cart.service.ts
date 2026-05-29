import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Money } from "@mini-commerce/shared-types";
import { VisualizationEventsService } from "../visualization/visualization-events.service";
import { CatalogService } from "../catalog/catalog.service";
import type { AddCartItemDto, UpdateCartItemDto } from "./cart.dto";
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

  constructor(
    private readonly catalog: CatalogService,
    private readonly vizEvents: VisualizationEventsService,
  ) {}

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
    const cart = this.snapshot();
    this.vizEvents.emit();
    return cart;
  }

  get(): Cart {
    return this.snapshot();
  }

  // Update an existing line's quantity, recomputing its line total from the
  // stored unit price. Throws 404 if the item is not in the cart.
  updateQuantity(itemId: string, quantity: number): Cart {
    const index = this.items.findIndex((item) => item.itemId === itemId);
    if (index === -1) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    const existing = this.items[index]!;
    const updated: CartItem = {
      ...existing,
      quantity,
      lineTotal: {
        amountMinor: existing.unitPrice.amountMinor * quantity,
        currency: existing.unitPrice.currency,
      },
    };
    this.items = this.items.map((item, i) => (i === index ? updated : item));
    this.logger.log(`cart update item=${itemId} qty=${quantity}`);
    const cart = this.snapshot();
    this.vizEvents.emit();
    return cart;
  }

  // Remove a line from the cart. Throws 404 if the item is not present.
  remove(itemId: string): Cart {
    const exists = this.items.some((item) => item.itemId === itemId);
    if (!exists) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    this.items = this.items.filter((item) => item.itemId !== itemId);
    this.logger.log(`cart remove item=${itemId}`);
    const cart = this.snapshot();
    this.vizEvents.emit();
    return cart;
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
