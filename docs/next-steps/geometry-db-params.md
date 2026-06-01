# 3D Geometry DB Params — Design Plan

## Goal

Store the `ESPRESSO_CFG` geometry constants in the database so that:

1. Asset parameters can be edited without redeploying `scene.js`.
2. The BFF can serve per-product 3D configs (e.g., a "large latte" cup with different proportions than the default espresso cup).
3. The compressed parameter record is the canonical source of truth for any asset, with the `.blend` file as a derivation artefact.

---

## Scope

**In scope**
- Prisma schema: new `AssetConfig` model
- `CatalogService` / `VisualizationService`: attach config to product visualization items
- `scene.js`: consume per-item config from `metadata.assetConfig` instead of the global `ESPRESSO_CFG`

**Out of scope**
- Admin UI for editing configs (use Prisma Studio for now)
- Config versioning / history
- Non-drink asset types (follow the same pattern when needed)

---

## Data model

```prisma
// apps/bff/prisma/schema.prisma

model AssetConfig {
  id          Int      @id @default(autoincrement())
  /// Matches metadata.category in VisualizationItem — e.g. "drink"
  category    String   @unique
  /// JSON blob: all ESPRESSO_CFG-compatible fields.
  /// Required keys (drinks): bodyTopW, bodyBotW, bodyH,
  ///   saucerTopW, saucerBotW, saucerH, gap,
  ///   handleW, handleH, handleGap, coffeeShrink, texSize
  params      Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**Initial seed row (iteration-4 approved values):**

```typescript
// apps/bff/prisma/seed.ts — add after product upserts
await prisma.assetConfig.upsert({
  where: { category: "drink" },
  update: {},
  create: {
    category: "drink",
    params: {
      bodyTopW: 0.20, bodyBotW: 0.30, bodyH: 0.36,
      saucerTopW: 0.60, saucerBotW: 0.44, saucerH: 0.06,
      gap: 0.04,
      handleW: 0.12, handleH: 0.20, handleGap: 0.03,
      coffeeShrink: 0.01, texSize: 16,
    },
  },
});
```

---

## BFF changes

### New service method (`CatalogService` or a new `AssetConfigService`)

```typescript
// Read once on startup / cache invalidated on demand
async getConfigByCategory(category: string): Promise<Record<string, number> | null> {
  const row = await this.prisma.assetConfig.findUnique({ where: { category } });
  return row ? (row.params as Record<string, number>) : null;
}
```

### `VisualizationService.fromProduct` — attach config

```typescript
function fromProduct(product: Product, index: number, cfg: Record<string, number> | null): VisualizationItem {
  return {
    ...existingFields,
    metadata: {
      category: product.category,
      ...existingMetadata,
      // Only attach when a config row exists for this category
      ...(cfg ? { assetConfig: JSON.stringify(cfg) } : {}),
    },
  };
}
```

The `metadata` field type is `Readonly<Record<string, string | number>>`, so `assetConfig` must be serialised as a JSON string before embedding.

---

## `scene.js` changes

### Parse and apply per-item config

```javascript
function buildItemMesh(item, isHero) {
  // …existing color/position logic…

  if (item.metadata?.category === "drink") {
    // Merge DB config over the local default — allows per-product overrides
    // while keeping ESPRESSO_CFG as the safe fallback.
    let cfg = ESPRESSO_CFG;
    const rawCfg = item.metadata?.assetConfig;
    if (typeof rawCfg === "string") {
      try { cfg = { ...ESPRESSO_CFG, ...JSON.parse(rawCfg) }; } catch { /* fallback */ }
    }
    const group = buildEspressoGroup(color, cfg);   // pass cfg as second arg
    // …rest of positioning…
  }
}
```

### `buildEspressoGroup` signature change

```javascript
// Accept an explicit cfg so tests and the fallback path
// can pass ESPRESSO_CFG directly without touching the global.
function buildEspressoGroup(color, cfg = ESPRESSO_CFG) {
  const { bodyTopW, bodyBotW, bodyH, ... } = cfg;
  // no other changes
}
```

---

## Compression note

The `params` JSON blob is ~200 bytes uncompressed — no compression needed for this scale. If configs multiply (50+ asset types), consider:

- Storing only the **delta from a named preset** (e.g. `{ preset: "espresso_v4", bodyH: 0.40 }`)
- The BFF merges delta into the preset at query time before serialising into `metadata`

---

## Migration steps

1. Add `AssetConfig` model to `schema.prisma`
2. Run `pnpm --filter @mini-commerce/bff exec prisma migrate dev --name add_asset_config`
3. Add seed row (see above)
4. Add `getConfigByCategory` to the service (new `AssetConfigService` or extend `CatalogService`)
5. Wire into `VisualizationService.fromProduct` and `cartItems`
6. Update `buildItemMesh` and `buildEspressoGroup` signature in `scene.js`
7. Update `FALLBACK_ITEMS` to use the local `ESPRESSO_CFG` (no change — it already does)
8. Run `./dev up` → `./dev smoke` → verify `/visualization-data` includes `assetConfig`

---

## Reference files

| File | Role |
|---|---|
| `apps/bff/prisma/schema.prisma` | Add `AssetConfig` model |
| `apps/bff/prisma/seed.ts` | Add initial drink config seed |
| `apps/bff/src/modules/visualization/visualization.service.ts` | Attach config to items |
| `apps/bff/src/modules/visualization/visualization.types.ts` | No change — metadata is already `Record<string, string \| number>` |
| `apps/visualizer-3d/public/scene.js` | Parse `assetConfig`, pass to builder |
| `/tmp/espresso_cup_renders/espresso_cup_v1.blend` | Source-of-truth geometry for iteration 4 |
