// Not @Global — consumers must explicitly import this module, matching
// the DomainEventsModule pattern in the sibling core/ directory.

import { Module } from "@nestjs/common";
import { SessionService } from "./session.service";

@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
