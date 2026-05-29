'use client';

/**
 * Orders Page - List all persisted orders and look up by ID
 *
 * Orders persist across BFF restarts (PostgreSQL).
 * Redesigned with a clean, modern interface.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  Search,
  Package,
  ArrowRight,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Database,
  ChefHat,
} from 'lucide-react';
import Link from 'next/link';
import {
  expressoApi,
  Order,
  OrderStatus,
  OrdersResponse,
  formatMoney,
} from '@/lib/api/expresso-api';
import { PageLoadingState } from '@/components/system/LoadingSkeleton';

// Status badge config
const statusConfig: Record<OrderStatus, { label: string; color: string; bgColor: string; icon: typeof Package }> = {
  pending: { 
    label: 'Pending', 
    color: 'var(--warning)', 
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: Clock 
  },
  preparing: { 
    label: 'Preparing', 
    color: 'var(--info)', 
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: ChefHat 
  },
  prepared: { 
    label: 'Prepared', 
    color: 'var(--success)', 
    bgColor: 'rgba(34, 197, 94, 0.1)',
    icon: CheckCircle 
  },
  cancelled: { 
    label: 'Cancelled', 
    color: 'var(--destructive)', 
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle 
  },
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.pending;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
      style={{
        backgroundColor: cfg.bgColor,
        color: cfg.color,
      }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// Orders list row
function OrderRow({ order }: { order: Order }) {
  return (
    <Link
      href={`/orders/${order.orderId}`}
      className="flex items-center justify-between p-4 transition-colors hover:opacity-90"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-mono text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            {order.orderId}
          </p>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
          {order.customerName} - {new Date(order.placedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-4 ml-4 shrink-0">
        <span className="text-sm font-semibold font-mono" style={{ color: 'var(--foreground)' }}>
          {formatMoney(order.total.amountMinor, order.total.currency)}
        </span>
        <ArrowRight className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
      </div>
    </Link>
  );
}

function OrdersList() {
  const { data, error, isLoading } = useSWR<OrdersResponse, Error>(
    'orders',
    () => expressoApi.getOrders(),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  if (isLoading) return <PageLoadingState message="Loading orders..." />;

  if (error) {
    return (
      <div
        className="flex items-start gap-3 p-4 rounded-lg"
        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
        role="alert"
      >
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--destructive)' }}>
            Could not load orders
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  const orders = data?.items ?? [];

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--secondary)' }}
        >
          <Package className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
        </div>
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>
          No orders yet
        </p>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Orders will appear here after checkout
        </p>
      </div>
    );
  }

  return (
    <div>
      {orders.map((order) => (
        <OrderRow key={order.orderId} order={order} />
      ))}
    </div>
  );
}

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
    <div className="container py-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--foreground)' }}
          >
            Orders
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Database className="h-3 w-3" style={{ color: 'var(--success)' }} />
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Persisted to PostgreSQL
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Orders list */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div 
            className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              All Orders
            </span>
          </div>
          <OrdersList />
        </div>

        {/* Lookup form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div 
            className="px-4 py-3 border-b flex items-center gap-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <Search className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Look Up Order
            </span>
          </div>

          <div className="p-4 space-y-4">
            {error && (
              <div
                className="flex items-start gap-2 p-3 rounded-lg"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                role="alert"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
                <p className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>
              </div>
            )}

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
                  onChange={(e) => { setOrderId(e.target.value); setError(null); }}
                  placeholder="e.g., ord_001"
                  className="w-full px-4 py-3 pl-10 rounded-lg border text-sm font-mono transition-colors"
                  style={{
                    backgroundColor: 'var(--background)',
                    borderColor: 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                />
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: 'var(--muted-foreground)' }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <span>Go to Order</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
