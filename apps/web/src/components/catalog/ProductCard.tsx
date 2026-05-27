'use client';

/**
 * ProductCard - Individual product display card
 *
 * Displays product info with add-to-cart functionality.
 * Redesigned with a clean card-based interface and smooth interactions.
 */

import { useState } from 'react';
import { Coffee, UtensilsCrossed, Package, Plus, Check, Loader2, Eye } from 'lucide-react';
import { Product, ProductCategory, formatMoney } from '@/lib/api/expresso-api';
import { useCart } from '@/components/cart/CartProvider';

interface ProductCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
}

const categoryConfig: Record<
  ProductCategory,
  { icon: typeof Coffee; color: string; bgColor: string; label: string }
> = {
  drink: {
    icon: Coffee,
    color: 'var(--drink)',
    bgColor: 'rgba(0, 212, 170, 0.1)',
    label: 'Drink',
  },
  food: {
    icon: UtensilsCrossed,
    color: 'var(--food)',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    label: 'Food',
  },
  accessory: {
    icon: Package,
    color: 'var(--accessory)',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    label: 'Accessory',
  },
};

export function ProductCard({ product, onQuickView }: ProductCardProps) {
  const { addItem } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const category = categoryConfig[product.category];
  const CategoryIcon = category.icon;
  const isOutOfStock = product.inventory === 0;

  async function handleAddToCart(e: React.MouseEvent) {
    e.stopPropagation();
    if (isAdding || isOutOfStock) return;

    setIsAdding(true);
    try {
      await addItem({ productId: product.productId, quantity: 1 });
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1500);
    } catch (error) {
      console.error('Failed to add item to cart:', error);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <article
      className="group rounded-xl border overflow-hidden transition-all duration-200"
      style={{
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Product visual area */}
      <div
        className="relative aspect-[4/3] flex items-center justify-center cursor-pointer overflow-hidden"
        style={{ backgroundColor: 'var(--secondary)' }}
        onClick={() => onQuickView?.(product)}
      >
        {/* Category icon */}
        <CategoryIcon
          className="h-14 w-14 transition-transform duration-300 group-hover:scale-110"
          style={{ color: category.color, opacity: 0.8 }}
          aria-hidden="true"
        />

        {/* Category badge */}
        <span
          className="absolute top-3 left-3 px-2 py-1 text-[10px] font-medium rounded-md uppercase tracking-wider"
          style={{
            backgroundColor: category.bgColor,
            color: category.color,
          }}
        >
          {category.label}
        </span>

        {/* Stock indicator */}
        {isOutOfStock && (
          <span
            className="absolute top-3 right-3 px-2 py-1 text-[10px] font-medium rounded-md uppercase tracking-wider"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--destructive)',
            }}
          >
            Out of Stock
          </span>
        )}

        {/* Quick view button - visible on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onQuickView?.(product);
          }}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium opacity-0 group-hover:opacity-100 transition-all duration-200"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'var(--foreground)',
            backdropFilter: 'blur(4px)',
          }}
          aria-label={`Quick view ${product.name}`}
        >
          <Eye className="h-3 w-3" />
          <span>Quick View</span>
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="mb-3">
          <h3
            className="font-medium text-sm leading-tight mb-1 line-clamp-1"
            style={{ color: 'var(--foreground)' }}
          >
            {product.name}
          </h3>
          <p
            className="text-xs line-clamp-2"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {product.description}
          </p>
        </div>

        <div className="flex items-end justify-between gap-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p
              className="text-lg font-semibold font-mono"
              style={{ color: 'var(--foreground)' }}
            >
              {formatMoney(product.price.amountMinor, product.price.currency)}
            </p>
            {!isOutOfStock && (
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                {product.inventory} in stock
              </p>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            disabled={isAdding || isOutOfStock}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: justAdded ? 'var(--success)' : 'var(--primary)',
              color: justAdded ? 'var(--success-foreground)' : 'var(--primary-foreground)',
            }}
            aria-label={`Add ${product.name} to cart`}
          >
            {isAdding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : justAdded ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Added</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
