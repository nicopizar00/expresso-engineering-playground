"use client";

/**
 * LatestOrderCard - the signed-in user's newest order, with its hot/cold
 * state front and centre. The parent list already revalidates at the
 * soonest coolsAt, so the badge flips when the server says cold; the
 * countdown here is cosmetic.
 */

import { useEffect, useState } from "react";
import { Flame, Snowflake } from "lucide-react";
import { formatMoney, type Order } from "@/lib/api/expresso-api";

function useSecondTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function LatestOrderCard({
  order,
  onSelect,
}: {
  order: Order;
  onSelect: (orderId: string) => void;
}) {
  const hot = order.temperature === "hot";
  const now = useSecondTick(hot);
  const Icon = hot ? Flame : Snowflake;
  return (
    <button
      type="button"
      data-testid="latest-order-card"
      onClick={() => onSelect(order.orderId)}
      className="w-full text-left rounded-lg border p-4 mb-3 flex items-center gap-4"
      style={{
        borderColor: hot ? "var(--warning)" : "var(--border)",
        backgroundColor: hot ? "rgba(245, 158, 11, 0.08)" : "var(--card)",
      }}
    >
      <span
        data-testid="order-temperature"
        data-temperature={order.temperature}
        className="flex flex-col items-center justify-center w-16 h-16 rounded-lg shrink-0"
        style={{
          color: hot ? "var(--warning)" : "var(--info)",
          backgroundColor: hot
            ? "rgba(245, 158, 11, 0.15)"
            : "rgba(59, 130, 246, 0.1)",
        }}
      >
        <Icon className="h-7 w-7" />
        <span className="text-xs font-semibold mt-0.5">
          {hot ? "Hot" : "Cold"}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block text-xs uppercase tracking-wide"
          style={{ color: "var(--muted-foreground)" }}
        >
          Latest order
        </span>
        <span
          className="block font-mono text-sm font-medium"
          style={{ color: "var(--foreground)" }}
        >
          {order.orderId}
        </span>
        <span
          className="block text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          {new Date(order.placedAt).toLocaleString()}
          {hot &&
            ` · cools in ${formatRemaining(Date.parse(order.coolsAt) - now)}`}
        </span>
      </span>
      <span
        className="text-sm font-semibold font-mono"
        style={{ color: "var(--foreground)" }}
      >
        {formatMoney(order.total.amountMinor, order.total.currency)}
      </span>
    </button>
  );
}
