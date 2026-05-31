'use client';

/**
 * Checkout Page - Order placement flow
 *
 * Collects customer name and creates an order via POST /checkout.
 * Redesigned with a clean, modern interface.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  CreditCard,
  Loader2,
  ArrowLeft,
  AlertTriangle,
  User,
  CheckCircle2,
  Shield,
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
      refreshCart();
      router.push(`/orders/${result.orderId}`);
    } catch (err) {
      if (err instanceof ExpressoApiError) {
        if (err.status === 400) {
          setError('Invalid checkout request. Please check your cart and try again.');
        } else if (err.status === 409) {
          setError('Checkout conflict. Your cart may have been modified. Please refresh and try again.');
        } else {
          setError(`Checkout failed: ${err.message}`);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
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
        className="inline-flex items-center gap-2 text-sm font-medium mb-6 transition-colors"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cart
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--foreground)' }}
          >
            Checkout
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Complete your order
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Order summary card */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <div 
            className="flex items-center gap-2 px-5 py-4 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <ShoppingBag className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <h2 className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
              Order Summary
            </h2>
            <span 
              className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            >
              {cart?.itemCount} items
            </span>
          </div>

          <div className="p-5">
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {cart?.items.map((item) => (
                <li key={item.itemId} className="py-3 flex justify-between first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                      {item.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      Qty: {item.quantity}
                    </p>
                  </div>
                  <p className="font-medium text-sm font-mono" style={{ color: 'var(--foreground)' }}>
                    {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
                  </p>
                </li>
              ))}
            </ul>

            <div
              className="flex justify-between pt-4 mt-4 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="font-medium" style={{ color: 'var(--foreground)' }}>Total</span>
              <span className="font-semibold font-mono" style={{ color: 'var(--foreground)' }}>
                {formattedTotal}
              </span>
            </div>
          </div>
        </div>

        {/* Checkout form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <div 
            className="flex items-center gap-2 px-5 py-4 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <User className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
              Customer Information
            </span>
          </div>

          <div className="p-5 space-y-4">
            {/* Error message */}
            {error && (
              <div
                className="flex items-start gap-3 p-4 rounded-lg"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
                role="alert"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
                <p className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>
              </div>
            )}

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
                autoFocus
                className="w-full px-4 py-3 rounded-lg border text-sm transition-all"
                style={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                }}
              />
              <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                This name will appear on your order confirmation.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !customerName.trim()}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Place Order
                </>
              )}
            </button>
          </div>
        </form>

        {/* Notice */}
        <div 
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{ backgroundColor: 'var(--secondary)' }}
        >
          <Shield className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            This is a playground environment. No real payment is processed. Orders
            are persisted to PostgreSQL and survive BFF restarts.
          </p>
        </div>
      </div>
    </div>
  );
}
