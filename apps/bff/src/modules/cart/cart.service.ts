import { ConflictException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Money } from "@mini-commerce/shared-types";
import { DomainEventsService } from "../../core/domain-events/domain-events.service";
import { CatalogService } from "../catalog/catalog.service";
import type { AddCartItemDto } from "./cart.dto";
import type { Cart, CartItem } from "./cart.types";

// Fixed display label on every returned Cart — not a real per-cart
// identifier. Session isolation comes from the Map key (sessionId), not
// from this field; nothing currently reads it as anything other than a
// constant.
const CART_ID = "cart_demo";

interface SessionCart {
  items: CartItem[];
  lastChangedEpoch: number;
}

function emptySessionCart(): SessionCart {
  return { items: [], lastChangedEpoch: 0 };
}

// Cart/session evolution: one cart per session id, in-memory, keyed by a
// Map instead of one process-wide singleton. Still fully in-memory and
// per-process — same "resets on BFF restart" design as before, just no
// longer shared across every browser hitting the BFF.
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private carts = new Map<string, SessionCart>();
  // Shared across sessions (not per-cart) so itemIds stay unique
  // service-wide even though carts themselves are session-scoped.
  private nextItemSeq = 1;
  // Frozen clock keeps responses deterministic so smoke/contract tests are
  // stable across runs.
  private updatedAt = "2026-05-14T12:00:00.000Z";

  constructor(
    private readonly catalog: CatalogService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  lastChangedAt(sessionId: string): number {
    return this.getOrCreate(sessionId).lastChangedEpoch;
  }

  add(sessionId: string, payload: AddCartItemDto): Cart {
    const state = this.getOrCreate(sessionId);
    // CUP-001: the only allowed quantity is 1, and the only allowed cart
    // states are empty or one cup — enforced per session. No `await` runs
    // between these checks and the mutation below, so Node's
    // single-threaded execution makes this atomic across concurrent
    // requests for the same session without extra locking.
    if (payload.quantity !== 1) {
      throw new BadRequestException("quantity must be exactly 1");
    }
    if (state.items.length > 0) {
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
    state.items = [...state.items, item];
    state.lastChangedEpoch = Date.now();
    this.logger.log(
      `cart add session=${sessionId} product=${product.productId} qty=${payload.quantity}`,
    );
    const cart = this.snapshot(state);
    this.domainEvents.emit();
    return cart;
  }

  get(sessionId: string): Cart {
    return this.snapshot(this.getOrCreate(sessionId));
  }

  // CUP-001: once the one cup is selected, the only normal product action is
  // Place Order. Quantity change is rejected transactionally at this layer,
  // not just hidden in the UI.
  updateQuantity(sessionId: string, itemId: string, quantity: number): Cart {
    const state = this.getOrCreate(sessionId);
    const exists = state.items.some((item) => item.itemId === itemId);
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
  remove(sessionId: string, itemId: string): Cart {
    const state = this.getOrCreate(sessionId);
    const exists = state.items.some((item) => item.itemId === itemId);
    if (!exists) {
      throw new NotFoundException(`Cart item ${itemId} not found`);
    }
    throw new ConflictException(
      "removal is not allowed once the cup is selected; place the order or wait for it to clear",
    );
  }

  // Consumed by CheckoutService after a successful checkout to reset state
  // for this session only.
  clear(sessionId: string): void {
    this.carts.set(sessionId, emptySessionCart());
  }

  // Internal helper used by CheckoutService to build the order from the
  // current cart without re-fetching products.
  currentItems(sessionId: string): ReadonlyArray<CartItem> {
    return this.getOrCreate(sessionId).items;
  }

  private getOrCreate(sessionId: string): SessionCart {
    let state = this.carts.get(sessionId);
    if (!state) {
      state = emptySessionCart();
      this.carts.set(sessionId, state);
    }
    return state;
  }

  private snapshot(state: SessionCart): Cart {
    const currency = state.items[0]?.unitPrice.currency ?? "EUR";
    const amountMinor = state.items.reduce(
      (sum, item) => sum + item.lineTotal.amountMinor,
      0,
    );
    const itemCount = state.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    return {
      cartId: CART_ID,
      items: state.items,
      itemCount,
      total: { amountMinor, currency },
      updatedAt: this.updatedAt,
    };
  }
}
