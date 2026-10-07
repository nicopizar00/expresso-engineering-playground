import type { Page, Route } from "@playwright/test";

export type Money = {
  amountMinor: number;
  currency: string;
};

export type Product = {
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: "drink" | "food" | "accessory";
  price: Money;
  inventory: number;
};

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

export type Order = {
  orderId: string;
  customerName: string | null;
  lines: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: Money;
    lineTotal: Money;
  }>;
  total: Money;
  placedAt: string;
  updatedAt: string;
  owner?: { username: string } | { email: string } | null;
};

export type OrderTemperature = "hot" | "cold";

export type CommerceApiMockOptions = {
  products: readonly Product[];
  failCatalog?: boolean;
  failAddToCart?: boolean;
  checkoutFailure?: "network-drop";
  // Orders present before the test starts (temperature is derived on read).
  seedOrders?: readonly Order[];
  // Mirrors the BFF's ORDER_COOL_DOWN_SECONDS, in ms. Default 5 minutes.
  coolDownMs?: number;
  // 1-based GET /orders/:id/status calls that answer 503 instead.
  failStatusCalls?: readonly number[];
  // Registered accounts the mocked /auth/* routes accept.
  accounts?: Array<{ username: string; email: string; password: string }>;
};

export function makeOrder(
  orderId: string,
  placedAt: string,
  owner: Order["owner"] = null,
): Order {
  return {
    orderId,
    customerName: null,
    owner,
    lines: [
      {
        productId: "prod_espresso_001",
        name: "Classic Espresso",
        quantity: 1,
        unitPrice: { amountMinor: 350, currency: "USD" },
        lineTotal: { amountMinor: 350, currency: "USD" },
      },
    ],
    total: { amountMinor: 350, currency: "USD" },
    placedAt,
    updatedAt: placedAt,
  };
}

const NOW = "2026-05-29T12:00:00.000Z";

