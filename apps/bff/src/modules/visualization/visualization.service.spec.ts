import { describe, expect, it, vi } from "vitest";
import type { Cart } from "../cart/cart.types";
import type { Product } from "../catalog/catalog.types";
import type { Order } from "../orders/orders.types";
import { VisualizationService } from "./visualization.service";

const VALID_TYPES = new Set(["cube", "sphere", "marker"]);
const VALID_STATUSES = new Set(["ok", "warn", "error", "idle"]);

const PRODUCTS: Product[] = [
  {
    productId: "prod_espresso",
    sku: "SKU-ESP-01",
    name: "Espresso",
    description: "Single shot.",
    category: "drink",
    price: { amountMinor: 180, currency: "EUR" },
    inventory: 120,
  },
  {
    productId: "prod_backpack",
    sku: "SKU-BPK-01",
    name: "Backpack",
    description: "Canvas backpack.",
    category: "accessory",
    price: { amountMinor: 4500, currency: "EUR" },
    inventory: 8,
  },
];

const ORDERS: Order[] = [
  {
    orderId: "ord_demo",
    customerName: "Demo Customer",
    status: "pending",
    lines: [
      {
        productId: "prod_espresso",
        name: "Espresso",
        quantity: 2,
        unitPrice: { amountMinor: 180, currency: "EUR" },
        lineTotal: { amountMinor: 360, currency: "EUR" },
      },
    ],
    total: { amountMinor: 360, currency: "EUR" },
    placedAt: "2026-05-14T12:00:00.000Z",
    updatedAt: "2026-05-14T12:00:00.000Z",
  },
];

const EMPTY_CART: Cart = {
  cartId: "cart_demo",
  items: [],
  itemCount: 0,
  total: { amountMinor: 0, currency: "EUR" },
  updatedAt: "2026-05-14T12:00:00.000Z",
};

function makeSvc({
  products = PRODUCTS,
  orders = ORDERS,
  cart = EMPTY_CART,
  assetConfig = null,
  assetModel = null,
}: {
  products?: Product[] | (() => never);
  orders?: Order[] | (() => never);
  cart?: Cart | (() => never);
  assetConfig?: Record<string, number> | null;
  assetModel?: { assetUrl: string; assetFormat: string } | null;
} = {}) {
  const catalog = {
    list: typeof products === "function" ? vi.fn().mockImplementation(products) : vi.fn().mockReturnValue({ items: products }),
  };
  const ordersService = {
    listAll: typeof orders === "function" ? vi.fn().mockImplementation(orders) : vi.fn().mockReturnValue(orders),
  };
  const cartService = {
    get: typeof cart === "function" ? vi.fn().mockImplementation(cart) : vi.fn().mockReturnValue(cart),
    lastChangedAt: vi.fn().mockReturnValue(0),
  };
  const assets = {
    getConfig: vi.fn().mockReturnValue(assetConfig),
    getPrimaryModel: vi.fn().mockReturnValue(assetModel),
  };
  return new VisualizationService(catalog as any, ordersService as any, cartService as any, assets as any);
}

