'use client';

/**
 * Catalog Page - Product listing homepage
 *
 * Fetches and displays all products with category filtering.
 * This is the main entry point for browsing products.
 *
 * ## API Endpoint
 * GET /catalog/products → ProductsResponse
 * Verified against: apps/bff/src/modules/catalog/catalog.controller.ts
 */

import useSWR from 'swr';
import { expressoApi, ProductsResponse } from '@/lib/api/expresso-api';
import { ProductCatalogGrid } from '@/components/catalog/ProductCatalogGrid';
import { CatalogGridSkeleton } from '@/components/system/LoadingSkeleton';
import { PageErrorState } from '@/components/system/ErrorBanner';
import { EmptyState } from '@/components/system/EmptyState';

async function fetchProducts(): Promise<ProductsResponse> {
  return expressoApi.getProducts();
}

export default function CatalogPage() {
  const { data, error, isLoading, mutate } = useSWR<ProductsResponse, Error>(
    'products',
    fetchProducts,
    {
      revalidateOnFocus: false,
    }
  );

  return (
    <div className="container py-8">
      {/* Hero section */}
      <section className="mb-8">
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ color: 'var(--foreground)' }}
        >
          Product Catalog
        </h1>
        <p className="mt-2 text-lg" style={{ color: 'var(--muted-foreground)' }}>
          Browse our selection of espresso drinks, food items, and accessories.
        </p>
      </section>

      {/* Content */}
      {isLoading ? (
        <CatalogGridSkeleton count={6} />
      ) : error ? (
        <PageErrorState
          title="Failed to load products"
          message={
            error.message ||
            'Could not connect to the BFF. Try enabling Demo Mode or make sure it is running on port 3001.'
          }
          onRetry={() => mutate()}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          variant="products"
          action={{
            label: 'Refresh',
            onClick: () => mutate(),
          }}
        />
      ) : (
        <ProductCatalogGrid products={data.items} />
      )}
    </div>
  );
}
