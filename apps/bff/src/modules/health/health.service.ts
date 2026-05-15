import { Injectable } from "@nestjs/common";

export interface HealthReport {
  readonly status: "ok";
  readonly service: "bff";
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly checks: {
    readonly db: "skipped" | "ok" | "down";
  };
}

@Injectable()
export class HealthService {
  // TODO: ping Prisma once persistence is wired and flip db check to real.
  check(now: number = Date.now(), startedAt: number = HealthService.startedAt): HealthReport {
    return {
      status: "ok",
      service: "bff",
      version: process.env.BFF_VERSION ?? "0.0.0",
      uptimeSeconds: Math.max(0, Math.floor((now - startedAt) / 1000)),
      checks: { db: "skipped" },
    };
  }

  static readonly startedAt = Date.now();
}
