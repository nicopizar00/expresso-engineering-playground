import { Injectable } from "@nestjs/common";
import type {
  VisualizationDataResponse,
  VisualizationItem,
} from "./visualization.types";

// Deterministic mock dataset. The visualizer is intentionally a Hello World:
// a small fixed set of items is enough to validate the contract end-to-end
// and exercise the room layout. A future iteration will derive this from
// real domain data (catalog / orders) via a dedicated read model.
const ITEMS: ReadonlyArray<VisualizationItem> = [
  {
    id: "viz_demo_1",
    label: "Catalog throughput",
    type: "cube",
    value: 42,
    status: "ok",
    positionHint: { x: -1.4, y: 0.4, z: -1.0 },
    metadata: { unit: "rps", source: "mock" },
  },
  {
    id: "viz_demo_2",
    label: "Open orders",
    type: "sphere",
    value: 7,
    status: "warn",
    positionHint: { x: 1.2, y: 0.5, z: -1.2 },
    metadata: { unit: "orders", source: "mock" },
  },
  {
    id: "viz_demo_3",
    label: "Checkout p95 latency",
    type: "marker",
    value: 312,
    status: "error",
    positionHint: { x: 0.0, y: 0.3, z: 1.0 },
    metadata: { unit: "ms", source: "mock" },
  },
  {
    id: "viz_demo_4",
    label: "Idle cart sessions",
    type: "cube",
    value: 15,
    status: "idle",
    positionHint: { x: 1.6, y: 0.4, z: 1.4 },
    metadata: { unit: "sessions", source: "mock" },
  },
];

@Injectable()
export class VisualizationService {
  // TODO: derive items from real domain aggregates (catalog, orders) once a
  // read model exists. The visualizer must keep consuming the DTO above —
  // it never reads the database directly.
  list(): VisualizationDataResponse {
    return { items: ITEMS };
  }
}