export async function installCommerceApiMock(
  page: Page,
  options: CommerceApiMockOptions,
): Promise<void> {
  const currency = options.products[0]?.price.currency ?? "USD";
  let itemSequence = 1;
  let cartItems: CartItem[] = [];
  const orders = new Map<string, Order>(
    (options.seedOrders ?? []).map((order) => [order.orderId, order]),
  );
  // Orders placed through the mocked checkout belong to "this browser";
  // seed orders belong to nobody, mirroring the BFF's null-session rows.
  const myOrderIds = new Set<string>();
  const newestFirst = (a: Order, b: Order) =>
    Date.parse(b.placedAt) - Date.parse(a.placedAt);
  const coolDownMs = options.coolDownMs ?? 5 * 60 * 1000;
  let statusCalls = 0;
  let currentUser: { username: string; email: string } | null = null;
  const accounts = [...(options.accounts ?? [])];
  // Same rule as the BFF: hot until placedAt + cool-down, then cold.
  const withTemperature = (order: Order) => {
    const placed = Date.parse(order.placedAt);
    return {
      ...order,
      temperature: (Date.now() - placed < coolDownMs
        ? "hot"
        : "cold") as OrderTemperature,
      coolsAt: new Date(placed + coolDownMs).toISOString(),
    };
  };

  const money = (amountMinor: number): Money => ({ amountMinor, currency });
  const currentCart = (): Cart => ({
    cartId: "cart_e2e",
    items: cartItems,
    itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    total: money(
      cartItems.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0),
    ),
    updatedAt: NOW,
  });

  await page.addInitScript(() => {
    localStorage.removeItem("expresso_demo_mode");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const owner = new URL(request.url()).searchParams.get("owner");
    const path = pathname.startsWith("/api/bff")
      ? pathname.slice("/api/bff".length) || "/"
      : pathname;

    if (
      method === "GET" &&
      (path === "/products" || path === "/api/products")
    ) {
      return options.failCatalog
        ? fulfillJson(route, 500, { message: "Catalog unavailable" })
        : fulfillJson(route, 200, { items: options.products });
    }

    const productMatch = path.match(/^\/products\/([^/]+)$/);
    if (method === "GET" && productMatch?.[1]) {
      const product = options.products.find(
        (item) => item.productId === decodeURIComponent(productMatch[1]!),
      );
      return product
        ? fulfillJson(route, 200, product)
        : fulfillJson(route, 404, { message: "Product not found" });
    }

    if (method === "GET" && path === "/health") {
      return fulfillJson(route, 200, {
        status: "ok",
        service: "bff",
        version: "e2e",
        uptimeSeconds: 120,
        checks: { db: "ok" },
      });
    }

    if (method === "GET" && path === "/cart") {
      return fulfillJson(route, 200, currentCart());
    }

    if (method === "POST" && path === "/cart/items") {
      if (options.failAddToCart) {
        return fulfillJson(route, 500, { message: "cart unavailable" });
      }
      const body = request.postDataJSON() as {
        productId?: string;
        quantity?: number;
      } | null;
      const product = options.products.find(
        (item) => item.productId === body?.productId,
      );
      if (!product) {
        return fulfillJson(route, 404, { message: "Product not found" });
      }
      cartItems = upsertCartItem(
        cartItems,
        product,
        body?.quantity ?? 1,
        money,
        itemSequence++,
      );
      return fulfillJson(route, 201, currentCart());
    }

    const cartItemMatch = path.match(/^\/cart\/items\/([^/]+)$/);
    if (cartItemMatch?.[1] && method === "PATCH") {
      const itemId = decodeURIComponent(cartItemMatch[1]);
      const body = request.postDataJSON() as { quantity?: number } | null;
      cartItems = cartItems.map((item) => {
        if (item.itemId !== itemId) return item;
        const quantity = body?.quantity ?? item.quantity;
        return {
          ...item,
          quantity,
          lineTotal: money(item.unitPrice.amountMinor * quantity),
        };
      });
      return fulfillJson(route, 200, currentCart());
    }

    if (cartItemMatch?.[1] && method === "DELETE") {
      const itemId = decodeURIComponent(cartItemMatch[1]);
      cartItems = cartItems.filter((item) => item.itemId !== itemId);
      return fulfillJson(route, 200, currentCart());
    }

    if (method === "POST" && path === "/orders") {
      if (options.checkoutFailure === "network-drop") {
        return route.abort("failed");
      }
      const cart = currentCart();
      if (cart.items.length === 0) {
        return fulfillJson(route, 400, { message: "Cart is empty" });
      }
      const body = request.postDataJSON() as {
        customerName?: string;
        orderFor?: { type: string; recipient?: string };
      } | null;
      const orderFor = body?.orderFor;
      const type = orderFor?.type ?? (currentUser ? "self" : "guest");
      if (type === "self" && !currentUser) {
        return fulfillJson(route, 401, {
          statusCode: 401,
          error: { message: "sign in to order for yourself" },
        });
      }
      const recipient = orderFor?.recipient?.trim().toLowerCase();
      const owner: Order["owner"] =
        type === "self"
          ? { username: currentUser!.username }
          : type === "user" && recipient
            ? recipient.includes("@")
              ? { email: recipient }
              : { username: recipient }
            : null;
      const placedNow = new Date().toISOString();
      const order: Order = {
        orderId: `ord_e2e_${String(orders.size + 1).padStart(3, "0")}`,
        customerName: body?.customerName ?? null,
        lines: cart.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        total: cart.total,
        // Real clock so the order is hot at placement, like the BFF.
        placedAt: placedNow,
        updatedAt: placedNow,
        owner,
      };
      orders.set(order.orderId, order);
      myOrderIds.add(order.orderId);
      cartItems = [];
      return fulfillJson(route, 201, {
        orderId: order.orderId,
        cartId: cart.cartId,
        customerName: order.customerName,
        total: order.total,
        placedAt: order.placedAt,
      });
    }

    if (method === "GET" && path === "/orders") {
      // Mirrors the BFF: owner=session → this browser's orders, no owner →
      // all orders, anything else → 400.
      if (owner !== null && owner !== "session") {
        return fulfillJson(route, 400, {
          message: 'owner must be "session" when present',
        });
      }
      return fulfillJson(route, 200, {
        items: Array.from(orders.values())
          .filter((o) => owner === null || myOrderIds.has(o.orderId))
          .sort(newestFirst)
          .map(withTemperature),
      });
    }

    if (method === "GET" && path === "/me/orders") {
      if (!currentUser) {
        return fulfillJson(route, 401, {
          statusCode: 401,
          error: { message: "sign in to see your orders" },
        });
      }
      const user = currentUser;
      const mine = [...orders.values()]
        .filter(
          (o) =>
            o.owner &&
            ("username" in o.owner
              ? o.owner.username === user.username
              : o.owner.email === user.email),
        )
        .sort(newestFirst)
        .map(withTemperature);
      return fulfillJson(route, 200, { items: mine, latest: mine[0] ?? null });
    }

    if (method === "GET" && path === "/me/hot-status") {
      if (!currentUser) {
        return fulfillJson(route, 401, {
          statusCode: 401,
          error: { message: "sign in to see your hot coffees" },
        });
      }
      const user = currentUser;
      const now = Date.now();
      const hot = [...orders.values()].filter(
        (o) =>
          o.owner &&
          ("username" in o.owner
            ? o.owner.username === user.username
            : o.owner.email === user.email) &&
          now - Date.parse(o.placedAt) < coolDownMs,
      );
      const earliest = Math.min(...hot.map((o) => Date.parse(o.placedAt)));
      return fulfillJson(route, 200, {
        hotCount: hot.length,
        nextCoolsAt: hot.length
          ? new Date(earliest + coolDownMs).toISOString()
          : null,
        serverTime: new Date(now).toISOString(),
      });
    }

    const statusMatch = path.match(/^\/orders\/([^/]+)\/status$/);
    if (statusMatch?.[1] && method === "GET") {
      statusCalls += 1;
      if (options.failStatusCalls?.includes(statusCalls)) {
        return fulfillJson(route, 503, { message: "Status unavailable" });
      }
      const order = orders.get(decodeURIComponent(statusMatch[1]));
      if (!order) {
        return fulfillJson(route, 404, { message: "Order not found" });
      }
      const { temperature, coolsAt } = withTemperature(order);
      return fulfillJson(route, 200, {
        orderId: order.orderId,
        temperature,
        placedAt: order.placedAt,
        coolsAt,
        checkedAt: new Date().toISOString(),
      });
    }

    const orderMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderMatch?.[1] && method === "GET") {
      const order = orders.get(decodeURIComponent(orderMatch[1]));
      return order
        ? fulfillJson(route, 200, withTemperature(order))
        : fulfillJson(route, 404, { message: "Order not found" });
    }

    if (method === "GET" && path === "/me") {
      return fulfillJson(route, 200, { user: currentUser });
    }
    if (method === "POST" && path === "/auth/login") {
      const body = request.postDataJSON() as {
        identifier?: string;
        password?: string;
      } | null;
      const key = body?.identifier?.trim().toLowerCase();
      const hit = accounts.find(
        (a) =>
          (a.username === key || a.email === key) &&
          a.password === body?.password,
      );
      if (!hit) {
        return fulfillJson(route, 401, {
          statusCode: 401,
          error: { message: "invalid credentials" },
        });
      }
      currentUser = { username: hit.username, email: hit.email };
      return fulfillJson(route, 200, currentUser);
    }
    if (method === "POST" && path === "/auth/register") {
      const body = request.postDataJSON() as {
        username: string;
        email: string;
        password: string;
      };
      const username = body.username.trim().toLowerCase();
      const email = body.email.trim().toLowerCase();
      const clash = accounts.find((a) => a.username === username)
        ? "username"
        : accounts.find((a) => a.email === email)
          ? "email"
          : null;
      if (clash) {
        return fulfillJson(route, 409, {
          statusCode: 409,
          error: { message: `${clash} taken`, field: clash },
        });
      }
      accounts.push({ username, email, password: body.password });
      currentUser = { username, email };
      return fulfillJson(route, 201, currentUser);
    }
    if (method === "POST" && path === "/auth/logout") {
      currentUser = null;
      return route.fulfill({ status: 204, body: "" });
    }

    return fulfillJson(route, 404, {
      message: `Unhandled mock route ${method} ${path}`,
    });
  });
}

function upsertCartItem(
  items: CartItem[],
  product: Product,
  quantity: number,
  money: (amountMinor: number) => Money,
  sequence: number,
): CartItem[] {
  const existing = items.find((item) => item.productId === product.productId);
  if (!existing) {
    return [
      ...items,
      {
        itemId: `ci_e2e_${String(sequence).padStart(3, "0")}`,
        productId: product.productId,
        name: product.name,
        unitPrice: product.price,
        quantity,
        lineTotal: money(product.price.amountMinor * quantity),
      },
    ];
  }
  return items.map((item) => {
    if (item.productId !== product.productId) return item;
    const nextQuantity = item.quantity + quantity;
    return {
      ...item,
      quantity: nextQuantity,
      lineTotal: money(item.unitPrice.amountMinor * nextQuantity),
    };
  });
}

function fulfillJson(
  route: Route,
  status: number,
  body: unknown,
): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
