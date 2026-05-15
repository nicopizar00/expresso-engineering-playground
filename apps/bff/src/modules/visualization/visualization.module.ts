// Visualization module — feeds the visualizer-3d service with DTO data.
//
// Responsibility: expose a read-only HTTP contract that the visualizer can
// consume. The visualizer never reads the database; it always goes through
// this module.
//
// Public surface:
//   - GET /visualization-data — aggregates catalog, orders, and cart into
//     a flat VisualizationItem[] the frontend renders as 3D primitives.

import { Module } from "@nestjs/common";
import { CartModule } from "../cart/cart.module";
import { CatalogModule } from "../catalog/catalog.module";
import { OrdersModule } from "../orders/orders.module";
import { VisualizationController } from "./visualization.controller";
import { VisualizationService } from "./visualization.service";

@Module({
  imports: [CatalogModule, OrdersModule, CartModule],
  controllers: [VisualizationController],
  providers: [VisualizationService],
  exports: [VisualizationService],
})
export class VisualizationModule {}
