// Not @Global — consumers must explicitly import this module so the
// dependency is visible in each module's imports array.

import { Module } from "@nestjs/common";
import { DomainEventsService } from "./domain-events.service";

@Module({
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
