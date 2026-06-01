import { describe, expect, it, vi } from "vitest";
import { AssetsService } from "./assets.service";

function makeService(opts: {
  configs?: Array<{ category: string; params: Record<string, number> }>;
  models?: Array<{
    category: string;
    variant?: string;
    assetUrl: string;
    assetFormat?: string;
    isPrimary?: boolean;
    updatedAt?: Date;
  }>;
} = {}) {
  const configs = opts.configs ?? [];
  const models = (opts.models ?? []).map((m) => ({
    variant: "default",
    assetFormat: "glb",
    isPrimary: true,
    updatedAt: new Date(),
    ...m,
  }));
  const prisma = {
    assetConfig: { findMany: vi.fn().mockResolvedValue(configs) },
    assetModel: { findMany: vi.fn().mockResolvedValue(models) },
  };
  return { svc: new AssetsService(prisma as any), prisma };
}

describe("AssetsService", () => {
  it("warms config cache on init and serves sync reads", async () => {
    const { svc } = makeService({
      configs: [{ category: "drink", params: { bodyH: 0.36 } }],
    });
    await svc.onModuleInit();
    expect(svc.getConfig("drink")).toEqual({ bodyH: 0.36 });
    expect(svc.getConfig("food")).toBeNull();
  });

  it("warms primary-model cache on init and serves sync reads", async () => {
    const { svc } = makeService({
      models: [{ category: "drink", assetUrl: "/viz/models/cup.glb" }],
    });
    await svc.onModuleInit();
    expect(svc.getPrimaryModel("drink")).toEqual({
      assetUrl: "/viz/models/cup.glb",
      assetFormat: "glb",
    });
    expect(svc.getPrimaryModel("food")).toBeNull();
  });

  it("returns null when no rows exist for the requested category", async () => {
    const { svc } = makeService();
    await svc.onModuleInit();
    expect(svc.getConfig("drink")).toBeNull();
    expect(svc.getPrimaryModel("drink")).toBeNull();
  });

  it("uses the first primary model per category when multiple exist", async () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-05-30T00:00:00Z");
    // Prisma findMany is called with orderBy updatedAt desc, so the newer
    // row arrives first. The service must keep it and ignore later variants.
    const { svc } = makeService({
      models: [
        { category: "drink", variant: "default", assetUrl: "/viz/models/new.glb", updatedAt: newer },
        { category: "drink", variant: "lod1", assetUrl: "/viz/models/old.glb", updatedAt: older },
      ],
    });
    await svc.onModuleInit();
    expect(svc.getPrimaryModel("drink")?.assetUrl).toBe("/viz/models/new.glb");
  });

  it("only loads primary models", async () => {
    const { prisma, svc } = makeService();
    await svc.onModuleInit();
    expect(prisma.assetModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPrimary: true } }),
    );
  });
});
