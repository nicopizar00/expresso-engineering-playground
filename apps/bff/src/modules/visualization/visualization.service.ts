import { Injectable } from "@nestjs/common";
import type { OrderStatus } from "@mini-commerce/shared-types";
import { AssetsService } from "../assets/assets.service";
import type { AssetModelRef, AssetParams } from "../assets/assets.types";
import { CatalogService } from "../catalog/catalog.service";
import type { Product } from "../catalog/catalog.types";
import { OrdersService } from "../orders/orders.service";
import type { Order } from "../orders/orders.types";
import type {
  OrderAggregates,
  PositionHint,
  SceneCart,
  SceneOrder,
  SceneProduct,
  VisualizationDataResponse,
  VisualizationItem,
  VisualizationItemStatus,
  VisualizationScene,
} from "./visualization.types";

// EOC-2: cap on the number of orders the BFF surfaces individually. Anything
// beyond this window collapses into `orderAggregates.olderCount` so the
// visualizer's permanent geometry stays bounded as history grows.
const RECENT_ORDER_WINDOW = 10;

function emptyStatusCounts(): Record<OrderStatus, number> {
  return { pending: 0, preparing: 0, prepared: 0, cancelled: 0 };
}

// `metadata` is Readonly<Record<string, string | number>>, so AssetConfig
// rides as a JSON string and the GLB ref is split into two string fields.
// Legacy `items[]` path only — the new `scene` payload carries typed objects.
function assetMetadata(
  config: AssetParams | null,
  model: AssetModelRef | null,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (config) out.assetConfig = JSON.stringify(config);
  if (model) {
    out.assetUrl = model.assetUrl;
    out.assetFormat = model.assetFormat;
  }
  return out;
}

// Layout: two non-overlapping sectors within the 6×6 room.
//   Products (cubes)  — back-left quadrant,  x ∈ [-2.2, 0.6],  z ∈ [-2.2, 0.6]
//   Orders  (spheres) — right strip,          x ∈ [ 1.4, 2.3],  z ∈ [-2.0, …]
// All values stay within the clamp range the frontend applies (±2.5).

function productPosition(index: number): PositionHint {
  return {
    x: -2.2 + (index % 3) * 1.4,
    y: 0.35,
    z: -2.2 + Math.floor(index / 3) * 1.4,
  };
}

function orderPosition(index: number): PositionHint {
  return {
    x: 1.4 + (index % 2) * 0.9,
    y: 0.5,
    z: -2.0 + Math.floor(index / 2) * 1.5,
  };
}

function productStatus(inventory: number): VisualizationItemStatus {
  if (inventory === 0) return "error";
  if (inventory < 20) return "warn";
  return "ok";
}

function orderStatus(status: Order["status"]): VisualizationItemStatus {
  switch (status) {
    case "pending":
      return "warn";
    case "preparing":
    case "prepared":
      return "ok";
    case "cancelled":
      return "error";
    default:
      return "idle";
  }
}

// `updatedAt` is epoch ms. The visualizer compares these across items to pick
// the "latest user action" hero. Products use 0 so the catalogue can never
// outrank an order event for the spotlight.
function fromProduct(
  product: Product,
  index: number,
  config: AssetParams | null,
  model: AssetModelRef | null,
): VisualizationItem {
  return {
    id: `viz_product_${product.productId}`,
    label: product.name,
    type: "cube",
    value: product.price.amountMinor,
    status: productStatus(product.inventory),
    positionHint: productPosition(index),
    metadata: {
      category: product.category,
      price: product.price.amountMinor,
      currency: product.price.currency,
      inventory: product.inventory,
      source: "catalog",
      updatedAt: 0,
      ...assetMetadata(config, model),
    },
  };
}