describe("VisualizationService", () => {
  it("returns items from all three domain sources", () => {
    const { items } = makeSvc().list();
    // 2 products + 1 order + 1 cart marker
    expect(items.length).toBe(4);
  });

  it("every item conforms to the VisualizationItem DTO shape", () => {
    const { items } = makeSvc().list();
    for (const item of items) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.label).toBe("string");
      expect(item.label.length).toBeGreaterThan(0);
      expect(VALID_TYPES.has(item.type)).toBe(true);
      expect(typeof item.value).toBe("number");
      expect(Number.isFinite(item.value)).toBe(true);
      expect(VALID_STATUSES.has(item.status)).toBe(true);
      expect(Number.isFinite(item.positionHint.x)).toBe(true);
      expect(Number.isFinite(item.positionHint.y)).toBe(true);
      expect(Number.isFinite(item.positionHint.z)).toBe(true);
      expect(typeof item.metadata).toBe("object");
    }
  });

  it("product items are cubes", () => {
    const { items } = makeSvc().list();
    const productItems = items.filter((i) => i.id.startsWith("viz_product_"));
    expect(productItems).toHaveLength(2);
    expect(productItems.every((i) => i.type === "cube")).toBe(true);
  });

  it("product status reflects inventory level", () => {
    const { items } = makeSvc().list();
    const espresso = items.find((i) => i.id === "viz_product_prod_espresso");
    const backpack = items.find((i) => i.id === "viz_product_prod_backpack");
    expect(espresso?.status).toBe("ok");   // inventory 120
    expect(backpack?.status).toBe("warn"); // inventory 8 < 20
  });

  it("order items are spheres with status mapped from order status", () => {
    const { items } = makeSvc().list();
    const orderItem = items.find((i) => i.id === "viz_order_ord_demo");
    expect(orderItem?.type).toBe("sphere");
    expect(orderItem?.status).toBe("warn"); // pending → warn
  });

  it("cancelled order maps to error status", () => {
    const cancelled: Order = { ...ORDERS[0], status: "cancelled" };
    const { items } = makeSvc({ orders: [cancelled] }).list();
    expect(items.find((i) => i.id === "viz_order_ord_demo")?.status).toBe("error");
  });

  it("cart item is a marker at the front-centre position", () => {
    const { items } = makeSvc().list();
    const cart = items.find((i) => i.id === "viz_cart_demo");
    expect(cart?.type).toBe("marker");
    expect(cart?.positionHint).toEqual({ x: 0, y: 0.35, z: 1.0 });
  });

  it("empty cart has idle status", () => {
    const { items } = makeSvc().list();
    expect(items.find((i) => i.id === "viz_cart_demo")?.status).toBe("idle");
  });

  it("non-empty cart has ok status", () => {
    const filledCart: Cart = { ...EMPTY_CART, itemCount: 2, total: { amountMinor: 360, currency: "EUR" } };
    const { items } = makeSvc({ cart: filledCart }).list();
    expect(items.find((i) => i.id === "viz_cart_demo")?.status).toBe("ok");
  });

  it("non-empty cart includes drink category so Three.js renders a cup", () => {
    const filledCart: Cart = { ...EMPTY_CART, itemCount: 1, total: { amountMinor: 180, currency: "EUR" } };
    const { items } = makeSvc({ cart: filledCart }).list();
    expect(items.find((i) => i.id === "viz_cart_demo")?.metadata.category).toBe("drink");
  });

  it("empty cart has no category so Three.js renders a generic marker", () => {
    const { items } = makeSvc().list();
    expect(items.find((i) => i.id === "viz_cart_demo")?.metadata.category).toBeUndefined();
  });

  it("all positions are within room bounds", () => {
    const { items } = makeSvc({ products: PRODUCTS.concat(...Array(5).fill(PRODUCTS[0])) }).list();
    for (const item of items) {
      expect(item.positionHint.x).toBeGreaterThanOrEqual(-2.5);
      expect(item.positionHint.x).toBeLessThanOrEqual(2.5);
      expect(item.positionHint.z).toBeGreaterThanOrEqual(-2.5);
      expect(item.positionHint.z).toBeLessThanOrEqual(2.5);
      expect(item.positionHint.y).toBeGreaterThan(0);
    }
  });

  it("output is deterministic across calls with the same inputs", () => {
    const svc = makeSvc();
    const first = svc.list();
    const second = svc.list();
    expect(second.items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));
    expect(second.items.map((i) => i.positionHint)).toEqual(first.items.map((i) => i.positionHint));
  });

  it("returns orders and cart when catalog throws (partial failure)", () => {
    const svc = makeSvc({ products: () => { throw new Error("catalog down"); } });
    const { items } = svc.list();
    expect(items.some((i) => i.id.startsWith("viz_order_"))).toBe(true);
    expect(items.some((i) => i.id === "viz_cart_demo")).toBe(true);
    expect(items.some((i) => i.id.startsWith("viz_product_"))).toBe(false);
  });

  it("returns catalog and cart when orders throws (partial failure)", () => {
    const svc = makeSvc({ orders: () => { throw new Error("orders down"); } });
    const { items } = svc.list();
    expect(items.some((i) => i.id.startsWith("viz_product_"))).toBe(true);
    expect(items.some((i) => i.id === "viz_cart_demo")).toBe(true);
    expect(items.some((i) => i.id.startsWith("viz_order_"))).toBe(false);
  });

  it("returns catalog and orders when cart throws (partial failure)", () => {
    const svc = makeSvc({ cart: () => { throw new Error("cart down"); } });
    const { items } = svc.list();
    expect(items.some((i) => i.id.startsWith("viz_product_"))).toBe(true);
    expect(items.some((i) => i.id.startsWith("viz_order_"))).toBe(true);
    expect(items.some((i) => i.id === "viz_cart_demo")).toBe(false);
  });

  it("attaches assetConfig as a JSON string to drink products", () => {
    const params = { bodyH: 0.36, texSize: 16 };
    const { items } = makeSvc({ assetConfig: params }).list();
    const espresso = items.find((i) => i.id === "viz_product_prod_espresso");
    expect(espresso?.metadata.assetConfig).toBe(JSON.stringify(params));
  });

  it("attaches GLB assetUrl + assetFormat to drink products when a primary model exists", () => {
    const { items } = makeSvc({
      assetModel: { assetUrl: "/viz/models/cup.glb", assetFormat: "glb" },
    }).list();
    const espresso = items.find((i) => i.id === "viz_product_prod_espresso");
    expect(espresso?.metadata.assetUrl).toBe("/viz/models/cup.glb");
    expect(espresso?.metadata.assetFormat).toBe("glb");
  });

  it("omits asset metadata when no config or model is registered", () => {
    const { items } = makeSvc().list();
    const espresso = items.find((i) => i.id === "viz_product_prod_espresso");
    expect(espresso?.metadata.assetConfig).toBeUndefined();
    expect(espresso?.metadata.assetUrl).toBeUndefined();
  });

  it("propagates drink assetConfig + GLB to a non-empty cart marker", () => {
    const filledCart: Cart = { ...EMPTY_CART, itemCount: 1, total: { amountMinor: 180, currency: "EUR" } };
    const params = { bodyH: 0.36 };
    const { items } = makeSvc({
      cart: filledCart,
      assetConfig: params,
      assetModel: { assetUrl: "/viz/models/cup.glb", assetFormat: "glb" },
    }).list();
    const cart = items.find((i) => i.id === "viz_cart_demo");
    expect(cart?.metadata.assetConfig).toBe(JSON.stringify(params));
    expect(cart?.metadata.assetUrl).toBe("/viz/models/cup.glb");
  });

  it("does not attach drink assets to an empty cart marker", () => {
    const { items } = makeSvc({
      assetConfig: { bodyH: 0.36 },
      assetModel: { assetUrl: "/viz/models/cup.glb", assetFormat: "glb" },
    }).list();
    const cart = items.find((i) => i.id === "viz_cart_demo");
    expect(cart?.metadata.assetConfig).toBeUndefined();
    expect(cart?.metadata.assetUrl).toBeUndefined();
  });
});
