'use client';

/**
 * ProductCard - Individual product display card
 *
 * Displays product info with add-to-cart functionality.
 * Uses category-based theming for visual distinction.
 *
 * TODO(v0-export): Consider adding product images when asset CDN is available
 * TODO(types): Import ProductCategory from @mini-commerce/contracts
 */

import { useState } from 'react';
import { Coffee, UtensilsCrossed, Package, Plus, Check, Loader2 } from 'lucide-react';
import { Product, ProductCategory, formatMoney } from '@/lib/api/expresso-api';
import { useCart } from '@/components/cart/CartProvider';

interface ProductCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
}

/**
 * Visual configuration for product categories.
 * Colors align with CSS variables defined in globals.css.
 */
const categoryConfig: Record<
  ProductCategory,
  { icon: typeof Coffee; color: string; label: string }
> = {
  drink: { icon: Coffee, color: 'var(--drink)', label: 'Drink' },
  food: { icon: UtensilsCrossed, color: 'var(--food)', label: 'Food' },
  accessory: { icon: Package, color: 'var(--accessory)', label: 'Accessory' },
};

export function ProductCard({ product, onQuickView }: ProductCardProps) {
  const { addItem } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const category = categoryConfig[product.category];
  const CategoryIcon = category.icon;
  const isOutOfStock = product.inventory === 0;

  async function handleAddToCart() {
    if (isAdding || isOutOfStock) return;

    setIsAdding(true);
    try {
      await addItem({ productId: product.productId, quantity: 1 });
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1500);
    } catch (error) {
      // TODO(error-handling): Add toast notification for add-to-cart failures
      console.error('Failed to add item to cart:', error);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <article
      className="group rounded-lg border overflow-hidden transition-all hover:shadow-md"
      style={{
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Product image placeholder */}
      <button
        onClick={() => onQuickView?.(product)}
        className="relative w-full aspect-[4/3] flex items-center justify-center cursor-pointer overflow-hidden"
        style={{ backgroundColor: 'var(--secondary)' }}
        aria-label={`View details for ${product.name}`}
      >
        <CategoryIcon
          className="h-12 w-12 transition-transform group-hover:scale-110"
          style={{ color: category.color }}
          aria-hidden="true"
        />

        {/* Category badge */}
        <span
          className="absolute top-3 left-3 px-2 py-1 text-xs font-medium rounded-md"
          style={{
            backgroundColor: 'var(--card)',
            color: category.color,
          }}
        >
          {category.label}
        </span>

        {/* Stock indicator */}
        {isOutOfStock && (
          <span
            className="absolute top-3 right-3 px-2 py-1 text-xs font-medium rounded-md"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.9)',
              color: 'var(--foreground)',
            }}
          >
            Out of Stock
          </span>
        )}
      </button>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <button onClick={() => onQuickView?.(product)} className="text-left w-full">
            <h3
              className="font-semibold text-base leading-tight hover:underline"
              style={{ color: 'var(--foreground)' }}
            >
              {product.name}
            </h3>
          </button>
          <p
            className="text-sm mt-1 line-clamp-2"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {product.description}
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
              {formatMoney(product.price.amountMinor, product.price.currency)}
            </p>
            {!isOutOfStock && (
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {product.inventory} in stock
              </p>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            disabled={isAdding || isOutOfStock}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: justAdded ? 'var(--success)' : 'var(--primary)',
              color: justAdded
                ? 'var(--success-foreground)'
                : 'var(--primary-foreground)',
            }}
            aria-label={`Add ${product.name} to cart`}
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : justAdded ? (
              <>
                <Check className="h-4 w-4" />
                <span>Added</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
