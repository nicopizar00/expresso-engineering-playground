// Wire-format types for the visualization data API.
// Kept here until they migrate to packages/contracts.

export type VisualizationItemType = "cube" | "sphere" | "marker";

export type VisualizationItemStatus = "ok" | "warn" | "error" | "idle";

// A hint, not a guarantee. The visualizer is free to clamp / re-map these
// to its own scene scale and layout. Axes use the Three.js convention:
// x right, y up, z toward viewer. Units are scene-relative (~1 = 1 metre
// in the default room).
export interface PositionHint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

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
  readonly items: ReadonlyArray<VisualizationItem>;
}
