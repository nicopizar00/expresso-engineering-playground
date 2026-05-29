import { Global, Module } from "@nestjs/common";
import { VisualizationEventsService } from "./visualization-events.service";

@Global()
@Module({
  providers: [VisualizationEventsService],
  exports: [VisualizationEventsService],
})
export class VisualizationEventsModule {}
