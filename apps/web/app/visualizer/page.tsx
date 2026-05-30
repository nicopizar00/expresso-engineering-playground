'use client';

/**
 * 3D Visualizer Integration Page
 *
 * This page provides an integration surface for the standalone visualizer-3d app.
 * The visualizer is a separate static frontend that uses vanilla JS + Three.js
 * and consumes data from the BFF's GET /visualization-data endpoint.
 *
 * This integration does NOT:
 * - Rewrite the visualizer in React or use React Three Fiber
 * - Move scene.js or any Three.js code into the main frontend
 * - Duplicate the visualization-data transformation logic
 * - Create tight coupling between frontend and visualizer internals
 *
 * TODO(v0-export): Component ready for repository integration
 * TODO(api-wire): Confirm visualizer deployment URL per environment
 * TODO(error-handling): Improve iframe/load failure detection if needed
 * TODO(types): Keep visualization DTO ownership in shared contracts or BFF docs
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Box,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Info,
  Server,
  Database,
  Code,
  Layers,
  CheckCircle,
  XCircle,
} from 'lucide-react';

/**
 * Same-origin path for the embedded visualizer.
 *
 * The iframe loads /viz/index.html, which the Next.js server rewrites to the
 * visualizer container over the internal Docker network (see next.config.mjs).
 * The browser never connects to the visualizer port directly — it only talks to
 * the web app. This makes the web app the single product shell.
 *
 * index.html (not the bare /viz/) is used on purpose: Next strips trailing
 * slashes (/viz/ -> 308 -> /viz), which would make the visualizer's relative
 * asset paths resolve to /scene.js. Pointing at /viz/index.html keeps the
 * document base under /viz/, so ./scene.js resolves to /viz/scene.js.
 */
const EMBED_SRC = '/viz/index.html';

/**
 * Host-reachable URL for opening the visualizer standalone in a new browser tab.
 *
 * Confirmed local port: 3002 (per VIZ_PORT). Docker maps internal port 80 →
 * host port 3002. Inlined into the client bundle from NEXT_PUBLIC_VISUALIZER_URL.
 */
const STANDALONE_URL = process.env.NEXT_PUBLIC_VISUALIZER_URL || '';

type IframeStatus = 'loading' | 'loaded' | 'error' | 'not-configured';

