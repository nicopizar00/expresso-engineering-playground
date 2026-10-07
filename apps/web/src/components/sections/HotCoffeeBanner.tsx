"use client";

/**
 * HotCoffeeBanner - shown to a signed-in user while at least one coffee
 * placed for them is hot. Fed only by GET /me/hot-status (polled);
 * never reads the order list. The live region carries the count only so
 * the ticking countdown does not flood screen readers.
 */

import { Flame } from "lucide-react";
import { useSecondTick } from "@/lib/hooks/use-second-tick";
import {
  coolsInText,
  formatRemaining,
  hotCountText,
  remainingMs,
} from "@/lib/hot-status/countdown";
import { useHotStatus } from "@/lib/hot-status/use-hot-status";

export function HotCoffeeBanner({ onView }: { onView: () => void }) {
  const snap = useHotStatus();
  const now = useSecondTick(snap !== null);
  if (!snap) return null;
  const { status, skewMs } = snap;
  const left = status.nextCoolsAt
    ? formatRemaining(remainingMs(status.nextCoolsAt, now, skewMs))
    : "0:00";

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
      style={{
        flex: "0 0 auto",
        borderBottom: "1px solid var(--warning)",
        color: "var(--foreground)",
      }}
      data-testid="hot-coffee-banner"
    >
      <Flame
        className="h-4 w-4 shrink-0"
        style={{ color: "var(--warning)" }}
        aria-hidden
      />
      <span role="status" aria-live="polite" data-testid="hot-coffee-count">
        ☕ {hotCountText(status.hotCount)}
      </span>
      <span
        className="tabular-nums"
        style={{ color: "var(--muted-foreground)" }}
        data-testid="hot-coffee-countdown"
      >
        — {coolsInText(status.hotCount)} {left}
      </span>
      <button
        type="button"
        className="ml-auto text-xs font-medium underline"
        onClick={onView}
      >
        View
      </button>
    </div>
  );
}
