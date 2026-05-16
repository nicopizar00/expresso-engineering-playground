'use client';

/**
 * Orders Page — list all persisted orders and look up by ID.
 *
 * ## API Endpoints
 * GET /orders       → OrdersResponse  (list all)
 * GET /orders/:id   → Order           (lookup by ID, used by [orderId] page)
 *
 * Orders persist across BFF restarts (Prisma/PostgreSQL). The list here
 * reflects real database state, not in-memory data.
 *
 * TODO(k6): GET /orders will be exercised by k6 list scenarios.
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

// ---------------------------------------------------------------------------
// Status badge config — aligned with BFF OrderStatus
// ---------------------------------------------------------------------------

const statusConfig: Record<OrderStatus, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: 'Pending', color: 'var(--warning)', icon: Clock },
  preparing: { label: 'Preparing', color: 'var(--info, #3b82f6)', icon: Package },
  prepared: { label: 'Prepared', color: 'var(--success)', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'var(--destructive)', icon: XCircle },
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.pending;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${cfg.color} 15%, transparent)`,
        color: cfg.color,
      }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Orders list
// ---------------------------------------------------------------------------

function OrderRow({ order }: { order: Order }) {
  return (
    <li>
      <Link
        href={`/orders/${order.orderId}`}
        className="flex items-center justify-between px-4 py-3 hover:opacity-80 transition-opacity"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            {order.orderId}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>
            {order.customerName} · {new Date(order.placedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <OrderStatusBadge status={order.status} />
          <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {formatMoney(order.total.amountMinor, order.total.currency)}
          </span>
          <ArrowRight className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
        </div>
      </Link>
    </li>
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
        className="flex items-start gap-2 p-3 rounded-md"
        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--destructive)' }}
        role="alert"
      >
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <p className="text-sm">Could not load orders: {error.message}</p>
      </div>
    );
  }

  const orders = data?.items ?? [];

  if (orders.length === 0) {
    return (
      <p className="text-sm py-4 text-center" style={{ color: 'var(--muted-foreground)' }}>
        No orders yet. Place an order via checkout to see it here.
      </p>
    );
  }

  return (
    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {orders.map((order) => (
        <OrderRow key={order.orderId} order={order} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
    <div className="container py-8 max-w-2xl">
      <h1
        className="text-3xl font-bold tracking-tight mb-2"
        style={{ color: 'var(--foreground)' }}
      >
        Orders
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--muted-foreground)' }}>
        Orders are persisted to PostgreSQL and survive BFF restarts.
      </p>

      {/* Orders list */}
      <div
        className="rounded-lg border mb-8"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
            All Orders
          </h2>
        </div>
        <div className="px-0 py-0">
          <OrdersList />
        </div>
      </div>

      {/* Lookup form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border p-6"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Package className="h-5 w-5" style={{ color: 'var(--primary)' }} />
          <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>
            Look Up by Order ID
          </h2>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 p-3 rounded-md mb-4"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--destructive)' }}
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
                onChange={(e) => { setOrderId(e.target.value); setError(null); }}
                placeholder="e.g., ord_001"
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
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-md text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <span>Go to Order</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
