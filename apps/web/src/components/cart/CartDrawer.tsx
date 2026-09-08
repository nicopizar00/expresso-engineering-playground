'use client';

/**
 * CartDrawer - Slide-over cart panel
 *
 * Displays current cart contents with item list and checkout link. Once a
 * cup is in the cart, quantity and removal are governed by the BFF's
 * one-cup invariant (CUP-001) — no controls are exposed for either.
 *
 * TODO(v0-export): Extract CartItemRow to separate file for reusability
 */

import { useRef } from 'react';
import { X, ShoppingCart, ArrowRight } from 'lucide-react';
import { useCart } from './CartProvider';
import { EmptyState } from '@/components/system/EmptyState';
import { LoadingSpinner } from '@/components/system/LoadingSkeleton';
import { formatMoney, CartItem as CartItemType } from '@/lib/api/expresso-api';
import { useDialogA11y } from '@/lib/hooks/useDialogA11y';
import Link from 'next/link';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { cart, isLoading, isEmpty, formattedTotal, itemCount } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);

  useDialogA11y({ open, onClose, containerRef: drawerRef });

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
        ref={drawerRef}
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col animate-slideInRight"
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
              Cart is in-memory and resets on BFF restart. Orders are persisted.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Individual cart item row. Once a cup is selected, the only normal product
 * action is Place Order (CUP-001) — quantity and removal controls are not
 * shown because the BFF now rejects both once an item is in the cart.
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
          <div className="flex items-center justify-between mt-2">
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--foreground)' }}
            >
              Qty: {item.quantity}
            </span>
            <span
              className="font-medium text-sm"
              style={{ color: 'var(--foreground)' }}
            >
              {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
