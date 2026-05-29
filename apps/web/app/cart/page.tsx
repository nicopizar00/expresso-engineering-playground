'use client';

/**
 * Cart Page - Full cart view with order summary
 *
 * Displays all cart items with details and provides checkout navigation.
 * Quantity steppers and remove drive PATCH/DELETE /cart/items/:itemId through
 * the cart context (same-origin /api/bff proxy).
 */

import { useState } from 'react';
import { ShoppingCart, ArrowRight, Minus, Plus, Trash2, Loader2 } from 'lucide-react';
import { useCart } from '@/components/cart/CartProvider';
import { EmptyState } from '@/components/system/EmptyState';
import { PageLoadingState } from '@/components/system/LoadingSkeleton';
import { formatMoney, CartItem as CartItemType } from '@/lib/api/expresso-api';
import Link from 'next/link';

const MAX_QUANTITY = 20;

export default function CartPage() {
  const { cart, isLoading, isEmpty, formattedTotal } = useCart();

  if (isLoading) {
    return (
      <div className="container py-8">
        <PageLoadingState message="Loading cart..." />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <h1
        className="text-3xl font-bold tracking-tight mb-8"
        style={{ color: 'var(--foreground)' }}
      >
        Shopping Cart
      </h1>

      {isEmpty ? (
        <EmptyState
          variant="cart"
          action={{
            label: 'Browse Products',
            href: '/',
          }}
        />
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart items */}
          <div className="lg:col-span-2">
            <div
              className="rounded-lg border divide-y"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
              }}
            >
              {cart?.items.map((item) => (
                <CartItemRow key={item.itemId} item={item} />
              ))}
            </div>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <div
              className="rounded-lg border p-6 sticky top-24"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
              }}
            >
              <h2
                className="font-semibold text-lg mb-4"
                style={{ color: 'var(--foreground)' }}
              >
                Order Summary
              </h2>

              <dl className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <dt style={{ color: 'var(--muted-foreground)' }}>
                    Items ({cart?.itemCount})
                  </dt>
                  <dd style={{ color: 'var(--foreground)' }}>{formattedTotal}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt style={{ color: 'var(--muted-foreground)' }}>Shipping</dt>
                  <dd style={{ color: 'var(--muted-foreground)' }}>Free</dd>
                </div>
                <div
                  className="flex justify-between pt-3 border-t font-semibold"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <dt style={{ color: 'var(--foreground)' }}>Total</dt>
                  <dd style={{ color: 'var(--foreground)' }}>{formattedTotal}</dd>
                </div>
              </dl>

              <Link
                href="/checkout"
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
                className="text-xs text-center mt-4"
                style={{ color: 'var(--muted-foreground)' }}
              >
                Cart resets when the BFF restarts (in-memory storage)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Cart item row for full cart page. Quantity steppers and remove call the cart
 * context, which hits PATCH/DELETE /cart/items/:itemId via the proxy.
 */
function CartItemRow({ item }: { item: CartItemType }) {
  const { updateItem, removeItem } = useCart();
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
    } catch {
      // SWR keeps the last good cart on failure.
      // TODO(error-handling): replace with a user-facing toast.
    } finally {
      setPending(false);
    }
  }

  const atMin = item.quantity <= 1;
  const atMax = item.quantity >= MAX_QUANTITY;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex gap-4">
        {/* Product placeholder */}
        <div
          className="w-20 h-20 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--secondary)' }}
          aria-hidden="true"
        >
          <ShoppingCart
            className="h-8 w-8"
            style={{ color: 'var(--muted-foreground)' }}
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium" style={{ color: 'var(--foreground)' }}>
            {item.name}
          </h3>
          <p
            className="text-xs mt-0.5 font-mono"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {item.productId}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            {formatMoney(item.unitPrice.amountMinor, item.unitPrice.currency)} each
          </p>

          {/* Quantity controls */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => run(() => updateItem(item.itemId, item.quantity - 1))}
              disabled={pending || atMin}
              className="p-1.5 rounded transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
              aria-label="Decrease quantity"
              title={atMin ? 'Use remove to clear this item' : 'Decrease quantity'}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span
              className="text-sm font-medium w-8 text-center flex items-center justify-center"
              style={{ color: 'var(--foreground)' }}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.quantity}
            </span>
            <button
              onClick={() => run(() => updateItem(item.itemId, item.quantity + 1))}
              disabled={pending || atMax}
              className="p-1.5 rounded transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
              aria-label="Increase quantity"
              title={atMax ? 'Maximum quantity reached' : 'Increase quantity'}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => run(() => removeItem(item.itemId))}
              disabled={pending}
              className="ml-2 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 hover:opacity-80"
              style={{ color: 'var(--destructive)' }}
              aria-label={`Remove ${item.name} from cart`}
              title="Remove from cart"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>

        {/* Line total */}
        <div className="text-right">
          <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
            {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
