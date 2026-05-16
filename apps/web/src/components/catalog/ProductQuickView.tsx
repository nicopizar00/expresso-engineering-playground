'use client';

import { useState } from 'react';
import { X, Coffee, UtensilsCrossed, Package, Plus, Minus, Check, Loader2 } from 'lucide-react';
import { Product, ProductCategory } from '@/lib/api/expresso-api';
import { useCart } from '@/components/cart/CartProvider';

interface ProductQuickViewProps {
  product: Product;
  onClose: () => void;
}

const categoryConfig: Record<ProductCategory, { icon: typeof Coffee; color: string; label: string }> = {
  drink: { icon: Coffee, color: 'var(--drink)', label: 'Drink' },
  food: { icon: UtensilsCrossed, color: 'var(--food)', label: 'Food' },
  accessory: { icon: Package, color: 'var(--accessory)', label: 'Accessory' },
};

function formatMoney(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

export function ProductQuickView({ product, onClose }: ProductQuickViewProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const category = categoryConfig[product.category];
  const CategoryIcon = category.icon;
  const isOutOfStock = product.inventory === 0;
  const maxQuantity = Math.min(20, product.inventory);

  async function handleAddToCart() {
    if (isAdding || isOutOfStock) return;
    
    setIsAdding(true);
    try {
      await addItem({ productId: product.productId, quantity });
      setJustAdded(true);
      setTimeout(() => {
        setJustAdded(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('[v0] Failed to add item to cart:', error);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 bg-black/50 transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div 
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-auto sm:w-full sm:max-w-lg rounded-lg overflow-hidden animate-slideUp"
        style={{ 
          backgroundColor: 'var(--card)',
          boxShadow: 'var(--shadow-lg)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickview-title"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 p-2 rounded-full transition-colors"
          style={{ 
            backgroundColor: 'var(--secondary)',
            color: 'var(--foreground)',
          }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Product image placeholder */}
        <div 
          className="relative w-full aspect-video flex items-center justify-center"
          style={{ backgroundColor: 'var(--secondary)' }}
        >
          <CategoryIcon 
            className="h-20 w-20" 
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
              className="absolute top-3 right-14 px-2 py-1 text-xs font-medium rounded-md"
              style={{ 
                backgroundColor: 'rgba(239, 68, 68, 0.9)',
                color: 'var(--foreground)',
              }}
            >
              Out of Stock
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <h2 
              id="quickview-title"
              className="text-xl font-bold"
              style={{ color: 'var(--foreground)' }}
            >
              {product.name}
            </h2>
            <p 
              className="text-xs font-mono mt-1"
              style={{ color: 'var(--muted-foreground)' }}
            >
              SKU: {product.sku}
            </p>
          </div>

          <p 
            className="text-sm leading-relaxed"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {product.description}
          </p>

          <div className="flex items-center justify-between">
            <p 
              className="text-2xl font-bold"
              style={{ color: 'var(--foreground)' }}
            >
              {formatMoney(product.price.amountMinor, product.price.currency)}
            </p>
            {!isOutOfStock && (
              <p 
                className="text-sm"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {product.inventory} in stock
              </p>
            )}
          </div>

          {/* Quantity selector */}
          {!isOutOfStock && (
            <div className="flex items-center gap-4">
              <label 
                className="text-sm font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                Quantity
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="p-2 rounded-md transition-colors disabled:opacity-50"
                  style={{ 
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--foreground)',
                  }}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span 
                  className="text-lg font-semibold w-12 text-center"
                  style={{ color: 'var(--foreground)' }}
                >
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                  className="p-2 rounded-md transition-colors disabled:opacity-50"
                  style={{ 
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--foreground)',
                  }}
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Add to cart button */}
          <button
            onClick={handleAddToCart}
            disabled={isAdding || isOutOfStock}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-md text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: justAdded ? 'var(--success)' : 'var(--primary)',
              color: justAdded ? 'var(--success-foreground)' : 'var(--primary-foreground)',
            }}
          >
            {isAdding ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Adding...</span>
              </>
            ) : justAdded ? (
              <>
                <Check className="h-5 w-5" />
                <span>Added to Cart!</span>
              </>
            ) : (
              <>
                <Plus className="h-5 w-5" />
                <span>
                  Add to Cart
                  {quantity > 1 && ` (${quantity})`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
