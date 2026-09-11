"use client";

/**
 * VisualizerPanel - Persistent 3D order-counter rail
 *
 * Rendered once by AppShell so the live visualizer stays on screen across
 * every route except the homepage, which mounts its own separate instance
 * instead (see apps/web/app/page.tsx). On desktop it's a sticky right-hand
 * rail; below 1024px there's no room for a side column, so the same
 * instance collapses into a bottom drawer behind a pull-tab. Only one
 * VisualizerEmbed is ever mounted — the breakpoints are pure CSS
 * (position/transform), not a duplicate iframe — so there's a single SSE
 * connection regardless of viewport.
 */

import { useState } from "react";
import { VisualizerEmbed } from "./VisualizerEmbed";

export function VisualizerPanel() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <aside
      className={`viz-panel${mobileOpen ? " is-open" : ""}`}
      aria-label="Live order counter visualizer"
      data-testid="viz-panel"
    >
      <button
        type="button"
        className="viz-pull-tab"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
      >
        <span className="viz-pull-handle" aria-hidden="true" />
        {mobileOpen ? "Hide order counter" : "Order counter"}
      </button>

      <div className="viz-bezel animate-crtOn">
        <VisualizerEmbed
          embed
          aspectRatio="3 / 4"
          title="Order counter"
          compact
        />
        <p className="viz-bezel-caption">
          Live view of the order counter. Every add-to-cart and placed order
          shows up here as it happens.
        </p>
      </div>
    </aside>
  );
}
