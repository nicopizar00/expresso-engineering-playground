'use client';

/**
 * Order Detail Page - View and manage a specific order
 *
 * Displays order information, items, and management actions.
 *
 * ## API Endpoints
 * GET  /orders/:id        → Order
 * POST /orders/:id/manage → ManageOrderResponse
 *
 * Verified against: apps/bff/src/modules/orders/orders.controller.ts
 */

import { use, useState } from 'react';
import useSWR from 'swr';
import {
  Package,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  expressoApi,
  Order,
  OrderStatus,
  ManageOrderInput,
  ExpressoApiError,
  formatMoney,
} from '@/lib/api/expresso-api';
import { PageLoadingState } from '@/components/system/LoadingSkeleton';
import { PageErrorState } from '@/components/system/ErrorBanner';
import Link from 'next/link';

interface OrderPageProps {
  params: Promise<{ orderId: string }>;
}

async function fetchOrder(orderId: string): Promise<Order> {
  return expressoApi.getOrderById(orderId);
}

/**
 * Visual configuration for order statuses.
 * Aligns with OrderStatus type from BFF orders.types.ts.
 */
const statusConfig: Record<
  OrderStatus,
  { icon: typeof Package; color: string; bg: string; label: string }
> = {
  pending: {
    icon: Clock,
    color: 'var(--warning)',
    bg: 'rgba(245, 158, 11, 0.1)',
    label: 'Pending',
  },
  preparing: {
    icon: Package,
    color: 'var(--info)',
    bg: 'rgba(59, 130, 246, 0.1)',
    label: 'Preparing',
  },
  prepared: {
    icon: CheckCircle,
    color: 'var(--success)',
    bg: 'rgba(34, 197, 94, 0.1)',
    label: 'Prepared',
  },
  cancelled: {
    icon: XCircle,
    color: 'var(--destructive)',
    bg: 'rgba(239, 68, 68, 0.1)',
    label: 'Cancelled',
  },
};

