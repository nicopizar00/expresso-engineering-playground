'use client';

/**
 * ProductQuickView - Modal for quick product viewing and adding to cart
 *
 * Redesigned with a clean, modern interface and smooth animations.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Coffee, UtensilsCrossed, Package, Plus, Minus, Check, Loader2, ShoppingBag } from 'lucide-react';
import { Product, ProductCategory, formatMoney } from '@/lib/api/expresso-api';
import { useCart } from '@/components/cart/CartProvider';

interface ProductQuickViewProps {
  product: Product;
  onClose: () => void;
}

const categoryConfig: Record<ProductCategory, { icon: typeof Coffee; color: string; bgColor: string; label: string }> = {
  drink: { icon: Coffee, color: 'var(--drink)', bgColor: 'rgba(0, 212, 170, 0.1)', label: 'Drink' },
  food: { icon: UtensilsCrossed, color: 'var(--food)', bgColor: 'rgba(34, 197, 94, 0.1)', label: 'Food' },
  accessory: { icon: Package, color: 'var(--accessory)', bgColor: 'rgba(139, 92, 246, 0.1)', label: 'Accessory' },
};

export function ProductQuickView({ product, onClose }: ProductQuickViewProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const category = categoryConfig[product.category];
  const CategoryIcon = category.icon;
  const isOutOfStock = product.inventory === 0;
  const maxQuantity = Math.min(20, product.inventory);

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

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
      console.error('Failed to add item to cart:', error);
    } finally {
      setIsAdding(false);
    }
  }

  const lineTotal = (product.price.amountMinor * quantity);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 transition-opacity animate-fadeIn"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div 
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-auto sm:w-full sm:max-w-md rounded-xl overflow-hidden animate-slideUp"
        style={{ 
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickview-title"
      >
        {/* Header with close button */}
        <div 
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Quick Add
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{ 
              backgroundColor: 'var(--secondary)',
              color: 'var(--muted-foreground)',
            }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Product visual */}
        <div 
          className="relative w-full aspect-video flex items-center justify-center"
          style={{ backgroundColor: 'var(--secondary)' }}
        >
          <CategoryIcon 
            className="h-16 w-16" 
            style={{ color: category.color, opacity: 0.7 }}
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
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Product info */}
          <div>
            <h2 
              id="quickview-title"
              className="text-lg font-semibold mb-1"
              style={{ color: 'var(--foreground)' }}
            >
              {product.name}
            </h2>
            <p 
              className="text-xs font-mono"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {product.sku}
            </p>
          </div>

          <p 
            className="text-sm leading-relaxed"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {product.description}
          </p>

          {/* Price and stock */}
          <div className="flex items-center justify-between">
            <p 
              className="text-xl font-semibold font-mono"
              style={{ color: 'var(--foreground)' }}
            >
              {formatMoney(product.price.amountMinor, product.price.currency)}
            </p>
            {!isOutOfStock && (
              <span 
                className="px-2 py-1 text-xs font-medium rounded-md"
                style={{ 
                  backgroundColor: 'var(--secondary)',
                  color: 'var(--muted-foreground)',
                }}
              >
                {product.inventory} available
              </span>
            )}
          </div>

          {/* Quantity selector */}
          {!isOutOfStock && (
            <div 
              className="flex items-center justify-between p-3 rounded-lg"
              style={{ backgroundColor: 'var(--secondary)' }}
            >
              <span 
                className="text-sm font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                Quantity
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="flex items-center justify-center w-8 h-8 rounded-md transition-colors disabled:opacity-30"
                  style={{ 
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                  }}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span 
                  className="text-base font-semibold w-8 text-center font-mono"
                  style={{ color: 'var(--foreground)' }}
                >
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                  className="flex items-center justify-center w-8 h-8 rounded-md transition-colors disabled:opacity-30"
                  style={{ 
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                  }}
                  aria-label="Increase quantity"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Add to cart button */}
          <button
            onClick={handleAddToCart}
            disabled={isAdding || isOutOfStock}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: justAdded ? 'var(--success)' : 'var(--primary)',
              color: justAdded ? 'var(--success-foreground)' : 'var(--primary-foreground)',
            }}
          >
            {isAdding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Adding...</span>
              </>
            ) : justAdded ? (
              <>
                <Check className="h-4 w-4" />
                <span>Added to Cart</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>
                  Add to Cart - {formatMoney(lineTotal, product.price.currency)}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