export default function VisualizerPage() {
  const [iframeStatus, setIframeStatus] = useState<IframeStatus>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [showDevInfo, setShowDevInfo] = useState(true);

  const handleIframeLoad = useCallback(() => {
    setIframeStatus('loaded');
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeStatus('error');
  }, []);

  const handleRetry = useCallback(() => {
    setIframeStatus('loading');
    setRetryCount((c) => c + 1);
  }, []);

  // Iframes don't fire onError for proxy 4xx/5xx, so guard against an infinite
  // spinner: if the embed hasn't reported a load within a generous window, flip
  // to the actionable error state (retry + standalone link). The functional
  // updater reads the current status at fire time, avoiding a stale closure.
  useEffect(() => {
    if (iframeStatus !== 'loading') return;

    const timeout = setTimeout(() => {
      setIframeStatus((current) => (current === 'loading' ? 'error' : current));
    }, 12_000);

    return () => clearTimeout(timeout);
  }, [iframeStatus]);

  return (
    <div className="container py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Box className="h-5 w-5" />
          </div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: 'var(--foreground)' }}
          >
            3D Visualizer
          </h1>
          <span
            className="px-2 py-0.5 text-xs font-medium rounded-full"
            style={{
              backgroundColor: 'var(--secondary)',
              color: 'var(--muted-foreground)',
            }}
          >
            Integration Preview
          </span>
        </div>
        <p style={{ color: 'var(--muted-foreground)' }} className="max-w-2xl">
          The 3D visualizer is a standalone static app that renders a Three.js scene
          and fetches domain data from the BFF. It is embedded here through the web
          app&apos;s <code>/viz</code> proxy, which reaches the visualizer container
          over the internal Docker network — the browser only talks to this app, and
          the main frontend does not own any Three.js rendering code.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Visualizer Panel */}
        <div className="lg:col-span-2">
          <div
            className="rounded-lg border overflow-hidden"
            style={{
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
            }}
          >
            {/* Panel Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
                <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                  Hello Room Scene
                </span>
                <StatusBadge status={iframeStatus} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--muted-foreground)',
                  }}
                  title="Reload visualizer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reload</span>
                </button>
                <a
                  href={STANDALONE_URL || EMBED_SRC}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                  }}
                  title="Open the visualizer standalone in a new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Standalone</span>
                </a>
              </div>
            </div>

            {/* Iframe Container */}
            <div className="relative" style={{ aspectRatio: '16 / 10' }}>
              {iframeStatus === 'error' ? (
                <ErrorState onRetry={handleRetry} />
              ) : (
                <>
                  {iframeStatus === 'loading' && <LoadingOverlay />}
                  <iframe
                    key={retryCount}
                    src={EMBED_SRC}
                    className="w-full h-full border-0"
                    title="3D Visualizer - Hello Room"
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                    sandbox="allow-scripts allow-same-origin"
                    loading="lazy"
                  />
                </>
              )}
            </div>
          </div>

          {/* Architecture Overview */}
          <div
            className="mt-6 rounded-lg border p-4"
            style={{
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
            }}
          >
            <h2
              className="font-medium mb-3 flex items-center gap-2"
              style={{ color: 'var(--foreground)' }}
            >
              <Code className="h-4 w-4" style={{ color: 'var(--primary)' }} />
              Architecture Overview
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
              The visualizer-3d app remains standalone (static files served by nginx). The
              web app embeds it through the same-origin <code>/viz</code> proxy, which
              rewrites to the visualizer container over the internal Docker network — a
              launcher surface, not a tight integration.
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
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
            }}
          >
            <button
              onClick={() => setShowDevInfo(!showDevInfo)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              style={{ color: 'var(--foreground)' }}
            >
              <span className="font-medium flex items-center gap-2">
                <Info className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                Developer Info
              </span>
              <span
                className="text-xs"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {showDevInfo ? 'Hide' : 'Show'}
              </span>
            </button>

            {showDevInfo && (
              <div
                className="px-4 pb-4 border-t pt-4 space-y-4"
                style={{ borderColor: 'var(--border)' }}
              >
                {/* Key Points */}
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Key Points
                  </h3>
                  <ul className="space-y-2 text-sm" style={{ color: 'var(--foreground)' }}>
                    <li className="flex items-start gap-2">
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: 'var(--success)' }}
                      />
                      <span>visualizer-3d is a standalone static app</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: 'var(--success)' }}
                      />
                      <span>Reads only from BFF GET /visualization-data</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: 'var(--success)' }}
                      />
                      <span>Does not access the database directly</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: 'var(--success)' }}
                      />
                      <span>Safe to evolve independently</span>
                    </li>
                  </ul>
                </div>

                {/* Connection */}
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Connection
                  </h3>
                  <div
                    className="p-3 rounded-md font-mono text-xs space-y-1"
                    style={{
                      backgroundColor: 'var(--secondary)',
                      color: 'var(--foreground)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--muted-foreground)' }}>embed (proxy): </span>
                      <span>{EMBED_SRC}</span>
                    </div>
                    <div className="truncate">
                      <span style={{ color: 'var(--muted-foreground)' }}>standalone: </span>
                      {STANDALONE_URL || (
                        <span style={{ color: 'var(--destructive)' }}>Not set</span>
                      )}
                    </div>
                  </div>
                  <p
                    className="mt-2 text-xs"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    The iframe loads <code>/viz</code> on this origin; Next.js rewrites it
                    to <code>VISUALIZER_INTERNAL_URL</code> over the internal network. The
                    standalone link uses <code>NEXT_PUBLIC_VISUALIZER_URL</code> (host port).
                  </p>
                </div>

                {/* BFF Endpoint */}
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    BFF Endpoint
                  </h3>
                  <code
                    className="block p-2 rounded-md text-xs"
                    style={{
                      backgroundColor: 'var(--secondary)',
                      color: 'var(--foreground)',
                    }}
                  >
                    GET /visualization-data
                  </code>
                  <p
                    className="mt-2 text-xs"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Returns VisualizationDataResponse with items for 3D scene objects.
                  </p>
                </div>

                {/* Quick Links */}
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Source Files
                  </h3>
                  <ul
                    className="text-xs space-y-1"
                    style={{ color: 'var(--muted-foreground)' }}
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
                  style={{ borderColor: 'var(--border)' }}
                >
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    Integration Status
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <IntegrationStatusRow label="Iframe embed (/viz proxy)" status="ready" />
                    <IntegrationStatusRow
                      label="Standalone link"
                      status={STANDALONE_URL ? 'ready' : 'needs-config'}
                    />
                    <IntegrationStatusRow label="BFF endpoint" status="verified" />
                    <IntegrationStatusRow label="Mock fallback" status="verified" />
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

