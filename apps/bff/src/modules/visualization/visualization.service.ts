import { Injectable } from "@nestjs/common";
import { AssetsService } from "../assets/assets.service";
import type { AssetModelRef, AssetParams } from "../assets/assets.types";
import { CartService } from "../cart/cart.service";
import { CatalogService } from "../catalog/catalog.service";
import type { Product } from "../catalog/catalog.types";
import { OrdersService } from "../orders/orders.service";
import type { Order } from "../orders/orders.types";
import type {
  PositionHint,
  VisualizationDataResponse,
  VisualizationItem,
  VisualizationItemStatus,
} from "./visualization.types";

// `metadata` is Readonly<Record<string, string | number>>, so AssetConfig
// rides as a JSON string and the GLB ref is split into two string fields.
function assetMetadata(
  category: string,
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

// Layout: three non-overlapping sectors within the 6×6 room.
//   Products (cubes)  — back-left quadrant,  x ∈ [-2.2, 0.6],  z ∈ [-2.2, 0.6]
//   Orders  (spheres) — right strip,          x ∈ [ 1.4, 2.3],  z ∈ [-2.0, …]
//   Cart    (marker)  — front-centre,          x = 0,             z = 2.0
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

const CART_POSITION: PositionHint = { x: 0, y: 0.35, z: 1.0 };

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
// outrank a cart/order event for the spotlight.
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
      ...assetMetadata(product.category, config, model),
    },
  };
}

function fromOrder(order: Order, index: number): VisualizationItem {
  const updatedAtEpoch = Date.parse(order.updatedAt);
  return {
    id: `viz_order_${order.orderId}`,
    label: `${order.orderId} · ${order.customerName}`,
    type: "sphere",
    value: order.total.amountMinor,
    status: orderStatus(order.status),
    positionHint: orderPosition(index),
    metadata: {
      orderStatus: order.status,
      customerName: order.customerName,
      lineCount: order.lines.length,
      total: order.total.amountMinor,
      currency: order.total.currency,
      placedAt: order.placedAt,
      source: "orders",
      updatedAt: Number.isFinite(updatedAtEpoch) ? updatedAtEpoch : 0,
    },
  };
}

@Injectable()
export class VisualizationService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
    private readonly cart: CartService,
    private readonly assets: AssetsService,
  ) {}

  list(): VisualizationDataResponse {
    return {
      items: [...this.catalogItems(), ...this.orderItems(), ...this.cartItems()],
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

  private cartItems(): VisualizationItem[] {
    try {
      const cart = this.cart.get();
      // Non-empty cart: signal "drink" so Three.js renders a ceramic cup
      // at the cart position instead of a generic cone.
      const filled = cart.itemCount > 0;
      const drinkConfig = filled ? this.assets.getConfig("drink") : null;
      const drinkModel = filled ? this.assets.getPrimaryModel("drink") : null;
      return [
        {
          id: "viz_cart_demo",
          label: `Cart · ${cart.itemCount} item${cart.itemCount === 1 ? "" : "s"}`,
          type: "marker",
          value: cart.total.amountMinor,
          status: cart.itemCount === 0 ? "idle" : "ok",
          positionHint: CART_POSITION,
          metadata: {
            // Empty cart: no category — renders as an idle marker placeholder.
            ...(filled && { category: "drink" }),
            itemCount: cart.itemCount,
            total: cart.total.amountMinor,
            currency: cart.total.currency,
            source: "cart",
            updatedAt: this.cart.lastChangedAt(),
            ...assetMetadata("drink", drinkConfig, drinkModel),
          },
        },
      ];
    } catch {
      return [];
    }
  }
}
