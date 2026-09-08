import { ConflictException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Money } from "@mini-commerce/shared-types";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
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
  // Live epoch (ms) of the last mutation. Used by the visualizer to
  // identify the cart as the "latest user action" item without breaking
  // the frozen `updatedAt` contract that smoke/contract tests assert on.
  // 0 means "never changed in this process lifetime".
  private lastChangedEpoch = 0;

  constructor(
    private readonly catalog: CatalogService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  lastChangedAt(): number {
    return this.lastChangedEpoch;
  }

  add(payload: AddCartItemDto): Cart {
    // CUP-001: the only allowed quantity is 1, and the only allowed cart
    // states are empty or one cup. No `await` runs between these checks and
    // the mutation below, so Node's single-threaded execution makes this
    // atomic across concurrent requests without extra locking.
    if (payload.quantity !== 1) {
      throw new BadRequestException("quantity must be exactly 1");
    }
    if (this.items.length > 0) {
      throw new ConflictException(
        "cart already holds the one allowed cup; place the order or wait for it to clear",
      );
    }
    // Re-uses CatalogService through its public surface — same access path a
    // future extracted catalog service would use over the wire. Also doubles
    // as the "reject any other product identity" guard: the catalog holds
    // only one product, so any other productId 404s here.
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
    this.lastChangedEpoch = Date.now();
    this.logger.log(
      `cart add product=${product.productId} qty=${payload.quantity}`,
    );
    const cart = this.snapshot();
    this.domainEvents.emit();
    return cart;
  }

  get(): Cart {
    return this.snapshot();
  }

  // CUP-001: once the one cup is selected, the only normal product action is
  // Place Order. Quantity change is rejected transactionally at this layer,
  // not just hidden in the UI.
  updateQuantity(itemId: string, quantity: number): Cart {
    const exists = this.items.some((item) => item.itemId === itemId);
    if (!exists) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    throw new ConflictException(
      `cannot change quantity to ${quantity}; once selected, only Place Order is allowed`,
    );
  }

  // CUP-001: removal is rejected once the cup is selected — the cart can
  // only be cleared by a successful Place Order (see `clear()`, called
  // internally by CheckoutService).
  remove(itemId: string): Cart {
    const exists = this.items.some((item) => item.itemId === itemId);
    if (!exists) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    throw new ConflictException(
      "removal is not allowed once the cup is selected; place the order or wait for it to clear",
    );
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
