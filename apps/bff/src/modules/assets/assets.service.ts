import { Injectable, OnModuleInit } from "@nestjs/common";
// TODO(vercel-build): @prisma/client types require `prisma generate` — ensured by package.json#build
import type { AssetConfig as DbAssetConfig, AssetModel as DbAssetModel } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import type { AssetModelRef, AssetParams } from "./assets.types";

@Injectable()
export class AssetsService implements OnModuleInit {
  private configByCategory = new Map<string, AssetParams>();
  private primaryModelByCategory = new Map<string, AssetModelRef>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshAssets();
  }

  async refreshAssets(): Promise<void> {
    const [configs, models] = await Promise.all([
      this.prisma.assetConfig.findMany(),
      this.prisma.assetModel.findMany({
        where: { isPrimary: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    this.configByCategory = new Map(
      configs.map((row: DbAssetConfig) => [
        row.category,
        row.params as AssetParams,
      ]),
    );
    // First primary per category wins (orderBy desc keeps the freshest).
    const seen = new Set<string>();
    const freshModels = new Map<string, AssetModelRef>();
    for (const row of models as DbAssetModel[]) {
      if (seen.has(row.category)) continue;
      seen.add(row.category);
      freshModels.set(row.category, {
        assetUrl: row.assetUrl,
        assetFormat: row.assetFormat,
      });
    }
    this.primaryModelByCategory = freshModels;
  }

  // Sync reads — both caches are warmed at startup so VisualizationService
  // can stay synchronous and the SSE snapshot path doesn't need to await.
  getConfig(category: string): AssetParams | null {
    return this.configByCategory.get(category) ?? null;
  }

  getPrimaryModel(category: string): AssetModelRef | null {
    return this.primaryModelByCategory.get(category) ?? null;
  }
}
