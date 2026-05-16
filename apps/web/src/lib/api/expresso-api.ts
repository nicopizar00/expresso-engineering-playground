// Centralized BFF client for the mini-commerce / Expresso playground.
//
// All HTTP traffic from the web app goes through here. v0.app-generated
// components MUST NOT import `fetch` directly — they receive view models
// produced from these responses.
//
// The base URL comes from NEXT_PUBLIC_API_BASE_URL (root `.env` →
// `apps/web/.env.local` override). The fallback keeps the client usable in
// `next dev` without any env file. Never hardcode a non-local URL here.

// TODO(types): Replace these inline response shapes with imports from
//   `@mini-commerce/contracts` once those types are promoted out of the BFF
//   modules (see docs/frontend/v0-wiring-plan.md §"Expected data contracts").

export type Money = {
  amountMinor: number;
  currency: string;
};

export type ProductCategory = "drink" | "food" | "accessory";

export type Product = {
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: Money;
  inventory: number;
};

export type ProductsResponse = { items: Product[] };

export type CartItem = {
  itemId: string;
  productId: string;
  name: string;
  unitPrice: Money;
  quantity: number;
  lineTotal: Money;
};

export type Cart = {
  cartId: string;
  items: CartItem[];
  itemCount: number;
  total: Money;
  updatedAt: string;
};

export type AddCartItemInput = {
  productId: string;
  quantity: number;
};

export type CheckoutInput = {
  customerName: string;
  idempotencyKey?: string;
};

export type OrderStatus =
  | "pending"
  | "preparing"
  | "prepared"
  | "cancelled";

export type CheckoutResponse = {
  orderId: string;
  cartId: string;
  customerName: string;
  status: Extract<OrderStatus, "pending">;
  total: Money;
  placedAt: string;
};

export type OrderLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
};

export type Order = {
  orderId: string;
  customerName: string;
  status: OrderStatus;
  lines: OrderLine[];
  total: Money;
  placedAt: string;
  updatedAt: string;
};

export type OrderManageAction =
  | "cancel"
  | "update_status"
  | "mark_prepared";

export type ManageOrderInput = {
  action: OrderManageAction;
  nextStatus?: OrderStatus;
  reason?: string;
};

export type ManageOrderResponse = {
  orderId: string;
  action: OrderManageAction;
  previousStatus: OrderStatus;
  status: OrderStatus;
  acceptedAt: string;
};

export type HealthReport = {
  status: "ok";
  service: "bff";
  version: string;
  uptimeSeconds: number;
  checks: { db: "skipped" | "ok" | "down" };
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "http://localhost:3001";

function resolveBaseUrl(): string {
  // Read at call time, not module load time, so SSR + test overrides work.
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return raw && raw.length > 0 ? raw.replace(/\/$/, "") : DEFAULT_BASE_URL;
}

export class ExpressoApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${method} ${path} → HTTP ${status}`);
    this.name = "ExpressoApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const url = `${resolveBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    // TODO(api-wire): consider AbortController + per-call timeout once the
    //   first real screen needs it (page.tsx currently has no cancellation).
    ...init,
  });

  const text = await res.text();
  const parsed = text.length > 0 ? safeJson(text) : null;

  if (!res.ok) {
    throw new ExpressoApiError(method, path, res.status, parsed);
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Public API surface — mirrors the nine BFF endpoints, minus the
// /visualization-data aggregator (consumed only by apps/visualizer-3d).
// ---------------------------------------------------------------------------

export const expressoApi = {
  getHealth(): Promise<HealthReport> {
    return request<HealthReport>("GET", "/health");
  },

  getProducts(): Promise<ProductsResponse> {
    return request<ProductsResponse>("GET", "/catalog/products");
  },

  getProductById(productId: string): Promise<Product> {
    return request<Product>("GET", `/catalog/products/${encodeURIComponent(productId)}`);
  },

  addCartItem(input: AddCartItemInput): Promise<Cart> {
    return request<Cart>("POST", "/cart/items", input);
  },

  getCart(): Promise<Cart> {
    return request<Cart>("GET", "/cart");
  },

  checkout(input: CheckoutInput): Promise<CheckoutResponse> {
    return request<CheckoutResponse>("POST", "/checkout", input);
  },

  getOrderById(orderId: string): Promise<Order> {
    return request<Order>("GET", `/orders/${encodeURIComponent(orderId)}`);
  },

  manageOrder(orderId: string, input: ManageOrderInput): Promise<ManageOrderResponse> {
    return request<ManageOrderResponse>(
      "POST",
      `/orders/${encodeURIComponent(orderId)}/manage`,
      input,
    );
  },
};

export type ExpressoApi = typeof expressoApi;