function fromOrder(order: Order, index: number): VisualizationItem {
  const updatedAtEpoch = Date.parse(order.updatedAt);
  const customerDisplay = order.customerName ?? "(no name)";
  return {
    id: `viz_order_${order.orderId}`,
    label: `${order.orderId} · ${customerDisplay}`,
    type: "sphere",
    value: order.total.amountMinor,
    status: orderStatus(order.status),
    positionHint: orderPosition(index),
    metadata: {
      orderStatus: order.status,
      customerName: customerDisplay,
      lineCount: order.lines.length,
      total: order.total.amountMinor,
      currency: order.total.currency,
      placedAt: order.placedAt,
      source: "orders",
      updatedAt: Number.isFinite(updatedAtEpoch) ? updatedAtEpoch : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Scene builders — EOC-2 typed shape. The visualizer chooses meshes, colors,
// and positions; the BFF only describes meaning.
// ---------------------------------------------------------------------------

function toSceneProduct(
  product: Product,
  config: AssetParams | null,
  model: AssetModelRef | null,
): SceneProduct {
  return {
    productId: product.productId,
    name: product.name,
    category: product.category,
    inventory: product.inventory,
    price: product.price,
    status: productStatus(product.inventory),
    ...(model
      ? { asset: { url: model.assetUrl, format: model.assetFormat } }
      : {}),
    ...(config ? { assetConfig: config } : {}),
  };
}

function toSceneOrder(order: Order): SceneOrder {
  return {
    orderId: order.orderId,
    customerName: order.customerName,
    status: order.status,
    vizStatus: orderStatus(order.status),
    total: order.total,
    lineCount: order.lines.length,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
  };
}

function aggregateOrders(orders: ReadonlyArray<Order>): OrderAggregates {
  const counts = emptyStatusCounts();
  for (const o of orders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  }
  const recentCount = Math.min(orders.length, RECENT_ORDER_WINDOW);
  return {
    totalCount: orders.length,
    olderCount: orders.length - recentCount,
    statusCounts: counts,
  };
}

function maxOrderUpdatedAt(orders: ReadonlyArray<Order>): number {
  let max = 0;
  for (const o of orders) {
    const t = Date.parse(o.updatedAt);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

@Injectable()
export class VisualizationService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
    private readonly assets: AssetsService,
  ) {}

  list(): VisualizationDataResponse {
    return {
      items: [...this.catalogItems(), ...this.orderItems()],
      scene: this.buildScene(),
    };
  }

  private catalogItems(): VisualizationItem[] {
    try {
      return this.catalog.list().items.map((product, index) =>
        fromProduct(
          product,
          index,
          this.assets.getConfig(product.category),
          this.assets.getPrimaryModel(product.category),
        ),
      );
    } catch {
      return [];
    }
  }

  private orderItems(): VisualizationItem[] {
    try {
      return this.orders.listAll().map(fromOrder);
    } catch {
      return [];
    }
  }

  // EOC-2 — typed semantic scene. Partial-failure rules match the legacy
  // catalogItems/orderItems blocks: each source is independent; a thrown
  // read from one source leaves the other intact.
  //
  // `scene.cart` is always null. The cart became session-scoped (cart/
  // session evolution) and this poll/SSE-driven service has no request
  // context to resolve a session from. CUP-004/CUP-005 (canonical scene
  // projection, foreground hero) define what eventually replaces it; there
  // is no cart-derived scene item until then.
  private buildScene(): VisualizationScene {
    let products: SceneProduct[] = [];
    try {
      products = this.catalog.list().items.map((p) =>
        toSceneProduct(
          p,
          this.assets.getConfig(p.category),
          this.assets.getPrimaryModel(p.category),
        ),
      );
    } catch {
      products = [];
    }

    let allOrders: ReadonlyArray<Order> = [];
    try {
      allOrders = this.orders.listAll();
    } catch {
      allOrders = [];
    }
    const sortedOrders = [...allOrders].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    const recentOrders = sortedOrders
      .slice(0, RECENT_ORDER_WINDOW)
      .map(toSceneOrder);
    const orderAggregates = aggregateOrders(sortedOrders);
    const ordersLatest = maxOrderUpdatedAt(sortedOrders);

    const cart: SceneCart | null = null;

    return {
      products,
      recentOrders,
      orderAggregates,
      cart,
      latestActivityAt: ordersLatest,
    };
  }
}
