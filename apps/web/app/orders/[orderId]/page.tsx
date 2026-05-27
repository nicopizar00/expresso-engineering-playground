'use client';

/**
 * Order Detail Page - View and manage a specific order
 *
 * Displays order information, items, and management actions.
 * Redesigned with a clean, modern interface.
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
  User,
  Calendar,
  ChefHat,
  Database,
  Coffee,
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

const statusConfig: Record<
  OrderStatus,
  { icon: typeof Package; color: string; bgColor: string; label: string }
> = {
  pending: {
    icon: Clock,
    color: 'var(--warning)',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    label: 'Pending',
  },
  preparing: {
    icon: ChefHat,
    color: 'var(--info)',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    label: 'Preparing',
  },
  prepared: {
    icon: CheckCircle,
    color: 'var(--success)',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    label: 'Prepared',
  },
  cancelled: {
    icon: XCircle,
    color: 'var(--destructive)',
    bgColor: 'rgba(239, 68, 68, 0.1)',
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

  if (error || !order) {
    return (
      <div className="container py-8">
        <PageErrorState
          title="Order not found"
          message={`Could not find order ${orderId}. Verify the order ID and try again.`}
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
        href="/orders"
        className="inline-flex items-center gap-2 text-sm font-medium mb-6 transition-colors"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        All Orders
      </Link>

      {/* Success banner for fresh orders */}
      {order.status === 'pending' && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl mb-6"
          style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}
          role="alert"
        >
          <CheckCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--success)' }} />
          <div>
            <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
              Order placed successfully
            </p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Your order has been received and is being processed.
            </p>
          </div>
        </div>
      )}

      {/* Order header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ color: 'var(--foreground)' }}
            >
              Order Details
            </h1>
            <p className="font-mono text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {order.orderId}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ backgroundColor: status.bgColor }}
        >
          <StatusIcon className="h-4 w-4" style={{ color: status.color }} />
          <span className="text-sm font-medium" style={{ color: status.color }}>
            {status.label}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Order info */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          <div 
            className="px-5 py-4 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Order Information
            </span>
          </div>

          <div className="p-5">
            <dl className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 mt-1 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <div>
                  <dt className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Customer</dt>
                  <dd className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                    {order.customerName}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 mt-1 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <div>
                  <dt className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Placed At</dt>
                  <dd className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                    {new Date(order.placedAt).toLocaleString()}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <RefreshCw className="h-4 w-4 mt-1 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <div>
                  <dt className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Last Updated</dt>
                  <dd className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                    {new Date(order.updatedAt).toLocaleString()}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Package className="h-4 w-4 mt-1 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <div>
                  <dt className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Total</dt>
                  <dd className="font-semibold text-sm font-mono" style={{ color: 'var(--foreground)' }}>
                    {formatMoney(order.total.amountMinor, order.total.currency)}
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </div>

        {/* Order items */}
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
              Order Items
            </span>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {order.lines.length} items
            </span>
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {order.lines.map((line, i) => (
              <div key={i} className="p-5 flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'var(--secondary)' }}
                >
                  <Coffee className="h-5 w-5" style={{ color: 'var(--muted-foreground)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                    {line.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {line.quantity} x {formatMoney(line.unitPrice.amountMinor, line.unitPrice.currency)}
                  </p>
                </div>
                <p className="font-medium text-sm font-mono shrink-0" style={{ color: 'var(--foreground)' }}>
                  {formatMoney(line.lineTotal.amountMinor, line.lineTotal.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Order management */}
        {order.status !== 'cancelled' && (
          <OrderManagePanel order={order} onUpdate={() => mutate()} />
        )}

        {/* Notice */}
        <div 
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{ backgroundColor: 'var(--secondary)' }}
        >
          <Database className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Orders are persisted to PostgreSQL and survive BFF restarts.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Order management panel with status transition actions
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
    icon: typeof Package;
  }[] = [];

  if (order.status === 'pending') {
    actions.push({
      label: 'Start Preparing',
      input: { action: 'update_status', nextStatus: 'preparing' },
      variant: 'primary',
      icon: ChefHat,
    });
    actions.push({
      label: 'Cancel Order',
      input: { action: 'cancel', reason: 'User requested' },
      variant: 'danger',
      icon: XCircle,
    });
  } else if (order.status === 'preparing') {
    actions.push({
      label: 'Mark as Prepared',
      input: { action: 'mark_prepared' },
      variant: 'primary',
      icon: CheckCircle,
    });
    actions.push({
      label: 'Cancel Order',
      input: { action: 'cancel', reason: 'User requested' },
      variant: 'danger',
      icon: XCircle,
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
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      <div 
        className="px-5 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          Order Actions
        </span>
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
            }}
            role="alert"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
            <p className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {actions.map(({ label, input, variant, icon: Icon }) => (
            <button
              key={label}
              onClick={() => handleAction(input)}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={variantStyles[variant]}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {label}
            </button>
          ))}
        </div>

        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          These actions simulate order management operations. In a real system, these
          would be restricted to authorized staff.
        </p>
      </div>
    </div>
  );
}
