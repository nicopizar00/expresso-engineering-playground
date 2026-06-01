-- CreateTable
CREATE TABLE "AssetConfig" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetModel" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'default',
    "assetUrl" TEXT NOT NULL,
    "assetFormat" TEXT NOT NULL DEFAULT 'glb',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetConfig_category_key" ON "AssetConfig"("category");

-- CreateIndex
CREATE INDEX "AssetModel_category_isPrimary_idx" ON "AssetModel"("category", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "AssetModel_category_variant_key" ON "AssetModel"("category", "variant");
