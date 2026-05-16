'use client';

import { useState } from 'react';
import { Product, ProductCategory } from '@/lib/api/expresso-api';
import { ProductCard } from './ProductCard';
import { ProductQuickView } from './ProductQuickView';
import { EmptyState } from '@/components/system/EmptyState';
import { Coffee, UtensilsCrossed, Package, LayoutGrid } from 'lucide-react';

interface ProductCatalogGridProps {
  products: Product[];
}

type FilterCategory = ProductCategory | 'all';

const categoryFilters: { value: FilterCategory; label: string; icon: typeof Coffee }[] = [
  { value: 'all', label: 'All', icon: LayoutGrid },
  { value: 'drink', label: 'Drinks', icon: Coffee },
  { value: 'food', label: 'Food', icon: UtensilsCrossed },
  { value: 'accessory', label: 'Accessories', icon: Package },
];

export function ProductCatalogGrid({ products }: ProductCatalogGridProps) {
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  const filteredProducts = filter === 'all' 
    ? products 
    : products.filter(p => p.category === filter);

  const categoryCounts = {
    all: products.length,
    drink: products.filter(p => p.category === 'drink').length,
    food: products.filter(p => p.category === 'food').length,
    accessory: products.filter(p => p.category === 'accessory').length,
  };

  return (
    <div>
      {/* Filter tabs */}
      <div 
        className="flex items-center gap-2 mb-6 overflow-x-auto pb-2"
        role="tablist"
        aria-label="Filter products by category"
      >
        {categoryFilters.map(({ value, label, icon: Icon }) => {
          const isActive = filter === value;
          const count = categoryCounts[value];
          
          return (
            <button
              key={value}
              onClick={() => setFilter(value)}
              role="tab"
              aria-selected={isActive}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: isActive ? 'var(--primary)' : 'var(--secondary)',
                color: isActive ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              }}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              <span 
                className="px-1.5 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: isActive ? 'rgba(0,0,0,0.2)' : 'var(--muted)',
                  color: isActive ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Product grid */}
      {filteredProducts.length === 0 ? (
        <EmptyState 
          variant="products"
          title={filter === 'all' ? 'No products available' : `No ${filter}s available`}
          description={filter === 'all' 
            ? 'The catalog is empty. Products will appear here once they are added.'
            : `There are no ${filter}s in the catalog right now.`
          }
          action={filter !== 'all' ? {
            label: 'View all products',
            onClick: () => setFilter('all'),
          } : undefined}
        />
      ) : (
        <div 
          className="grid gap-4 sm:gap-6"
          style={{ 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}
          role="tabpanel"
        >
          {filteredProducts.map((product) => (
            <ProductCard 
              key={product.productId} 
              product={product} 
              onQuickView={setQuickViewProduct}
            />
          ))}
        </div>
      )}

      {/* Quick view modal */}
      {quickViewProduct && (
        <ProductQuickView 
          product={quickViewProduct} 
          onClose={() => setQuickViewProduct(null)} 
        />
      )}
    </div>
  );
}
