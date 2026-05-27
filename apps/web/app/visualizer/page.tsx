'use client';

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
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from 'lucide-react';

const VISUALIZER_URL = process.env.NEXT_PUBLIC_VISUALIZER_URL || '';

type IframeStatus = 'loading' | 'loaded' | 'error' | 'not-configured';

export default function VisualizerPage() {
  const [iframeStatus, setIframeStatus] = useState<IframeStatus>(
    VISUALIZER_URL ? 'loading' : 'not-configured'
  );
  const [showDevInfo, setShowDevInfo] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const handleIframeLoad = useCallback(() => {
    setIframeStatus('loaded');
  }, []);

  const handleRetry = useCallback(() => {
    setIframeStatus('loading');
    setIframeKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (iframeStatus !== 'loading') return;
    const timeout = setTimeout(() => {
      // Leave as loading - user can see iframe state
    }, 10000);
    return () => clearTimeout(timeout);
  }, [iframeStatus]);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/dev" className="btn btn-ghost btn-sm">
            <ArrowLeft className="icon-sm" />
          </Link>
          <div className="icon-badge">
            <Box className="icon-lg" />
          </div>
          <div>
            <h1 className="page-title">3D Visualizer</h1>
            <p className="text-sm text-muted-foreground">
              Three.js visualization of domain data
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusIndicator status={iframeStatus} />
          {VISUALIZER_URL && (
            <button onClick={handleRetry} className="btn btn-secondary btn-sm">
              <RefreshCw className="icon-sm" />
              Reload
            </button>
          )}
        </div>
      </div>

      {/* Visualizer Container */}
      <div className="card">
        <div className="card-body p-0">
          {iframeStatus === 'not-configured' ? (
            <NotConfiguredState />
          ) : iframeStatus === 'error' ? (
            <ErrorState onRetry={handleRetry} />
          ) : (
            <div className="relative" style={{ minHeight: '500px' }}>
              {iframeStatus === 'loading' && <LoadingOverlay />}
              <iframe
                key={iframeKey}
                src={VISUALIZER_URL}
                className="w-full border-0 rounded-lg"
                style={{ height: '500px' }}
                onLoad={handleIframeLoad}
                title="3D Product Visualizer"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          )}
        </div>
      </div>

      {/* Dev Info Toggle */}
      <button
        onClick={() => setShowDevInfo(!showDevInfo)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-4"
      >
        <Info className="icon-sm" />
        Developer Information
        {showDevInfo ? <ChevronUp className="icon-sm" /> : <ChevronDown className="icon-sm" />}
      </button>

      {showDevInfo && <DevInfoPanel />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIndicator({ status }: { status: IframeStatus }) {
  const config = {
    loading: { icon: RefreshCw, label: 'Loading', className: 'status-badge-info' },
    loaded: { icon: CheckCircle, label: 'Connected', className: 'status-badge-success' },
    error: { icon: XCircle, label: 'Error', className: 'status-badge-error' },
    'not-configured': { icon: AlertCircle, label: 'Not Configured', className: 'status-badge-warning' },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <span className={`status-badge ${className}`}>
      <Icon className={`icon-xs ${status === 'loading' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10 rounded-lg">
      <div className="text-center">
        <RefreshCw className="icon-lg text-primary animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Loading 3D visualizer...</p>
      </div>
    </div>
  );
}

function NotConfiguredState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="icon-badge icon-badge-lg bg-warning/10 text-warning mb-4">
        <AlertCircle className="icon-lg" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Visualizer Not Configured</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        The 3D visualizer requires the <code className="px-1.5 py-0.5 rounded bg-secondary text-primary">NEXT_PUBLIC_VISUALIZER_URL</code> environment variable to be set.
      </p>
      <div className="p-4 rounded-lg bg-secondary/50 border border-border/50 text-xs font-mono max-w-md w-full">
        <p className="text-muted-foreground mb-1"># Local development (Docker)</p>
        <p className="text-foreground">NEXT_PUBLIC_VISUALIZER_URL=http://localhost:3002</p>
      </div>
      <Link href="/dev" className="btn btn-secondary mt-6">
        Back to Developer Tools
      </Link>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="icon-badge icon-badge-lg bg-destructive/10 text-destructive mb-4">
        <XCircle className="icon-lg" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Failed to Load Visualizer</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        Could not connect to the visualizer service. Make sure it is running and accessible.
      </p>
      <div className="flex gap-3">
        <button onClick={onRetry} className="btn btn-primary">
          <RefreshCw className="icon-sm" />
          Try Again
        </button>
        <Link href="/dev" className="btn btn-secondary">
          Developer Tools
        </Link>
      </div>
    </div>
  );
}

function DevInfoPanel() {
  return (
    <div className="grid md:grid-cols-2 gap-4 mt-4">
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Server className="icon-sm text-primary" />
            <h3 className="text-sm font-medium">Architecture</h3>
          </div>
        </div>
        <div className="card-body">
          <ul className="text-xs text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle className="icon-xs text-success mt-0.5 shrink-0" />
              <span>Standalone static app (vanilla JS + Three.js)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="icon-xs text-success mt-0.5 shrink-0" />
              <span>Served via nginx:alpine container</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="icon-xs text-success mt-0.5 shrink-0" />
              <span>Embedded via iframe in this page</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="icon-xs text-success mt-0.5 shrink-0" />
              <span>No Three.js code in main frontend</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Database className="icon-sm text-primary" />
            <h3 className="text-sm font-medium">Data Flow</h3>
          </div>
        </div>
        <div className="card-body">
          <ul className="text-xs text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <Code className="icon-xs text-info mt-0.5 shrink-0" />
              <span>Visualizer fetches GET /visualization-data</span>
            </li>
            <li className="flex items-start gap-2">
              <Code className="icon-xs text-info mt-0.5 shrink-0" />
              <span>BFF transforms domain data for 3D rendering</span>
            </li>
            <li className="flex items-start gap-2">
              <Code className="icon-xs text-info mt-0.5 shrink-0" />
              <span>No direct database access from visualizer</span>
            </li>
            <li className="flex items-start gap-2">
              <Code className="icon-xs text-info mt-0.5 shrink-0" />
              <span>DTO contracts defined in BFF</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="card md:col-span-2">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Info className="icon-sm text-primary" />
            <h3 className="text-sm font-medium">Environment Configuration</h3>
          </div>
        </div>
        <div className="card-body">
          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-medium mb-1">Local Development</p>
              <code className="block p-2 rounded bg-secondary/50 text-muted-foreground">
                NEXT_PUBLIC_VISUALIZER_URL=http://localhost:3002
              </code>
            </div>
            <div>
              <p className="font-medium mb-1">Current Value</p>
              <code className="block p-2 rounded bg-secondary/50 text-muted-foreground break-all">
                {VISUALIZER_URL || '(not set)'}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
