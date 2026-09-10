'use client';

/**
 * Checkout Page - Order placement flow
 *
 * Standalone destination for direct links/bookmarks. Cart summary and
 * submit logic live in CartCheckoutPanel, shared with the homepage's
 * always-visible sidebar (see apps/web/app/page.tsx).
 */

import { ArrowLeft, CreditCard, Shield } from 'lucide-react';
import Link from 'next/link';
import { useCart } from '@/components/cart/CartProvider';
import { CartCheckoutPanel } from '@/components/cart/CartCheckoutPanel';
import { EmptyState } from '@/components/system/EmptyState';
import { PageLoadingState } from '@/components/system/LoadingSkeleton';

export default function CheckoutPage() {
  const { isLoading, isEmpty } = useCart();

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
      <Link
        href="/cart"
        className="inline-flex items-center gap-2 text-sm font-medium mb-6 transition-colors"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cart
      </Link>

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
        <CartCheckoutPanel variant="page" />

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
