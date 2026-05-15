import { Controller, Get } from "@nestjs/common";
import { HealthReport, HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  get(): HealthReport {
    return this.health.check();
  }
}
