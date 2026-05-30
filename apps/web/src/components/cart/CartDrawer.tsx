'use client';

/**
 * CartDrawer - Slide-over cart panel
 *
 * Displays current cart contents with item list and checkout link.
 * Redesigned with a clean, modern interface.
 */

import { useRef, useState } from 'react';
import { X, Minus, Plus, Trash2, ArrowRight, Coffee, ShoppingBag, AlertCircle, Loader2 } from 'lucide-react';
import { useCart } from './CartProvider';
import { EmptyState } from '@/components/system/EmptyState';
import { LoadingSpinner } from '@/components/system/LoadingSkeleton';
import { formatMoney, CartItem as CartItemType } from '@/lib/api/expresso-api';
import { useDialogA11y } from '@/lib/hooks/useDialogA11y';
import Link from 'next/link';

const MAX_QUANTITY = 20;

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
        className="fixed inset-0 z-50 transition-opacity animate-fadeIn"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
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
          borderLeft: '1px solid var(--border)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="cart-drawer-title"
                className="font-semibold"
                style={{ color: 'var(--foreground)' }}
              >
                Shopping Cart
              </h2>
              {itemCount > 0 && (
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
            style={{
              backgroundColor: 'var(--secondary)',
              color: 'var(--muted-foreground)',
            }}
            aria-label="Close cart"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner size="lg" />
            </div>
          ) : isEmpty ? (
            <div className="p-5">
              <EmptyState
                variant="cart"
                action={{
                  label: 'Browse Products',
                  href: '/',
                  onClick: onClose,
                }}
              />
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {cart?.items.map((item) => (
                <CartItemRow key={item.itemId} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isEmpty && (
          <div
            className="border-t p-5 space-y-4"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
          >
            {/* Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--muted-foreground)' }}>Subtotal</span>
                <span className="font-mono font-medium" style={{ color: 'var(--foreground)' }}>
                  {formattedTotal}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--muted-foreground)' }}>Shipping</span>
                <span style={{ color: 'var(--success)' }}>Free</span>
              </div>
              <div 
                className="flex items-center justify-between pt-2 border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="font-medium" style={{ color: 'var(--foreground)' }}>Total</span>
                <span className="text-lg font-semibold font-mono" style={{ color: 'var(--foreground)' }}>
                  {formattedTotal}
                </span>
              </div>
            </div>

            {/* Checkout button */}
            <Link
              href="/checkout"
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
              }}
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            {/* Notice */}
            <div 
              className="flex items-start gap-2 p-3 rounded-lg"
              style={{ backgroundColor: 'var(--secondary)' }}
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Cart is stored in-memory and resets when the BFF restarts. Orders are persisted to PostgreSQL.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Individual cart item row
 */
function CartItemRow({ item }: { item: CartItemType }) {
  const { updateItem, removeItem } = useCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch {
      setError('Update failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  const atMin = item.quantity <= 1;
  const atMax = item.quantity >= MAX_QUANTITY;

  return (
    <div className="p-5">
      <div className="flex gap-4">
        {/* Product placeholder */}
        <div
          className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--secondary)' }}
          aria-hidden="true"
        >
          <Coffee className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <h3
            className="font-medium text-sm leading-tight mb-0.5"
            style={{ color: 'var(--foreground)' }}
          >
            {item.name}
          </h3>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => run(() => updateItem(item.itemId, item.quantity - 1))}
                disabled={pending || atMin}
                className="flex items-center justify-center w-6 h-6 rounded transition-colors disabled:opacity-30"
                style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
                aria-label="Decrease quantity"
                title={atMin ? 'Use remove to clear this item' : 'Decrease quantity'}
              >
                <Minus className="h-3 w-3" />
              </button>
              <span
                className="text-sm font-medium w-8 text-center font-mono"
                style={{ color: 'var(--foreground)' }}
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : item.quantity}
              </span>
              <button
                onClick={() => run(() => updateItem(item.itemId, item.quantity + 1))}
                disabled={pending || atMax}
                className="flex items-center justify-center w-6 h-6 rounded transition-colors disabled:opacity-30"
                style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
                aria-label="Increase quantity"
                title={atMax ? 'Maximum quantity reached' : 'Increase quantity'}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Line total */}
            <span className="font-medium font-mono text-sm" style={{ color: 'var(--foreground)' }}>
              {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
            </span>
          </div>
          {error && (
            <p
              role="alert"
              className="text-xs mt-2"
              style={{ color: 'var(--destructive)' }}
            >
              {error}
            </p>
          )}
        </div>

        <button
          onClick={() => run(() => removeItem(item.itemId))}
          disabled={pending}
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors disabled:opacity-30"
          style={{ color: 'var(--destructive)' }}
          aria-label={`Remove ${item.name} from cart`}
          title="Remove from cart"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
