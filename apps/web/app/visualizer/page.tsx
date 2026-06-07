"use client";

/**
 * 3D Visualizer Integration Page
 *
 * Standalone explainer + iframe embed. The iframe itself lives in the shared
 * VisualizerEmbed component so both this route and the homepage workspace use
 * the same loading/error/retry contract.
 *
 * Hard rules (do not break):
 * - Never touch apps/visualizer-3d/public/scene.js from here.
 * - The visualizer reads only GET /visualization-data and the SSE stream at
 *   /visualization-updates. Nothing in this page should change that contract.
 */

import { useState } from "react";
import {
  Box,
  AlertCircle,
  Info,
  Server,
  Database,
  Code,
  Layers,
  CheckCircle,
} from "lucide-react";
import { VisualizerEmbed } from "@/components/visualizer/VisualizerEmbed";

const EMBED_SRC = "/viz/index.html";
const STANDALONE_URL = process.env.NEXT_PUBLIC_VISUALIZER_URL || "";

export default function VisualizerPage() {
  const [showDevInfo, setShowDevInfo] = useState(true);

  return (
    <div className="container py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="p-2 rounded-lg"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <Box className="h-5 w-5" />
          </div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            3D Visualizer
          </h1>
          <span
            className="px-2 py-0.5 text-xs font-medium rounded-full"
            style={{
              backgroundColor: "var(--secondary)",
              color: "var(--muted-foreground)",
            }}
          >
            Integration Preview
          </span>
        </div>
        <p style={{ color: "var(--muted-foreground)" }} className="max-w-2xl">
          The 3D visualizer is a standalone static app that renders a Three.js
          scene and fetches domain data from the BFF. It is embedded here
          through the web app&apos;s <code>/viz</code> proxy, which reaches the
          visualizer container over the internal Docker network — the browser
          only talks to this app, and the main frontend does not own any
          Three.js rendering code.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Visualizer Panel */}
        <div className="lg:col-span-2">
          <VisualizerEmbed aspectRatio="16 / 10" title="Hello Room Scene" />

          {/* Architecture Overview */}
          <div
            className="mt-6 rounded-lg border p-4"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            <h2
              className="font-medium mb-3 flex items-center gap-2"
              style={{ color: "var(--foreground)" }}
            >
              <Code className="h-4 w-4" style={{ color: "var(--primary)" }} />
              Architecture Overview
            </h2>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--muted-foreground)" }}
            >
              The visualizer-3d app remains standalone (static files served by
              nginx). The web app embeds it through the same-origin{" "}
              <code>/viz</code> proxy, which rewrites to the visualizer
              container over the internal Docker network — a launcher surface,
              not a tight integration.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              <ArchitectureCard
                icon={Layers}
                title="Standalone Static App"
                description="Vanilla JS + Three.js via ESM importmap/CDN. No React, no Node build step. Served by nginx:alpine."
              />
              <ArchitectureCard
                icon={Server}
                title="Internal Proxy Embed"
                description="The browser loads /viz on the web app's origin; Next.js rewrites it to the visualizer container over the internal network."
              />
              <ArchitectureCard
                icon={Database}
                title="No Direct DB Access"
                description="Visualizer never touches the database. All data flows through the BFF HTTP contract."
              />
            </div>
          </div>
        </div>

        {/* Developer Info Sidebar */}
        <div className="lg:col-span-1">
          <div
            className="rounded-lg border sticky top-20"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            <button
              onClick={() => setShowDevInfo(!showDevInfo)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              style={{ color: "var(--foreground)" }}
            >
              <span className="font-medium flex items-center gap-2">
                <Info className="h-4 w-4" style={{ color: "var(--primary)" }} />
                Developer Info
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                {showDevInfo ? "Hide" : "Show"}
              </span>
            </button>

            {showDevInfo && (
              <div
                className="px-4 pb-4 border-t pt-4 space-y-4"
                style={{ borderColor: "var(--border)" }}
              >
                {/* Key Points */}
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Key Points
                  </h3>
                  <ul
                    className="space-y-2 text-sm"
                    style={{ color: "var(--foreground)" }}
                  >
                    <li className="flex items-start gap-2">
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: "var(--success)" }}
                      />
                      <span>visualizer-3d is a standalone static app</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: "var(--success)" }}
                      />
                      <span>Reads only from BFF GET /visualization-data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: "var(--success)" }}
                      />
                      <span>Does not access the database directly</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: "var(--success)" }}
                      />
                      <span>Safe to evolve independently</span>
                    </li>
                  </ul>
                </div>

                {/* Connection */}
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Connection
                  </h3>
                  <div
                    className="p-3 rounded-md font-mono text-xs space-y-1"
                    style={{
                      backgroundColor: "var(--secondary)",
                      color: "var(--foreground)",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--muted-foreground)" }}>
                        embed (proxy):{" "}
                      </span>
                      <span>{EMBED_SRC}</span>
                    </div>
                    <div className="truncate">
                      <span style={{ color: "var(--muted-foreground)" }}>
                        standalone:{" "}
                      </span>
                      {STANDALONE_URL || (
                        <span style={{ color: "var(--destructive)" }}>
                          Not set
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    className="mt-2 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    The iframe loads <code>/viz</code> on this origin; Next.js
                    rewrites it to <code>VISUALIZER_INTERNAL_URL</code> over the
                    internal network. The standalone link uses{" "}
                    <code>NEXT_PUBLIC_VISUALIZER_URL</code> (host port).
                  </p>
                </div>

                {/* BFF Endpoint */}
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    BFF Endpoint
                  </h3>
                  <code
                    className="block p-2 rounded-md text-xs"
                    style={{
                      backgroundColor: "var(--secondary)",
                      color: "var(--foreground)",
                    }}
                  >
                    GET /visualization-data
                  </code>
                  <p
                    className="mt-2 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Returns VisualizationDataResponse with items for 3D scene
                    objects.
                  </p>
                </div>

                {/* Quick Links */}
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Source Files
                  </h3>
                  <ul
                    className="text-xs space-y-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <li>
                      <code>apps/visualizer-3d/</code>
                    </li>
                    <li>
                      <code>apps/bff/src/modules/visualization/</code>
                    </li>
                  </ul>
                </div>

                {/* Integration Status */}
                <div
                  className="pt-4 border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Integration Status
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <IntegrationStatusRow
                      label="Iframe embed (/viz proxy)"
                      status="ready"
                    />
                    <IntegrationStatusRow
                      label="Standalone link"
                      status={STANDALONE_URL ? "ready" : "needs-config"}
                    />
                    <IntegrationStatusRow
                      label="BFF endpoint"
                      status="verified"
                    />
                    <IntegrationStatusRow
                      label="Mock fallback"
                      status="verified"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---------------------------------------------------------

function ArchitectureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Box;
  title: string;
  description: string;
}) {
  return (
    <div
      className="p-3 rounded-md"
      style={{ backgroundColor: "var(--secondary)" }}
    >
      <Icon className="h-5 w-5 mb-2" style={{ color: "var(--primary)" }} />
      <h3
        className="font-medium text-sm mb-1"
        style={{ color: "var(--foreground)" }}
      >
        {title}
      </h3>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        {description}
      </p>
    </div>
  );
}

function IntegrationStatusRow({
  label,
  status,
}: {
  label: string;
  status: "ready" | "needs-config" | "verified" | "pending";
}) {
  const config = {
    ready: { icon: CheckCircle, color: "var(--success)", text: "Ready" },
    verified: { icon: CheckCircle, color: "var(--success)", text: "Verified" },
    "needs-config": {
      icon: AlertCircle,
      color: "var(--warning)",
      text: "Needs Config",
    },
    pending: {
      icon: AlertCircle,
      color: "var(--muted-foreground)",
      text: "Pending",
    },
  }[status];

  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span className="flex items-center gap-1" style={{ color: config.color }}>
        <Icon className="h-3 w-3" />
        {config.text}
      </span>
    </div>
  );
}