// --- Sub-components ---

function StatusBadge({ status }: { status: IframeStatus }) {
  const config = {
    loading: { label: 'Loading...', color: 'var(--warning)' },
    loaded: { label: 'Connected', color: 'var(--success)' },
    error: { label: 'Error', color: 'var(--destructive)' },
    'not-configured': { label: 'Not Configured', color: 'var(--muted-foreground)' },
  }[status];

  return (
    <span
      className="px-2 py-0.5 text-xs font-medium rounded-full"
      style={{
        backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

function LoadingOverlay() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="text-center">
        <RefreshCw
          className="h-8 w-8 animate-spin mx-auto mb-3"
          style={{ color: 'var(--primary)' }}
        />
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Loading 3D Visualizer...
        </p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--secondary)' }}
    >
      <div className="text-center max-w-md">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{
            backgroundColor: 'var(--destructive)',
            color: 'var(--destructive-foreground)',
          }}
        >
          <XCircle className="h-6 w-6" />
        </div>
        <h3
          className="font-semibold mb-2"
          style={{ color: 'var(--foreground)' }}
        >
          Failed to Load Visualizer
        </h3>
        <p
          className="text-sm mb-4"
          style={{ color: 'var(--muted-foreground)' }}
        >
          The <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--background)' }}>
            /viz
          </code> proxy could not reach the visualizer container. Start it with{' '}
          <code>./dev up viz</code> (or <code>full</code>).
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          {STANDALONE_URL && (
            <a
              href={STANDALONE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--secondary)',
                color: 'var(--foreground)',
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Open Standalone
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

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
      style={{ backgroundColor: 'var(--secondary)' }}
    >
      <Icon
        className="h-5 w-5 mb-2"
        style={{ color: 'var(--primary)' }}
      />
      <h3
        className="font-medium text-sm mb-1"
        style={{ color: 'var(--foreground)' }}
      >
        {title}
      </h3>
      <p
        className="text-xs"
        style={{ color: 'var(--muted-foreground)' }}
      >
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
  status: 'ready' | 'needs-config' | 'verified' | 'pending';
}) {
  const config = {
    ready: { icon: CheckCircle, color: 'var(--success)', text: 'Ready' },
    verified: { icon: CheckCircle, color: 'var(--success)', text: 'Verified' },
    'needs-config': { icon: AlertCircle, color: 'var(--warning)', text: 'Needs Config' },
    pending: { icon: AlertCircle, color: 'var(--muted-foreground)', text: 'Pending' },
  }[status];

  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <span className="flex items-center gap-1" style={{ color: config.color }}>
        <Icon className="h-3 w-3" />
        {config.text}
      </span>
    </div>
  );
}
