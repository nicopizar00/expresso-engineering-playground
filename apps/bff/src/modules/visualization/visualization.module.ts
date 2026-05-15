// Visualization module — feeds the visualizer-3d service with DTO data.
//
// Responsibility: expose a read-only HTTP contract that the visualizer can
// consume. The visualizer never reads the database; it always goes through
// this module.
//
// Public surface (current iteration — mocked):
//   - GET /visualization-data — return a small deterministic set of items
//
// TODO (next iterations):
//   - Derive items from catalog / orders read models
//   - Pagination / filtering by type or status

import { Module } from "@nestjs/common";
import { VisualizationController } from "./visualization.controller";
import { VisualizationService } from "./visualization.service";

@Module({
  controllers: [VisualizationController],
  providers: [VisualizationService],
  exports: [VisualizationService],
})
export class VisualizationModule {}
