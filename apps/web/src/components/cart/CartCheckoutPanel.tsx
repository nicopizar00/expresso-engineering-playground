"use client";

/**
 * CartCheckoutPanel - Cart summary + place-order submission
 *
 * Renders inline in the homepage's always-visible cart column. On
 * success, hands the new order id to the caller instead of navigating —
 * there is no longer a route to navigate to; the caller (page.tsx)
 * switches the Orders section to show it.
 */

import { useState } from "react";
import {
  ShoppingBag,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useCart } from "./CartProvider";
import {
  expressoApi,
  ExpressoApiError,
  formatMoney,
} from "@/lib/api/expresso-api";

interface CartCheckoutPanelProps {
  onOrderPlaced: (orderId: string) => void;
}

export function CartCheckoutPanel({ onOrderPlaced }: CartCheckoutPanelProps) {
  const { cart, isLoading, isEmpty, formattedTotal, refreshCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await expressoApi.checkout({});
      refreshCart();
      onOrderPlaced(result.orderId);
    } catch (err) {
      if (err instanceof ExpressoApiError) {
        if (err.status === 400) {
          setError(
            "Invalid checkout request. Please check your cart and try again.",
          );
        } else if (err.status === 409) {
          setError(
            "Checkout conflict. Your cart may have been modified. Please refresh and try again.",
          );
        } else {
          setError(`Checkout failed: ${err.message}`);
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-8"
        data-testid="cart-checkout-panel"
      >
        <Loader2
          className="h-5 w-5 animate-spin"
          style={{ color: "var(--muted-foreground)" }}
        />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className="rounded-lg border p-4 text-sm"
        style={{
          borderColor: "var(--border)",
          color: "var(--muted-foreground)",
        }}
        data-testid="cart-checkout-panel"
      >
        Cart is empty — add the product to get started.
      </div>
    );
  }

  const cardPadding = "p-3";
  const headerPadding = "px-3 py-2";
  const cardClass = "rounded-lg border overflow-hidden";

  return (
    <div className="space-y-3" data-testid="cart-checkout-panel">
      {/* Order summary card */}
      <div
        className={cardClass}
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className={`flex items-center gap-2 ${headerPadding} border-b`}
          style={{ borderColor: "var(--border)" }}
        >
          <ShoppingBag
            className="h-4 w-4"
            style={{ color: "var(--primary)" }}
          />
          <h2
            className="font-medium text-sm"
            style={{ color: "var(--foreground)" }}
          >
            Order Summary
          </h2>
          <span className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full tone-muted">
            {cart?.itemCount} items
          </span>
        </div>

        <div className={cardPadding}>
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {cart?.items.map((item) => (
              <li
                key={item.itemId}
                className="py-3 flex justify-between first:pt-0 last:pb-0"
              >
                <div>
                  <p
                    className="font-medium text-sm"
                    style={{ color: "var(--foreground)" }}
                  >
                    {item.name}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Qty: {item.quantity}
                  </p>
                </div>
                <p
                  className="font-medium text-sm font-mono"
                  style={{ color: "var(--foreground)" }}
                >
                  {formatMoney(
                    item.lineTotal.amountMinor,
                    item.lineTotal.currency,
                  )}
                </p>
              </li>
            ))}
          </ul>

          <div
            className="flex justify-between pt-4 mt-4 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="font-medium"
              style={{ color: "var(--foreground)" }}
            >
              Total
            </span>
            <span
              className="font-semibold font-mono"
              style={{ color: "var(--foreground)" }}
            >
              {formattedTotal}
            </span>
          </div>
        </div>
      </div>

      {/* Checkout form */}
      <form
        onSubmit={handleSubmit}
        className={cardClass}
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className={`${cardPadding} space-y-3`}>
          {error && (
            <div
              className="flex items-start gap-3 p-4 rounded-lg"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
              role="alert"
            >
              <AlertTriangle
                className="h-4 w-4 mt-0.5 shrink-0"
                style={{ color: "var(--destructive)" }}
              />
              <p className="text-sm" style={{ color: "var(--destructive)" }}>
                {error}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed tone-primary"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Place Order
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
