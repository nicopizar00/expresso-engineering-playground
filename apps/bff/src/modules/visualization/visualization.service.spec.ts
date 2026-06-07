import { describe, expect, it, vi } from "vitest";
import type { Cart } from "../cart/cart.types";
import type { Product } from "../catalog/catalog.types";
import type { Order } from "../orders/orders.types";
import { VisualizationService } from "./visualization.service";

const VALID_TYPES = new Set(["cube", "sphere", "marker"]);
const VALID_STATUSES = new Set(["ok", "warn", "error", "idle"]);
const VALID_ORDER_STATUSES = new Set(["pending", "preparing", "prepared", "cancelled"]);

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
  cartChangedAt = 0,
  assetConfig = null,
  assetModel = null,
}: {
  products?: Product[] | (() => never);
  orders?: Order[] | (() => never);
  cart?: Cart | (() => never);
  cartChangedAt?: number;
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
    lastChangedAt: vi.fn().mockReturnValue(cartChangedAt),
  };
  const assets = {
    getConfig: vi.fn().mockReturnValue(assetConfig),
    getPrimaryModel: vi.fn().mockReturnValue(assetModel),
  };
  return new VisualizationService(catalog as any, ordersService as any, cartService as any, assets as any);
}

describe("VisualizationService", () => {
  describe("legacy items[]", () => {
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

  describe("scene (semantic contract)", () => {
    it("returns a scene next to items[]", () => {
      const response = makeSvc().list();
      expect(response.scene).toBeDefined();
      expect(response.scene.products).toBeInstanceOf(Array);
      expect(response.scene.recentOrders).toBeInstanceOf(Array);
      expect(response.scene.orderAggregates).toBeDefined();
      expect(typeof response.scene.latestActivityAt).toBe("number");
    });

    it("scene.products carries one entry per catalog product with derived status", () => {
      const { scene } = makeSvc().list();
      expect(scene.products).toHaveLength(2);
      const espresso = scene.products.find((p) => p.productId === "prod_espresso");
      const backpack = scene.products.find((p) => p.productId === "prod_backpack");
      expect(espresso?.status).toBe("ok");
      expect(backpack?.status).toBe("warn");
      expect(espresso?.price).toEqual({ amountMinor: 180, currency: "EUR" });
    });

    it("scene.products attaches typed asset + assetConfig when AssetsService provides them", () => {
      const params = { bodyH: 0.36 };
      const model = { assetUrl: "/viz/models/cup.glb", assetFormat: "glb" };
      const { scene } = makeSvc({ assetConfig: params, assetModel: model }).list();
      const espresso = scene.products.find((p) => p.productId === "prod_espresso");
      expect(espresso?.asset).toEqual({ url: "/viz/models/cup.glb", format: "glb" });
      expect(espresso?.assetConfig).toEqual(params);
    });

    it("scene.products omits asset and assetConfig when none are registered", () => {
      const { scene } = makeSvc().list();
      const espresso = scene.products.find((p) => p.productId === "prod_espresso");
      expect(espresso?.asset).toBeUndefined();
      expect(espresso?.assetConfig).toBeUndefined();
    });

    it("scene.recentOrders carries SceneOrder entries with vizStatus mapping", () => {
      const { scene } = makeSvc().list();
      expect(scene.recentOrders).toHaveLength(1);
      const ord = scene.recentOrders[0];
      expect(ord.orderId).toBe("ord_demo");
      expect(VALID_ORDER_STATUSES.has(ord.status)).toBe(true);
      expect(ord.vizStatus).toBe("warn"); // pending → warn
      expect(ord.lineCount).toBe(1);
    });

    it("scene.recentOrders is capped at the RECENT_ORDER_WINDOW (10) most recent by updatedAt", () => {
      const many: Order[] = Array.from({ length: 14 }, (_, i) => ({
        ...ORDERS[0],
        orderId: `ord_${String(i).padStart(2, "0")}`,
        updatedAt: new Date(2026, 0, i + 1).toISOString(),
      }));
      const { scene } = makeSvc({ orders: many }).list();
      expect(scene.recentOrders).toHaveLength(10);
      // Newest first.
      expect(scene.recentOrders[0].orderId).toBe("ord_13");
      expect(scene.recentOrders[9].orderId).toBe("ord_04");
    });

    it("scene.orderAggregates math: totalCount + olderCount + statusCounts", () => {
      const orders: Order[] = [
        { ...ORDERS[0], orderId: "ord_a", status: "pending" },
        { ...ORDERS[0], orderId: "ord_b", status: "preparing" },
        { ...ORDERS[0], orderId: "ord_c", status: "prepared" },
        { ...ORDERS[0], orderId: "ord_d", status: "cancelled" },
        { ...ORDERS[0], orderId: "ord_e", status: "pending" },
      ];
      const { scene } = makeSvc({ orders }).list();
      expect(scene.orderAggregates.totalCount).toBe(5);
      expect(scene.orderAggregates.olderCount).toBe(0); // 5 ≤ window 10
      expect(scene.orderAggregates.statusCounts).toEqual({
        pending: 2,
        preparing: 1,
        prepared: 1,
        cancelled: 1,
      });
    });

    it("scene.orderAggregates.olderCount accounts for orders beyond the recent window", () => {
      const many: Order[] = Array.from({ length: 14 }, (_, i) => ({
        ...ORDERS[0],
        orderId: `ord_${i}`,
        updatedAt: new Date(2026, 0, i + 1).toISOString(),
      }));
      const { scene } = makeSvc({ orders: many }).list();
      expect(scene.orderAggregates.totalCount).toBe(14);
      expect(scene.orderAggregates.olderCount).toBe(4);
    });

    it("scene.cart is null when the cart is empty", () => {
      const { scene } = makeSvc().list();
      expect(scene.cart).toBeNull();
    });

    it("scene.cart is a SceneCart when filled, with typed asset wiring", () => {
      const filledCart: Cart = { ...EMPTY_CART, itemCount: 2, total: { amountMinor: 360, currency: "EUR" } };
      const model = { assetUrl: "/viz/models/cup.glb", assetFormat: "glb" };
      const { scene } = makeSvc({
        cart: filledCart,
        cartChangedAt: 1_700_000_000_000,
        assetConfig: { bodyH: 0.36 },
        assetModel: model,
      }).list();
      expect(scene.cart).not.toBeNull();
      expect(scene.cart?.itemCount).toBe(2);
      expect(scene.cart?.updatedAt).toBe(1_700_000_000_000);
      expect(scene.cart?.asset).toEqual({ url: "/viz/models/cup.glb", format: "glb" });
      expect(scene.cart?.assetConfig).toEqual({ bodyH: 0.36 });
    });

    it("scene.latestActivityAt is the max of cart.lastChangedAt and the newest order updatedAt", () => {
      const filledCart: Cart = { ...EMPTY_CART, itemCount: 1, total: { amountMinor: 180, currency: "EUR" } };
      const orderTime = Date.parse("2026-05-14T12:00:00.000Z");
      // Cart older than the order — order wins.
      let { scene } = makeSvc({ cart: filledCart, cartChangedAt: orderTime - 1000 }).list();
      expect(scene.latestActivityAt).toBe(orderTime);
      // Cart newer than the order — cart wins.
      ({ scene } = makeSvc({ cart: filledCart, cartChangedAt: orderTime + 1000 }).list());
      expect(scene.latestActivityAt).toBe(orderTime + 1000);
    });

    it("scene survives catalog throwing (returns empty products)", () => {
      const svc = makeSvc({ products: () => { throw new Error("catalog down"); } });
      const { scene } = svc.list();
      expect(scene.products).toEqual([]);
      expect(scene.recentOrders.length).toBeGreaterThan(0);
    });

    it("scene survives orders throwing (returns empty recent + zeroed aggregates)", () => {
      const svc = makeSvc({ orders: () => { throw new Error("orders down"); } });
      const { scene } = svc.list();
      expect(scene.recentOrders).toEqual([]);
      expect(scene.orderAggregates).toEqual({
        totalCount: 0,
        olderCount: 0,
        statusCounts: { pending: 0, preparing: 0, prepared: 0, cancelled: 0 },
      });
      expect(scene.products.length).toBeGreaterThan(0);
    });

    it("scene survives cart throwing (cart is null)", () => {
      const svc = makeSvc({ cart: () => { throw new Error("cart down"); } });
      const { scene } = svc.list();
      expect(scene.cart).toBeNull();
    });
  });
});
