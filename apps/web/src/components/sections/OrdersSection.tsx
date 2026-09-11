'use client';

/**
 * OrdersSection - list all persisted orders, look up by ID, view/manage one
 *
 * Merges the former /orders (list + lookup) and /orders/[orderId] (detail +
 * management) routes into one component with internal selection state —
 * there is no longer a route to carry the selected order id, so it lives
 * here instead.
 */

import { useState } from 'react';
import useSWR from 'swr';
import {
  Search,
  Package,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Database,
  ChefHat,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  expressoApi,
  Order,
  OrderStatus,
  OrdersResponse,
  ManageOrderInput,
  ExpressoApiError,
  formatMoney,
} from '@/lib/api/expresso-api';
import { PageLoadingState } from '@/components/system/LoadingSkeleton';
import { PageErrorState } from '@/components/system/ErrorBanner';

// Status badge config — combines the list page's and detail page's
// near-identical copies of this into one.
const statusConfig: Record<OrderStatus, { label: string; color: string; bgColor: string; icon: typeof Package }> = {
  pending: { label: 'Pending', color: 'var(--warning)', bgColor: 'rgba(245, 158, 11, 0.1)', icon: Clock },
  preparing: { label: 'Preparing', color: 'var(--info)', bgColor: 'rgba(59, 130, 246, 0.1)', icon: ChefHat },
  prepared: { label: 'Prepared', color: 'var(--success)', bgColor: 'rgba(34, 197, 94, 0.1)', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'var(--destructive)', bgColor: 'rgba(239, 68, 68, 0.1)', icon: XCircle },
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.pending;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
      style={{ backgroundColor: cfg.bgColor, color: cfg.color }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

interface OrdersListProps {
  onSelect: (orderId: string) => void;
}

function OrderRow({ order, onSelect }: { order: Order; onSelect: (orderId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(order.orderId)}
      className="w-full flex items-center justify-between p-4 transition-colors hover:opacity-90 text-left"
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
          {new Date(order.placedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-4 ml-4 shrink-0">
        <span className="text-sm font-semibold font-mono" style={{ color: 'var(--foreground)' }}>
          {formatMoney(order.total.amountMinor, order.total.currency)}
        </span>
        <ArrowRight className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
      </div>
    </button>
  );
}

function OrdersList({ onSelect }: OrdersListProps) {
  const { data, error, isLoading } = useSWR<OrdersResponse, Error>(
    'orders',
    () => expressoApi.getOrders(),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (isLoading) return <PageLoadingState message="Loading orders..." />;

  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }} role="alert">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--destructive)' }}>Could not load orders</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{error.message}</p>
        </div>
      </div>
    );
  }

  const orders = data?.items ?? [];

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--secondary)' }}>
          <Package className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
        </div>
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>No orders yet</p>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Orders will appear here after checkout</p>
      </div>
    );
  }

  return (
    <div>
      {orders.map((order) => (
        <OrderRow key={order.orderId} order={order} onSelect={onSelect} />
      ))}
    </div>
  );
}

