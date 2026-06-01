import { Controller, HttpCode, Post } from "@nestjs/common";
import { AssetsService } from "./assets.service";

@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  // Admin: reload AssetConfig + AssetModel caches without a BFF restart.
  // Useful after seeding or after a Blender GLB export lands in the DB.
  @Post("refresh")
  @HttpCode(200)
  async refresh(): Promise<{ ok: true }> {
    await this.assets.refreshAssets();
    return { ok: true };
  }
}
