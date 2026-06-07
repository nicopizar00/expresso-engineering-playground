"use client";

import Link from "next/link";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";

interface InlineCartSummaryProps {
  /**
   * 'card'  — compact card meant for the right rail on desktop. Always visible.
   * 'sticky'— fixed bottom bar for mobile. Renders null when the cart is empty.
   */
  variant?: "card" | "sticky";
  className?: string;
}

export function InlineCartSummary({
  variant = "card",
  className,
}: InlineCartSummaryProps) {
  const { itemCount, formattedTotal, openCartDrawer, isEmpty } = useCart();

  if (variant === "sticky" && isEmpty) {
    return null;
  }

  const isSticky = variant === "sticky";

  return (
    <div
      className={[
        isSticky
          ? "fixed inset-x-0 bottom-0 z-40 border-t shadow-lg backdrop-blur"
          : "rounded-lg border",
        className ?? "",
      ].join(" ")}
      style={{
        backgroundColor: isSticky
          ? "color-mix(in srgb, var(--card) 92%, transparent)"
          : "var(--card)",
        borderColor: "var(--border)",
        paddingBottom: isSticky ? "env(safe-area-inset-bottom)" : undefined,
      }}
      role="region"
      aria-label="Cart summary"
      data-testid="inline-cart-summary"
    >
      <div
        className={
          isSticky
            ? "container flex items-center justify-between gap-3 py-2"
            : "flex items-center justify-between gap-3 p-3"
        }
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="relative flex items-center justify-center w-8 h-8 rounded-md shrink-0"
            style={{
              backgroundColor: "var(--secondary)",
              color: "var(--foreground)",
            }}
          >
            <ShoppingCart className="h-4 w-4" />
            {itemCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-semibold rounded-full"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
                data-testid="inline-cart-count"
              >
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] leading-none uppercase tracking-wide"
              style={{ color: "var(--muted-foreground)" }}
            >
              {isEmpty
                ? "Cart empty"
                : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
            </p>
            <p
              className="text-sm font-mono font-semibold mt-1 truncate"
              style={{ color: "var(--foreground)" }}
              data-testid="inline-cart-total"
            >
              {formattedTotal}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openCartDrawer}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: "var(--secondary)",
              color: "var(--foreground)",
            }}
            data-testid="inline-cart-view"
          >
            View
          </button>
          <Link
            href="/checkout"
            aria-disabled={isEmpty}
            tabIndex={isEmpty ? -1 : 0}
            onClick={(e) => {
              if (isEmpty) e.preventDefault();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: isEmpty
                ? "color-mix(in srgb, var(--primary) 35%, transparent)"
                : "var(--primary)",
              color: "var(--primary-foreground)",
              pointerEvents: isEmpty ? "none" : undefined,
            }}
            data-testid="inline-cart-checkout"
          >
            Checkout
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
