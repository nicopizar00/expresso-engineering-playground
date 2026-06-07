// Wire-format types for the visualization data API.
// Kept here until they migrate to packages/contracts.

import type { Money, OrderStatus } from "@mini-commerce/shared-types";

// ---------------------------------------------------------------------------
// Semantic contract (EOC-2) — BFF owns meaning, visualizer owns representation.
// ---------------------------------------------------------------------------

export type VisualizationItemStatus = "ok" | "warn" | "error" | "idle";

export interface SceneAssetRef {
  readonly url: string;
  readonly format: string;
}

export type SceneAssetParams = Readonly<Record<string, number>>;

export interface SceneProduct {
  readonly productId: string;
  readonly name: string;
  readonly category: string;
  readonly inventory: number;
  readonly price: Money;
  readonly status: VisualizationItemStatus;
  readonly asset?: SceneAssetRef;
  readonly assetConfig?: SceneAssetParams;
}

export interface SceneOrder {
  readonly orderId: string;
  readonly customerName: string;
  readonly status: OrderStatus;
  readonly vizStatus: VisualizationItemStatus;
  readonly total: Money;
  readonly lineCount: number;
  readonly placedAt: string;
  readonly updatedAt: string;
}

export interface OrderAggregates {
  readonly totalCount: number;
  readonly olderCount: number;
  readonly statusCounts: Readonly<Record<OrderStatus, number>>;
}

export interface SceneCart {
  readonly itemCount: number;
  readonly total: Money;
  readonly updatedAt: number;
  readonly asset?: SceneAssetRef;
  readonly assetConfig?: SceneAssetParams;
}

export interface VisualizationScene {
  readonly products: ReadonlyArray<SceneProduct>;
  readonly recentOrders: ReadonlyArray<SceneOrder>;
  readonly orderAggregates: OrderAggregates;
  readonly cart: SceneCart | null;
  readonly latestActivityAt: number;
}

// ---------------------------------------------------------------------------
// Legacy item shape — kept as a back-compat surface during transition.
// Consumers should migrate to `scene` above; this block is scheduled for
// removal once smoke / k6 / scene.js no longer read it.
// ---------------------------------------------------------------------------

/** @deprecated — representation belongs in the visualizer. Read `scene` instead. */
export type VisualizationItemType = "cube" | "sphere" | "marker";

// A hint, not a guarantee. The visualizer is free to clamp / re-map these
// to its own scene scale and layout. Axes use the Three.js convention:
// x right, y up, z toward viewer. Units are scene-relative (~1 = 1 metre
// in the default room).
export interface PositionHint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** @deprecated — read the typed entries on `scene` instead. */
export interface VisualizationItem {
  readonly id: string;
  readonly label: string;
  readonly type: VisualizationItemType;
  readonly value: number;
  readonly status: VisualizationItemStatus;
  readonly positionHint: PositionHint;
  readonly metadata: Readonly<Record<string, string | number>>;
}

export interface VisualizationDataResponse {
  /** @deprecated — read `scene` instead. Removed once consumers have migrated. */
  readonly items: ReadonlyArray<VisualizationItem>;
  readonly scene: VisualizationScene;
}
