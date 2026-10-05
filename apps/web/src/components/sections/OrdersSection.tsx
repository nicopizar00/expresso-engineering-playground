"use client";

/**
 * OrdersSection - My orders / All orders lists and a read-only order detail
 *
 * Placing an order is the final step; there are no order actions. Hot/Cold
 * is the only state an order shows, and both the lists and the detail flip
 * it at coolsAt without polling. The parent (page.tsx) owns the selected
 * order id and list scope so they survive this component remounting on section switches.
 */

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import {
  Package,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Database,
  Flame,
  Snowflake,
} from "lucide-react";
import {
  expressoApi,
  Order,
  OrderStatusResponse,
  OrderTemperature,
  OrdersResponse,
  formatMoney,
} from "@/lib/api/expresso-api";
import { PageLoadingState } from "@/components/system/LoadingSkeleton";
import { PageErrorState } from "@/components/system/ErrorBanner";

// Hot for the cool-down window after the order is served (placed), then
// cold — derived by the BFF from placedAt.
const temperatureConfig: Record<
  OrderTemperature,
  { label: string; color: string; bgColor: string; icon: typeof Package }
> = {
  hot: {
    label: "Hot",
    color: "var(--warning)",
    bgColor: "rgba(245, 158, 11, 0.1)",
    icon: Flame,
  },
  cold: {
    label: "Cold",
    color: "var(--info)",
    bgColor: "rgba(59, 130, 246, 0.1)",
    icon: Snowflake,
  },
};

