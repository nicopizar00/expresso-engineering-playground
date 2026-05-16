'use client';

/**
 * Cart Page - Full cart view with order summary
 *
 * Displays all cart items with details and provides checkout navigation.
 *
 * TODO(api-wire): Wire quantity update when PATCH /cart/items/:id exists
 * TODO(api-wire): Wire item removal when DELETE /cart/items/:id exists
 */

import { ShoppingCart, ArrowRight } from 'lucide-react';
import { useCart } from '@/components/cart/CartProvider';
import { EmptyState } from '@/components/system/EmptyState';
import { PageLoadingState } from '@/components/system/LoadingSkeleton';
import { formatMoney, CartItem as CartItemType } from '@/lib/api/expresso-api';
import Link from 'next/link';

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
 * Cart item row for full cart page.
 *
 * TODO(api-wire): Quantity controls pending BFF endpoints
 */
function CartItemRow({ item }: { item: CartItemType }) {
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
            Qty: {item.quantity} x{' '}
            {formatMoney(item.unitPrice.amountMinor, item.unitPrice.currency)}
          </p>
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
