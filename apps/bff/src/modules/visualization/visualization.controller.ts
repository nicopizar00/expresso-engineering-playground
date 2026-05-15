import { Controller, Get } from "@nestjs/common";
import { VisualizationService } from "./visualization.service";
import type { VisualizationDataResponse } from "./visualization.types";

@Controller("visualization-data")
export class VisualizationController {
  constructor(private readonly visualization: VisualizationService) {}

  @Get()
  list(): VisualizationDataResponse {
    return this.visualization.list();
  }
}