function OrderTemperatureBadge({
  temperature,
}: {
  temperature: OrderTemperature;
}) {
  const cfg = temperatureConfig[temperature] ?? temperatureConfig.cold;
  const Icon = cfg.icon;
  return (
    <span
      data-testid="order-temperature"
      data-temperature={temperature}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
      style={{ backgroundColor: cfg.bgColor, color: cfg.color }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function OrderRow({
  order,
  onSelect,
}: {
  order: Order;
  onSelect: (orderId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(order.orderId)}
      className="w-full flex items-center justify-between p-4 transition-colors hover:opacity-90 text-left"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <p
            className="font-mono text-sm font-medium"
            style={{ color: "var(--foreground)" }}
          >
            {order.orderId}
          </p>
          <OrderTemperatureBadge temperature={order.temperature} />
        </div>
        <p
          className="text-xs truncate"
          style={{ color: "var(--muted-foreground)" }}
        >
          {new Date(order.placedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-4 ml-4 shrink-0">
        <span
          className="text-sm font-semibold font-mono"
          style={{ color: "var(--foreground)" }}
        >
          {formatMoney(order.total.amountMinor, order.total.currency)}
        </span>
        <ArrowRight
          className="h-4 w-4"
          style={{ color: "var(--muted-foreground)" }}
        />
      </div>
    </button>
  );
}

export type OrdersScope = "mine" | "all";

const scopeConfig: Record<
  OrdersScope,
  {
    label: string;
    swrKey: string;
    fetch: () => Promise<OrdersResponse>;
    emptyTitle: string;
    emptyHint: string;
  }
> = {
  mine: {
    label: "My orders",
    swrKey: "orders-mine",
    fetch: () => expressoApi.getMyOrders(),
    emptyTitle: "You have not placed any orders yet",
    emptyHint: "Place an order from the catalog to see it here",
  },
  all: {
    label: "All orders",
    swrKey: "orders",
    fetch: () => expressoApi.getOrders(),
    emptyTitle: "No orders yet",
    emptyHint: "Orders will appear here after checkout",
  },
};

// Floor on the delay: if the browser clock runs ahead of the server, the
// server may still say "hot" at our coolsAt. Each revalidation attempt
// re-arms the timer, so we retry at most once per second while the server
// still says hot — never a tight loop, never stuck.
const MIN_COOL_REFRESH_MS = 1000;

// One timer at the soonest hot order's coolsAt flips list badges to Cold
// without polling (same pattern as the detail view).
function useRevalidateAtCoolDown(
  orders: ReadonlyArray<Order> | undefined,
  revalidate: () => void,
  attempt: number,
) {
  useEffect(() => {
    const hotCoolsAt = (orders ?? [])
      .filter((o) => o.temperature === "hot")
      .map((o) => Date.parse(o.coolsAt));
    if (hotCoolsAt.length === 0) return;
    const delay = Math.max(
      MIN_COOL_REFRESH_MS,
      Math.min(...hotCoolsAt) - Date.now() + 250,
    );
    const timer = setTimeout(revalidate, delay);
    return () => clearTimeout(timer);
  }, [orders, revalidate, attempt]);
}

function OrdersList({
  scope,
  onSelect,
}: {
  scope: OrdersScope;
  onSelect: (orderId: string) => void;
}) {
  const cfg = scopeConfig[scope];
  const { data, error, isLoading, mutate } = useSWR<OrdersResponse, Error>(
    cfg.swrKey,
    cfg.fetch,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  // Counts revalidation attempts so the cool-down timer re-arms even when
  // the refetch returns an unchanged (still hot) response.
  const [attempt, setAttempt] = useState(0);
  const revalidate = useCallback(() => {
    void mutate().finally(() => setAttempt((n) => n + 1));
  }, [mutate]);
  useRevalidateAtCoolDown(data?.items, revalidate, attempt);

  if (isLoading) return <PageLoadingState message="Loading orders..." />;

  if (error) {
    return (
      <div
        className="flex items-start gap-3 p-4 rounded-lg"
        style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
        role="alert"
      >
        <AlertTriangle
          className="h-4 w-4 mt-0.5 shrink-0"
          style={{ color: "var(--destructive)" }}
        />
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--destructive)" }}
          >
            Could not load orders
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
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
          style={{ backgroundColor: "var(--secondary)" }}
        >
          <Package
            className="h-6 w-6"
            style={{ color: "var(--muted-foreground)" }}
          />
        </div>
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--foreground)" }}
        >
          {cfg.emptyTitle}
        </p>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {cfg.emptyHint}
        </p>
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

function OrdersListView({
  scope,
  onScopeChange,
  onSelect,
}: {
  scope: OrdersScope;
  onScopeChange: (scope: OrdersScope) => void;
  onSelect: (orderId: string) => void;
}) {
  // The scope is owned by the parent so Back returns to the tab the user
  // came from instead of resetting to "My orders" on remount.

  return (
    <div className="home-stage-section-inner max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            Orders
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Database className="h-3 w-3" style={{ color: "var(--success)" }} />
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Persisted to PostgreSQL
            </p>
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          role="tablist"
          aria-label="Order scope"
          className="px-2 py-2 border-b flex items-center gap-1"
          style={{ borderColor: "var(--border)" }}
        >
          {(Object.keys(scopeConfig) as OrdersScope[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              onClick={() => onScopeChange(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                scope === key ? "tone-primary" : "tone-muted"
              }`}
            >
              {scopeConfig[key].label}
            </button>
          ))}
        </div>
        <div data-testid="orders-list" data-scope={scope} role="tabpanel">
          <OrdersList key={scope} scope={scope} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}

async function fetchOrder(orderId: string): Promise<Order> {
  return expressoApi.getOrderById(orderId);
}

function OrderDetailView({
  orderId,
  justPlaced,
  onBack,
}: {
  orderId: string;
  justPlaced: boolean;
  onBack: () => void;
}) {
  const {
    data: order,
    error,
    isLoading,
    mutate,
  } = useSWR<Order, Error>(`order-${orderId}`, () => fetchOrder(orderId), {
    revalidateOnFocus: false,
  });
  const { data: orderStatus, mutate: refreshStatus } = useSWR<
    OrderStatusResponse,
    Error
  >(`order-status-${orderId}`, () => expressoApi.getOrderStatus(orderId), {
    revalidateOnFocus: false,
    // A failed refetch at coolsAt must not leave the badge stuck on "Hot".
    errorRetryInterval: 1000,
    errorRetryCount: 5,
  });

  // One timer at coolsAt flips the badge live; no polling. The delay is
  // measured on the server's clock (coolsAt - checkedAt), so a skewed
  // browser clock neither delays the flip nor causes refetch loops.
  useEffect(() => {
    if (!orderStatus || orderStatus.temperature === "cold") return;
    const remaining =
      Date.parse(orderStatus.coolsAt) - Date.parse(orderStatus.checkedAt);
    const timer = setTimeout(
      () => void refreshStatus(),
      Math.max(0, remaining) + 250,
    );
    return () => clearTimeout(timer);
  }, [orderStatus, refreshStatus]);

  if (isLoading) {
    return (
      <div className="home-stage-section-inner">
        <PageLoadingState message="Loading order..." />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="home-stage-section-inner">
        <PageErrorState
          title="Order not found"
          message={
            error
              ? `Could not find order ${orderId}. Verify the order ID and try again.`
              : "The order could not be loaded."
          }
          onRetry={() => mutate()}
        />
      </div>
    );
  }

  return (
    <div className="home-stage-section-inner max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors hover:opacity-80"
        style={{ color: "var(--muted-foreground)" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </button>

      {justPlaced && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg mb-6"
          style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}
          role="alert"
        >
          <CheckCircle
            className="h-5 w-5 flex-shrink-0"
            style={{ color: "var(--success)" }}
          />
          <div>
            <p
              className="font-medium text-sm"
              style={{ color: "var(--foreground)" }}
            >
              Order placed successfully!
            </p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Your coffee is on its way — enjoy it while it is hot.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            Order Details
          </h1>
          <p
            className="font-mono text-sm mt-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            {order.orderId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OrderTemperatureBadge
            temperature={orderStatus?.temperature ?? order.temperature}
          />
        </div>
      </div>

      <div className="space-y-6">
        <div
          className="rounded-lg border p-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <h2
            className="font-semibold text-lg mb-4"
            style={{ color: "var(--foreground)" }}
          >
            Order Information
          </h2>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt style={{ color: "var(--muted-foreground)" }}>Placed At</dt>
              <dd
                className="font-medium mt-0.5"
                style={{ color: "var(--foreground)" }}
              >
                {new Date(order.placedAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--muted-foreground)" }}>Last Updated</dt>
              <dd
                className="font-medium mt-0.5"
                style={{ color: "var(--foreground)" }}
              >
                {new Date(order.updatedAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--muted-foreground)" }}>Total</dt>
              <dd
                className="font-bold mt-0.5"
                style={{ color: "var(--foreground)" }}
              >
                {formatMoney(order.total.amountMinor, order.total.currency)}
              </dd>
            </div>
          </dl>
        </div>

        <div
          className="rounded-lg border p-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <h2
            className="font-semibold text-lg mb-4"
            style={{ color: "var(--foreground)" }}
          >
            Order Items
          </h2>
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {order.lines.map((line, i) => (
              <li key={i} className="py-3 flex justify-between">
                <div>
                  <p
                    className="font-medium text-sm"
                    style={{ color: "var(--foreground)" }}
                  >
                    {line.name}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {line.quantity} x{" "}
                    {formatMoney(
                      line.unitPrice.amountMinor,
                      line.unitPrice.currency,
                    )}
                  </p>
                </div>
                <p
                  className="font-medium text-sm"
                  style={{ color: "var(--foreground)" }}
                >
                  {formatMoney(
                    line.lineTotal.amountMinor,
                    line.lineTotal.currency,
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <p
          className="text-xs text-center"
          style={{ color: "var(--muted-foreground)" }}
        >
          Orders are persisted to PostgreSQL and survive BFF restarts.
        </p>
      </div>
    </div>
  );
}

export function OrdersSection({
  selectedOrderId,
  placedOrderId,
  scope,
  onScopeChange,
  onSelect,
  onBack,
}: {
  selectedOrderId: string | null;
  // The order this browser just placed; its detail shows the success banner.
  placedOrderId: string | null;
  scope: OrdersScope;
  onScopeChange: (scope: OrdersScope) => void;
  onSelect: (orderId: string) => void;
  onBack: () => void;
}) {
  if (selectedOrderId) {
    return (
      <OrderDetailView
        orderId={selectedOrderId}
        justPlaced={selectedOrderId === placedOrderId}
        onBack={onBack}
      />
    );
  }
  return (
    <OrdersListView
      scope={scope}
      onScopeChange={onScopeChange}
      onSelect={onSelect}
    />
  );
}
