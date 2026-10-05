import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import { HotStatusService } from "./hot-status.service";

const COOL = 300_000;
const NOW = new Date("2026-10-05T12:00:00.000Z");
const ana = { username: "ana", email: "ana@example.test" };

function make(result: { count: number; min: Date | null }) {
  const aggregate = vi.fn().mockResolvedValue({
    _count: { _all: result.count },
    _min: { placedAt: result.min },
  });
  const prisma = { order: { aggregate } } as unknown as PrismaService;
  return { svc: new HotStatusService(prisma, COOL), aggregate };
}

describe("HotStatusService", () => {
  it("aggregates by owner username OR email, strictly inside the cool-down window", async () => {
    const { svc, aggregate } = make({ count: 0, min: null });
    await svc.forUser(ana, NOW);
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        OR: [{ ownerUsername: "ana" }, { ownerEmail: "ana@example.test" }],
        placedAt: { gt: new Date(NOW.getTime() - COOL) },
      },
      _count: { _all: true },
      _min: { placedAt: true },
    });
  });

  it("returns zero and null nextCoolsAt with no hot orders", async () => {
    const { svc } = make({ count: 0, min: null });
    await expect(svc.forUser(ana, NOW)).resolves.toEqual({
      hotCount: 0,
      nextCoolsAt: null,
      serverTime: NOW.toISOString(),
    });
  });

  it("derives nextCoolsAt from the earliest hot placedAt", async () => {
    const earliest = new Date(NOW.getTime() - 120_000);
    const { svc } = make({ count: 2, min: earliest });
    await expect(svc.forUser(ana, NOW)).resolves.toEqual({
      hotCount: 2,
      nextCoolsAt: new Date(earliest.getTime() + COOL).toISOString(),
      serverTime: NOW.toISOString(),
    });
  });

  it("defaults now to the current time", async () => {
    const { svc } = make({ count: 0, min: null });
    const before = Date.now();
    const out = await svc.forUser(ana);
    expect(Date.parse(out.serverTime)).toBeGreaterThanOrEqual(before);
  });
});
