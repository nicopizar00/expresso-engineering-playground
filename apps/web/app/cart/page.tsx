'use client';

/**
 * Cart Page - Full cart view with order summary
 *
 * Displays all cart items with details and provides checkout navigation.
 * Redesigned with a clean, modern interface.
 */

import { useState } from 'react';
import { ShoppingBag, ArrowRight, Coffee, AlertCircle, ArrowLeft, Minus, Plus, Trash2, Loader2 } from 'lucide-react';
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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--foreground)' }}
            >
              Shopping Cart
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {isEmpty ? 'Your cart is empty' : `${cart?.itemCount} items in your cart`}
            </p>
          </div>
        </div>
        
        <Link
          href="/"
          className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Continue Shopping</span>
        </Link>
      </div>

      {isEmpty ? (
        <EmptyState
          variant="cart"
          action={{
            label: 'Browse Products',
            href: '/',
          }}
        />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Cart items */}
          <div className="lg:col-span-2">
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
              }}
            >
              <div 
                className="px-5 py-4 border-b flex items-center justify-between"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  Cart Items
                </span>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {cart?.itemCount} items
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {cart?.items.map((item) => (
                  <CartItemRow key={item.itemId} item={item} />
                ))}
              </div>
            </div>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <div
              className="rounded-xl border p-5 sticky top-20"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
              }}
            >
              <h2
                className="font-semibold mb-4"
                style={{ color: 'var(--foreground)' }}
              >
                Order Summary
              </h2>

              <dl className="space-y-3 mb-5">
                <div className="flex justify-between text-sm">
                  <dt style={{ color: 'var(--muted-foreground)' }}>
                    Subtotal ({cart?.itemCount} items)
                  </dt>
                  <dd className="font-mono font-medium" style={{ color: 'var(--foreground)' }}>
                    {formattedTotal}
                  </dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt style={{ color: 'var(--muted-foreground)' }}>Shipping</dt>
                  <dd style={{ color: 'var(--success)' }}>Free</dd>
                </div>
                <div
                  className="flex justify-between pt-3 border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <dt className="font-medium" style={{ color: 'var(--foreground)' }}>Total</dt>
                  <dd className="text-lg font-semibold font-mono" style={{ color: 'var(--foreground)' }}>
                    {formattedTotal}
                  </dd>
                </div>
              </dl>

              <Link
                href="/checkout"
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
                className="flex items-start gap-2 p-3 rounded-lg mt-4"
                style={{ backgroundColor: 'var(--secondary)' }}
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Cart is in-memory and resets on BFF restart. Orders are persisted.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Cart item row for full cart page
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
          className="w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--secondary)' }}
          aria-hidden="true"
        >
          <Coffee className="h-8 w-8" style={{ color: 'var(--muted-foreground)' }} />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium" style={{ color: 'var(--foreground)' }}>
            {item.name}
          </h3>
          <p className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
            Qty: {item.quantity} x{' '}
            <span className="font-mono">
              {formatMoney(item.unitPrice.amountMinor, item.unitPrice.currency)}
            </span>
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => run(() => updateItem(item.itemId, item.quantity - 1))}
              disabled={pending || atMin}
              className="flex items-center justify-center w-8 h-8 rounded transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
              aria-label="Decrease quantity"
              title={atMin ? 'Use remove to clear this item' : 'Decrease quantity'}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span
              className="text-sm font-medium w-8 text-center flex items-center justify-center font-mono"
              style={{ color: 'var(--foreground)' }}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.quantity}
            </span>
            <button
              onClick={() => run(() => updateItem(item.itemId, item.quantity + 1))}
              disabled={pending || atMax}
              className="flex items-center justify-center w-8 h-8 rounded transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
              aria-label="Increase quantity"
              title={atMax ? 'Maximum quantity reached' : 'Increase quantity'}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => run(() => removeItem(item.itemId))}
              disabled={pending}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50"
              style={{ color: 'var(--destructive)' }}
              aria-label={`Remove ${item.name} from cart`}
              title="Remove from cart"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
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

        {/* Line total */}
        <div className="text-right shrink-0">
          <p className="font-semibold font-mono" style={{ color: 'var(--foreground)' }}>
            {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