function OrdersListView({ onSelect }: { onSelect: (orderId: string) => void }) {
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId.trim()) {
      setError('Please enter an order ID');
      return;
    }
    setError(null);
    onSelect(orderId.trim());
  }

  return (
    <div className="home-stage-section-inner max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>Orders</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Database className="h-3 w-3" style={{ color: 'var(--success)' }} />
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Persisted to PostgreSQL</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>All Orders</span>
          </div>
          <OrdersList onSelect={onSelect} />
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <Search className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Look Up Order</span>
          </div>
          <div className="p-4 space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }} role="alert">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
                <p className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="orderId" className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Order ID</label>
              <div className="relative">
                <input
                  type="text"
                  id="orderId"
                  value={orderId}
                  onChange={(e) => { setOrderId(e.target.value); setError(null); }}
                  placeholder="e.g., ord_001"
                  className="w-full px-4 py-3 pl-10 rounded-lg border text-sm font-mono transition-colors"
                  style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
              </div>
            </div>
            <button type="submit" className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              <span>Go to Order</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

async function fetchOrder(orderId: string): Promise<Order> {
  return expressoApi.getOrderById(orderId);
}

function OrderDetailView({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const { data: order, error, isLoading, mutate } = useSWR<Order, Error>(
    `order-${orderId}`,
    () => fetchOrder(orderId),
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return <div className="home-stage-section-inner"><PageLoadingState message="Loading order..." /></div>;
  }

  if (error || !order) {
    return (
      <div className="home-stage-section-inner">
        <PageErrorState
          title="Order not found"
          message={error ? `Could not find order ${orderId}. Verify the order ID and try again.` : 'The order could not be loaded.'}
          onRetry={() => mutate()}
        />
      </div>
    );
  }

  const status = statusConfig[order.status]!;
  const StatusIcon = status.icon;

  return (
    <div className="home-stage-section-inner max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors hover:opacity-80"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </button>

      {order.status === 'pending' && (
        <div className="flex items-center gap-3 p-4 rounded-lg mb-6" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }} role="alert">
          <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--success)' }} />
          <div>
            <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>Order placed successfully!</p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Your order has been received and is being processed.</p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Order Details</h1>
          <p className="font-mono text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{order.orderId}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: status.bgColor }}>
          <StatusIcon className="h-4 w-4" style={{ color: status.color }} />
          <span className="text-sm font-medium" style={{ color: status.color }}>{status.label}</span>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
          <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--foreground)' }}>Order Information</h2>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt style={{ color: 'var(--muted-foreground)' }}>Placed At</dt>
              <dd className="font-medium mt-0.5" style={{ color: 'var(--foreground)' }}>{new Date(order.placedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--muted-foreground)' }}>Last Updated</dt>
              <dd className="font-medium mt-0.5" style={{ color: 'var(--foreground)' }}>{new Date(order.updatedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--muted-foreground)' }}>Total</dt>
              <dd className="font-bold mt-0.5" style={{ color: 'var(--foreground)' }}>{formatMoney(order.total.amountMinor, order.total.currency)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
          <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--foreground)' }}>Order Items</h2>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {order.lines.map((line, i) => (
              <li key={i} className="py-3 flex justify-between">
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>{line.name}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {line.quantity} x {formatMoney(line.unitPrice.amountMinor, line.unitPrice.currency)}
                  </p>
                </div>
                <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                  {formatMoney(line.lineTotal.amountMinor, line.lineTotal.currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {order.status !== 'cancelled' && (
          <OrderManagePanel order={order} onUpdate={() => mutate()} />
        )}

        <p className="text-xs text-center" style={{ color: 'var(--muted-foreground)' }}>
          Orders are persisted to PostgreSQL and survive BFF restarts.
        </p>
      </div>
    </div>
  );
}

function OrderManagePanel({ order, onUpdate }: { order: Order; onUpdate: () => void }) {
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

  const actions: { label: string; input: ManageOrderInput; variant: 'primary' | 'secondary' | 'danger' }[] = [];

  if (order.status === 'pending') {
    actions.push({ label: 'Start Preparing', input: { action: 'update_status', nextStatus: 'preparing' }, variant: 'primary' });
    actions.push({ label: 'Cancel Order', input: { action: 'cancel', reason: 'User requested' }, variant: 'danger' });
  } else if (order.status === 'preparing') {
    actions.push({ label: 'Mark as Prepared', input: { action: 'mark_prepared' }, variant: 'primary' });
    actions.push({ label: 'Cancel Order', input: { action: 'cancel', reason: 'User requested' }, variant: 'danger' });
  }

  if (actions.length === 0) return null;

  const variantStyles = {
    primary: { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' },
    secondary: { backgroundColor: 'var(--secondary)', color: 'var(--foreground)' },
    danger: { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--destructive)' },
  };

  return (
    <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
      <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--foreground)' }}>Order Actions</h2>
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--destructive)' }} role="alert">
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
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : variant === 'danger' ? <XCircle className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs mt-4" style={{ color: 'var(--muted-foreground)' }}>
        These actions simulate order management operations. In a real system, these would be restricted to authorized staff.
      </p>
    </div>
  );
}

export function OrdersSection() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  if (selectedOrderId) {
    return <OrderDetailView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />;
  }
  return <OrdersListView onSelect={setSelectedOrderId} />;
}
