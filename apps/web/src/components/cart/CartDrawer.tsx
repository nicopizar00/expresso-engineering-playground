'use client';

/**
 * CartDrawer - Slide-over cart panel
 *
 * Displays current cart contents with item list and checkout link.
 *
 * TODO(api-wire): Wire quantity update buttons when PATCH /cart/items/:id exists
 * TODO(api-wire): Wire remove button when DELETE /cart/items/:id exists
 * TODO(v0-export): Extract CartItemRow to separate file for reusability
 */

import { X, ShoppingCart, Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useCart } from './CartProvider';
import { EmptyState } from '@/components/system/EmptyState';
import { LoadingSpinner } from '@/components/system/LoadingSkeleton';
import { formatMoney, CartItem as CartItemType } from '@/lib/api/expresso-api';
import Link from 'next/link';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { cart, isLoading, isEmpty, formattedTotal, itemCount } = useCart();

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col animate-slideUp"
        style={{
          backgroundColor: 'var(--card)',
          boxShadow: 'var(--shadow-lg)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" style={{ color: 'var(--primary)' }} />
            <h2
              id="cart-drawer-title"
              className="font-semibold text-lg"
              style={{ color: 'var(--foreground)' }}
            >
              Cart
            </h2>
            {itemCount > 0 && (
              <span
                className="px-2 py-0.5 text-xs font-medium rounded-full"
                style={{
                  backgroundColor: 'var(--secondary)',
                  color: 'var(--muted-foreground)',
                }}
              >
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md transition-colors"
            style={{
              backgroundColor: 'var(--secondary)',
              color: 'var(--foreground)',
            }}
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner size="lg" />
            </div>
          ) : isEmpty ? (
            <EmptyState
              variant="cart"
              action={{
                label: 'Browse Products',
                href: '/',
                onClick: onClose,
              }}
            />
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {cart?.items.map((item) => (
                <CartItemRow key={item.itemId} item={item} />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {!isEmpty && (
          <div
            className="border-t p-4 space-y-4"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                Subtotal
              </span>
              <span
                className="text-lg font-semibold"
                style={{ color: 'var(--foreground)' }}
              >
                {formattedTotal}
              </span>
            </div>
            <Link
              href="/checkout"
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
              }}
            >
              Proceed to Checkout
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p
              className="text-xs text-center"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Cart resets when the BFF restarts (in-memory storage)
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Individual cart item row.
 *
 * TODO(api-wire): Quantity controls are disabled pending BFF endpoints:
 *   - PATCH /cart/items/:itemId { quantity: number }
 *   - DELETE /cart/items/:itemId
 */
function CartItemRow({ item }: { item: CartItemType }) {
  return (
    <li className="p-4">
      <div className="flex gap-4">
        {/* Product placeholder */}
        <div
          className="w-16 h-16 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--secondary)' }}
          aria-hidden="true"
        >
          <ShoppingCart
            className="h-6 w-6"
            style={{ color: 'var(--muted-foreground)' }}
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <h3
            className="font-medium text-sm truncate"
            style={{ color: 'var(--foreground)' }}
          >
            {item.name}
          </h3>
          <p
            className="text-xs mt-0.5 font-mono"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {item.productId}
          </p>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {/* Quantity controls - disabled until BFF supports PATCH/DELETE */}
              <button
                disabled
                className="p-1 rounded transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--secondary)',
                  color: 'var(--foreground)',
                }}
                aria-label="Decrease quantity"
                title="Not available - BFF endpoint not implemented"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span
                className="text-sm font-medium w-8 text-center"
                style={{ color: 'var(--foreground)' }}
              >
                {item.quantity}
              </span>
              <button
                disabled
                className="p-1 rounded transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--secondary)',
                  color: 'var(--foreground)',
                }}
                aria-label="Increase quantity"
                title="Not available - BFF endpoint not implemented"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <span
              className="font-medium text-sm"
              style={{ color: 'var(--foreground)' }}
            >
              {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
            </span>
          </div>
        </div>

        {/* Remove button - disabled until BFF supports DELETE */}
        <button
          disabled
          className="p-1 h-fit rounded transition-colors disabled:opacity-50"
          style={{ color: 'var(--muted-foreground)' }}
          aria-label={`Remove ${item.name} from cart`}
          title="Not available - BFF endpoint not implemented"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
