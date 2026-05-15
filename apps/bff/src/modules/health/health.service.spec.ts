import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  const originalVersion = process.env.BFF_VERSION;

  beforeEach(() => {
    delete process.env.BFF_VERSION;
  });

  afterEach(() => {
    if (originalVersion === undefined) {
      delete process.env.BFF_VERSION;
    } else {
      process.env.BFF_VERSION = originalVersion;
    }
  });

  it("reports a deterministic ok payload", () => {
    const svc = new HealthService();
    const startedAt = 1_700_000_000_000;
    const now = startedAt + 42_000;

    const report = svc.check(now, startedAt);

    expect(report).toEqual({
      status: "ok",
      service: "bff",
      version: "0.0.0",
      uptimeSeconds: 42,
      checks: { db: "skipped" },
    });
  });

  it("clamps uptime to zero when clock skews backwards", () => {
    const svc = new HealthService();
    const report = svc.check(1_000, 5_000);
    expect(report.uptimeSeconds).toBe(0);
  });
});
