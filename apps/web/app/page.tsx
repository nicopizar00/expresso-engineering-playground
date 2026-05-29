'use client';

/**
 * Catalog Page - Product listing homepage
 *
 * Fetches and displays all products with category filtering.
 * Redesigned with a clean, modern interface.
 */

import useSWR from 'swr';
import { expressoApi, ProductsResponse } from '@/lib/api/expresso-api';
import { ProductCatalogGrid } from '@/components/catalog/ProductCatalogGrid';
import { CatalogGridSkeleton } from '@/components/system/LoadingSkeleton';
import { PageErrorState } from '@/components/system/ErrorBanner';
import { EmptyState } from '@/components/system/EmptyState';
import { Coffee, Sparkles } from 'lucide-react';

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
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center w-10 h-10 rounded-lg"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Coffee className="h-5 w-5" />
              </div>
              <div>
                <h1
                  className="text-2xl font-semibold tracking-tight"
                  style={{ color: 'var(--foreground)' }}
                >
                  Product Catalog
                </h1>
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Browse our selection of drinks, food, and accessories
                </p>
              </div>
            </div>
          </div>
          
          {data && data.items.length > 0 && (
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--secondary)' }}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                {data.items.length} products available
              </span>
            </div>
          )}
        </div>
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
