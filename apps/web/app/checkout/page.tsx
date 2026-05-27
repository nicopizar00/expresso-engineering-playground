'use client';

/**
 * Checkout Page - Order placement flow
 *
 * Collects customer name and creates an order via POST /checkout.
 * No real payment is processed - this is a playground environment.
 *
 * ## API Endpoint
 * POST /checkout → CheckoutResponse
 * Body: { customerName: string, idempotencyKey?: string }
 * Verified against: apps/bff/src/modules/checkout/checkout.controller.ts
 *
 * TODO(api-wire): Consider adding idempotencyKey for production use
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart,
  CreditCard,
  Loader2,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { useCart } from '@/components/cart/CartProvider';
import { expressoApi, ExpressoApiError, formatMoney } from '@/lib/api/expresso-api';
import { EmptyState } from '@/components/system/EmptyState';
import { PageLoadingState } from '@/components/system/LoadingSkeleton';
import Link from 'next/link';

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, isLoading, isEmpty, formattedTotal, refreshCart } = useCart();
  const [customerName, setCustomerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await expressoApi.checkout({
        customerName: customerName.trim(),
      });
      refreshCart(); // Clear the cart after successful checkout
      router.push(`/orders/${result.orderId}`);
    } catch (err) {
      if (err instanceof ExpressoApiError) {
        if (err.status === 400) {
          setError(
            'Invalid checkout request. Please check your cart and try again.'
          );
        } else if (err.status === 409) {
          setError(
            'Checkout conflict. Your cart may have been modified. Please refresh and try again.'
          );
        } else {
          setError(`Checkout failed: ${err.message}`);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      // TODO(error-handling): Add structured error logging
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="container py-8">
        <PageLoadingState message="Loading checkout..." />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="container py-8">
        <EmptyState
          variant="cart"
          title="Your cart is empty"
          description="Add some products to your cart before checking out."
          action={{
            label: 'Browse Products',
            href: '/',
          }}
        />
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-2xl">
      {/* Back link */}
      <Link
        href="/cart"
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors hover:opacity-80"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cart
      </Link>

      <h1
        className="text-3xl font-bold tracking-tight mb-8"
        style={{ color: 'var(--foreground)' }}
      >
        Checkout
      </h1>

      <div className="space-y-6">
        {/* Order summary card */}
        <div
          className="rounded-lg border p-6"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <h2
            className="font-semibold text-lg mb-4 flex items-center gap-2"
            style={{ color: 'var(--foreground)' }}
          >
            <ShoppingCart className="h-5 w-5" style={{ color: 'var(--primary)' }} />
            Order Summary
          </h2>

          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {cart?.items.map((item) => (
              <li key={item.itemId} className="py-3 flex justify-between">
                <div>
                  <p
                    className="font-medium text-sm"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {item.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    Qty: {item.quantity}
                  </p>
                </div>
                <p
                  className="font-medium text-sm"
                  style={{ color: 'var(--foreground)' }}
                >
                  {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
                </p>
              </li>
            ))}
          </ul>

          <div
            className="flex justify-between pt-4 mt-4 border-t font-semibold"
            style={{ borderColor: 'var(--border)' }}
          >
            <span style={{ color: 'var(--foreground)' }}>Total</span>
            <span style={{ color: 'var(--foreground)' }}>{formattedTotal}</span>
          </div>
        </div>

        {/* Checkout form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border p-6"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <h2
            className="font-semibold text-lg mb-4 flex items-center gap-2"
            style={{ color: 'var(--foreground)' }}
          >
            <CreditCard className="h-5 w-5" style={{ color: 'var(--primary)' }} />
            Customer Information
          </h2>

          {/* Error message */}
          {error && (
            <div
              className="flex items-start gap-2 p-3 rounded-md mb-4"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--destructive)',
              }}
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="customerName"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                Your Name
              </label>
              <input
                type="text"
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                required
                className="w-full px-3 py-2 rounded-md border text-sm transition-colors focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                This name will appear on your order confirmation.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !customerName.trim()}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>Place Order</>
              )}
            </button>
          </div>
        </form>

        {/* Notice */}
        <p
          className="text-xs text-center"
          style={{ color: 'var(--muted-foreground)' }}
        >
          This is a playground environment. No real payment is processed. Orders
          reset when the BFF restarts (in-memory storage).
        </p>
      </div>
    </div>
  );
}
