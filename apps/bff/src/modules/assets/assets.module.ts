// Assets module — owns 3D geometry configs and GLB asset references.
//
// Responsibility: serve `AssetConfig` (parametric knobs) and `AssetModel`
// (GLB URLs) so the visualization layer can decorate `VisualizationItem`
// records without coupling to Prisma directly.
//
// Public surface: AssetsService.

import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
