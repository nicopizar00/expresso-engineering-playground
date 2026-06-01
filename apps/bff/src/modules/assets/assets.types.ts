// Wire-format types for 3D asset configs and primary GLB references.
// Consumed by VisualizationService and exposed (as JSON-serialised metadata)
// on VisualizationItem records.

export type AssetParams = Readonly<Record<string, number>>;

export interface AssetModelRef {
  readonly assetUrl: string;
  readonly assetFormat: string;
}
