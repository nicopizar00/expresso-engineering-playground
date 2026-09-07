import { Module } from "@nestjs/common";
import { WorkflowTrafficController } from "./workflow-traffic.controller";
import { WorkflowTrafficService } from "./workflow-traffic.service";

// Independent of VisualizationModule by design: workflow traffic is a
// separate real boundary from the domain-state snapshot feed.
@Module({
  controllers: [WorkflowTrafficController],
  providers: [WorkflowTrafficService],
  exports: [WorkflowTrafficService],
})
export class WorkflowTrafficModule {}