export default function OrderPage({ params }: OrderPageProps) {
  const { orderId } = use(params);
  const {
    data: order,
    error,
    isLoading,
    mutate,
  } = useSWR<Order, Error>(`order-${orderId}`, () => fetchOrder(orderId), {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <div className="container py-8">
        <PageLoadingState message="Loading order..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-8">
        <PageErrorState
          title="Order not found"
          message={`Could not find order ${orderId}. Orders reset when the BFF restarts (in-memory storage).`}
          onRetry={() => mutate()}
        />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container py-8">
        <PageErrorState
          title="Order not found"
          message="The order could not be loaded."
          onRetry={() => mutate()}
        />
      </div>
    );
  }

  const status = statusConfig[order.status]!;
  const StatusIcon = status.icon;

  return (
    <div className="container py-8 max-w-2xl">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors hover:opacity-80"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Continue shopping
      </Link>

      {/* Success banner for fresh orders */}
      {order.status === 'pending' && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg mb-6"
          style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
          role="alert"
        >
          <CheckCircle
            className="h-5 w-5 flex-shrink-0"
            style={{ color: 'var(--success)' }}
          />
          <div>
            <p
              className="font-medium text-sm"
              style={{ color: 'var(--foreground)' }}
            >
              Order placed successfully!
            </p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Your order has been received and is being processed.
            </p>
          </div>
        </div>
      )}

      {/* Order header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--foreground)' }}
          >
            Order Details
          </h1>
          <p
            className="font-mono text-sm mt-1"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {order.orderId}
          </p>
        </div>

        {/* Status badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ backgroundColor: status.bg }}
        >
          <StatusIcon className="h-4 w-4" style={{ color: status.color }} />
          <span className="text-sm font-medium" style={{ color: status.color }}>
            {status.label}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Order info card */}
        <div
          className="rounded-lg border p-6"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <h2
            className="font-semibold text-lg mb-4"
            style={{ color: 'var(--foreground)' }}
          >
            Order Information
          </h2>

          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt style={{ color: 'var(--muted-foreground)' }}>Customer</dt>
              <dd
                className="font-medium mt-0.5"
                style={{ color: 'var(--foreground)' }}
              >
                {order.customerName}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--muted-foreground)' }}>Placed At</dt>
              <dd
                className="font-medium mt-0.5"
                style={{ color: 'var(--foreground)' }}
              >
                {new Date(order.placedAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--muted-foreground)' }}>Last Updated</dt>
              <dd
                className="font-medium mt-0.5"
                style={{ color: 'var(--foreground)' }}
              >
                {new Date(order.updatedAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--muted-foreground)' }}>Total</dt>
              <dd
                className="font-bold mt-0.5"
                style={{ color: 'var(--foreground)' }}
              >
                {formatMoney(order.total.amountMinor, order.total.currency)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Order lines */}
        <div
          className="rounded-lg border p-6"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <h2
            className="font-semibold text-lg mb-4"
            style={{ color: 'var(--foreground)' }}
          >
            Order Items
          </h2>

          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {order.lines.map((line, i) => (
              <li key={i} className="py-3 flex justify-between">
                <div>
                  <p
                    className="font-medium text-sm"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {line.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {line.quantity} x{' '}
                    {formatMoney(line.unitPrice.amountMinor, line.unitPrice.currency)}
                  </p>
                </div>
                <p
                  className="font-medium text-sm"
                  style={{ color: 'var(--foreground)' }}
                >
                  {formatMoney(line.lineTotal.amountMinor, line.lineTotal.currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Order management */}
        {order.status !== 'cancelled' && (
          <OrderManagePanel order={order} onUpdate={() => mutate()} />
        )}

        {/* Notice */}
        <p
          className="text-xs text-center"
          style={{ color: 'var(--muted-foreground)' }}
        >
          Orders reset when the BFF restarts (in-memory storage).
        </p>
      </div>
    </div>
  );
}

/**
 * Order management panel with status transition actions.
 *
 * Available actions depend on current order status:
 * - pending → preparing, cancelled
 * - preparing → prepared, cancelled
 * - prepared → (no actions)
 * - cancelled → (no actions)
 *
 * TODO(api-wire): These actions would be restricted to staff in a real system
 */
function OrderManagePanel({
  order,
  onUpdate,
}: {
  order: Order;
  onUpdate: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(input: ManageOrderInput) {
    setIsLoading(true);
    setError(null);

    try {
      await expressoApi.manageOrder(order.orderId, input);
      onUpdate();
    } catch (err) {
      if (err instanceof ExpressoApiError) {
        setError(`Action failed: ${err.message}`);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  const actions: {
    label: string;
    input: ManageOrderInput;
    variant: 'primary' | 'secondary' | 'danger';
  }[] = [];

  if (order.status === 'pending') {
    actions.push({
      label: 'Start Preparing',
      input: { action: 'update_status', nextStatus: 'preparing' },
      variant: 'primary',
    });
    actions.push({
      label: 'Cancel Order',
      input: { action: 'cancel', reason: 'User requested' },
      variant: 'danger',
    });
  } else if (order.status === 'preparing') {
    actions.push({
      label: 'Mark as Prepared',
      input: { action: 'mark_prepared' },
      variant: 'primary',
    });
    actions.push({
      label: 'Cancel Order',
      input: { action: 'cancel', reason: 'User requested' },
      variant: 'danger',
    });
  }

  if (actions.length === 0) return null;

  const variantStyles = {
    primary: {
      backgroundColor: 'var(--primary)',
      color: 'var(--primary-foreground)',
    },
    secondary: {
      backgroundColor: 'var(--secondary)',
      color: 'var(--foreground)',
    },
    danger: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      color: 'var(--destructive)',
    },
  };

  return (
    <div
      className="rounded-lg border p-6"
      style={{
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      <h2
        className="font-semibold text-lg mb-4"
        style={{ color: 'var(--foreground)' }}
      >
        Order Actions
      </h2>

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

      <div className="flex flex-wrap gap-3">
        {actions.map(({ label, input, variant }) => (
          <button
            key={label}
            onClick={() => handleAction(input)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            style={variantStyles[variant]}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : variant === 'danger' ? (
              <XCircle className="h-4 w-4" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs mt-4" style={{ color: 'var(--muted-foreground)' }}>
        These actions simulate order management operations. In a real system, these
        would be restricted to authorized staff.
      </p>
    </div>
  );
}
