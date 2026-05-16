'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Package, ArrowRight, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/system/EmptyState';

export default function OrdersPage() {
  const router = useRouter();
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId.trim()) {
      setError('Please enter an order ID');
      return;
    }
    setError(null);
    router.push(`/orders/${orderId.trim()}`);
  }

  return (
    <div className="container py-8 max-w-xl">
      <h1 
        className="text-3xl font-bold tracking-tight mb-2"
        style={{ color: 'var(--foreground)' }}
      >
        Order Lookup
      </h1>
      <p 
        className="text-lg mb-8"
        style={{ color: 'var(--muted-foreground)' }}
      >
        Enter your order ID to view order details and status.
      </p>

      {/* Search form */}
      <form 
        onSubmit={handleSubmit}
        className="rounded-lg border p-6"
        style={{ 
          backgroundColor: 'var(--card)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Package className="h-5 w-5" style={{ color: 'var(--primary)' }} />
          <h2 
            className="font-semibold text-lg"
            style={{ color: 'var(--foreground)' }}
          >
            Find Your Order
          </h2>
        </div>

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
              htmlFor="orderId"
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              Order ID
            </label>
            <div className="relative">
              <input
                type="text"
                id="orderId"
                value={orderId}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., ord_abc123"
                className="w-full px-3 py-2 pl-10 rounded-md border text-sm transition-colors focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                }}
              />
              <Search 
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" 
                style={{ color: 'var(--muted-foreground)' }}
              />
            </div>
            <p 
              className="text-xs mt-1"
              style={{ color: 'var(--muted-foreground)' }}
            >
              You receive your order ID after completing checkout.
            </p>
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            <span>Look Up Order</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Info section */}
      <div className="mt-8">
        <EmptyState 
          variant="orders"
          title="No order list available"
          description="This playground does not have a GET /orders endpoint. You must look up orders by their ID. Orders are stored in memory and reset when the BFF restarts."
        />
      </div>
    </div>
  );
}
