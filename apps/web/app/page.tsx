"use client";

import useSWR from "swr";
import { expressoApi, ProductsResponse } from "@/lib/api/expresso-api";
import { ProductCatalogGrid } from "@/components/catalog/ProductCatalogGrid";
import { CatalogGridSkeleton } from "@/components/system/LoadingSkeleton";
import { PageErrorState } from "@/components/system/ErrorBanner";
import { EmptyState } from "@/components/system/EmptyState";
import { VisualizerEmbed } from "@/components/visualizer/VisualizerEmbed";
import { InlineCartSummary } from "@/components/cart/InlineCartSummary";
import { Sparkles } from "lucide-react";

async function fetchProducts(): Promise<ProductsResponse> {
  return expressoApi.getProducts();
}

export default function HomeWorkspace() {
  const { data, error, isLoading, mutate } = useSWR<ProductsResponse, Error>(
    "products",
    fetchProducts,
    { revalidateOnFocus: false },
  );

  const productCount = data?.items.length ?? 0;

  return (
    <div className="container py-4 pb-24">
      <div className="home-workspace">
        <section
          className="home-catalog"
          aria-label="Product catalog"
          data-testid="home-catalog"
        >
          <header className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h1
                className="text-lg font-semibold tracking-tight"
                style={{ color: "var(--foreground)" }}
              >
                Catalog
              </h1>
              <p
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Browse, add, and watch the scene react.
              </p>
            </div>
            {productCount > 0 && (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
                style={{
                  backgroundColor: "var(--secondary)",
                  color: "var(--muted-foreground)",
                }}
                data-testid="home-product-count"
              >
                <Sparkles
                  className="h-3 w-3"
                  style={{ color: "var(--primary)" }}
                />
                {productCount} products
              </span>
            )}
          </header>

          {isLoading ? (
            <CatalogGridSkeleton count={6} />
          ) : error ? (
            <PageErrorState
              title="Failed to load products"
              message={
                error.message ||
                "Could not connect to the BFF. Try enabling Demo Mode or make sure it is running on port 3001."
              }
              onRetry={() => mutate()}
            />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              variant="products"
              action={{ label: "Refresh", onClick: () => mutate() }}
            />
          ) : (
            <ProductCatalogGrid products={data.items} />
          )}
        </section>

        <aside
          className="home-rail space-y-3"
          aria-label="Live visualizer and cart"
          data-testid="home-rail"
        >
          <VisualizerEmbed
            embed
            aspectRatio="4 / 3"
            title="Order Counter · live"
          />
          <div className="home-rail-card">
            <InlineCartSummary variant="card" />
          </div>
        </aside>
      </div>

      <div className="home-rail-sticky">
        <InlineCartSummary variant="sticky" />
      </div>
    </div>
  );
}
