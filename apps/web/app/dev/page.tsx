'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  FlaskConical,
  BookOpen,
  Zap,
  AlertTriangle,
  ShoppingCart,
  Package,
  Heart,
  Gauge,
  Box,
  Terminal,
  Database,
  Server,
  Coffee,
  Clock,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  expressoApi,
  Product,
  ExpressoApiError,
  getDemoModeStatus,
  setDemoMode,
  getMockScenario,
  setMockScenario,
  getSampleOrderId,
  type MockScenario,
} from '@/lib/api/expresso-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiResult = { ok: boolean; data: unknown; status?: number };

// ---------------------------------------------------------------------------
// API Testing Hook
// ---------------------------------------------------------------------------

function useApiCall() {
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function call<T>(fn: () => Promise<T>) {
    setLoading(true);
    setResult(null);
    try {
      const data = await fn();
      setResult({ ok: true, data });
    } catch (err) {
      if (err instanceof ExpressoApiError) {
        setResult({ ok: false, data: err.body, status: err.status });
      } else {
        setResult({ ok: false, data: { error: (err as Error).message } });
      }
    } finally {
      setLoading(false);
    }
  }

  return { result, loading, call };
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

function Card({
  title,
  icon: Icon,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="card">
      <div
        className={`card-header ${collapsible ? 'cursor-pointer hover:bg-secondary/50' : ''}`}
        onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
      >
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="icon-badge icon-badge-sm">
              <Icon className="icon-sm" />
            </div>
          )}
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {collapsible && (
          <button className="text-muted-foreground" aria-label={isOpen ? 'Collapse' : 'Expand'}>
            {isOpen ? <ChevronUp className="icon-sm" /> : <ChevronDown className="icon-sm" />}
          </button>
        )}
      </div>
      {(!collapsible || isOpen) && <div className="card-body">{children}</div>}
    </div>
  );
}

function StatusBadge({ status, label }: { status: 'success' | 'warning' | 'error' | 'info' | 'muted'; label: string }) {
  const classes = {
    success: 'status-badge-success',
    warning: 'status-badge-warning',
    error: 'status-badge-error',
    info: 'status-badge-info',
    muted: 'status-badge-muted',
  };

  return <span className={`status-badge ${classes[status]}`}>{label}</span>;
}

function ConnectionIndicator({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-border/50">
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
      {connected ? <Wifi className="icon-sm text-success" /> : <WifiOff className="icon-sm text-muted-foreground" />}
      <span className="text-sm">{label}</span>
      <span className={`ml-auto text-xs font-medium ${connected ? 'text-success' : 'text-muted-foreground'}`}>
        {connected ? 'Connected' : 'Offline'}
      </span>
    </div>
  );
}

function ResponseBox({ result }: { result: ApiResult | null }) {
  if (!result) return null;
  return (
    <div className="rounded-lg overflow-hidden border border-border/50">
      <div className={`flex items-center gap-2 px-3 py-2 text-xs font-medium ${result.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
        {result.ok ? <CheckCircle className="icon-xs" /> : <XCircle className="icon-xs" />}
        {result.ok ? 'Success' : `Error${result.status ? ` (${result.status})` : ''}`}
      </div>
      <pre className="p-3 text-xs font-mono bg-secondary/30 overflow-auto max-h-32">
        {JSON.stringify(result.data, null, 2)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo Guide Panel
// ---------------------------------------------------------------------------

function DemoGuidePanel() {
  const [isDemoMode, setIsDemoModeState] = useState(false);
  const [scenario, setScenarioState] = useState<MockScenario>('happy');
  const sampleOrderId = getSampleOrderId();

  useEffect(() => {
    setIsDemoModeState(getDemoModeStatus());
    setScenarioState(getMockScenario());
  }, []);

  function handleDemoToggle() {
    const newState = !isDemoMode;
    setDemoMode(newState);
    setIsDemoModeState(newState);
  }

  function handleScenarioChange(newScenario: MockScenario) {
    setMockScenario(newScenario);
    setScenarioState(newScenario);
  }

  const scenarios: { value: MockScenario; label: string; desc: string }[] = [
    { value: 'happy', label: 'Happy Path', desc: 'Normal operation' },
    { value: 'loading', label: 'Loading', desc: '2s delay' },
    { value: 'empty', label: 'Empty', desc: 'No data' },
    { value: 'error', label: 'Error', desc: 'API failures' },
    { value: 'cart-filled', label: 'Cart Filled', desc: '3 items' },
    { value: 'checkout-failure', label: 'Checkout Fail', desc: 'Always fails' },
  ];

  return (
    <Card title="Demo Mode" icon={FlaskConical}>
      <div className="space-y-4">
        {/* Toggle */}
        <div className={`p-3 rounded-lg border ${isDemoMode ? 'bg-warning/10 border-warning/30' : 'bg-secondary/30 border-border/50'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Mock Data Mode</span>
            <StatusBadge status={isDemoMode ? 'warning' : 'muted'} label={isDemoMode ? 'Active' : 'Off'} />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {isDemoMode
              ? 'Using local mock data. API calls return fixtures.'
              : 'Connecting to BFF. Enable demo mode to test without backend.'}
          </p>
          <button onClick={handleDemoToggle} className="btn btn-secondary btn-sm w-full">
            {isDemoMode ? 'Disable Demo Mode' : 'Enable Demo Mode'}
          </button>
        </div>

        {/* Scenarios */}
        {isDemoMode && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Mock Scenario</label>
            <div className="grid grid-cols-2 gap-2">
              {scenarios.map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleScenarioChange(s.value)}
                  className={`text-left p-2 rounded-lg border text-xs transition-all ${
                    scenario === s.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary/30 border-border/50 hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium">{s.label}</div>
                  <div className={`text-[10px] mt-0.5 ${scenario === s.value ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {s.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Quick Test</label>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="btn btn-secondary btn-sm">
              <Coffee className="icon-xs" /> Catalog
            </Link>
            <Link href="/cart" className="btn btn-secondary btn-sm">
              <ShoppingCart className="icon-xs" /> Cart
            </Link>
            <Link href={`/orders/${sampleOrderId}`} className="btn btn-secondary btn-sm">
              <Package className="icon-xs" /> Order
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// System Info Panel
// ---------------------------------------------------------------------------

function SystemInfoPanel() {
  return (
    <Card title="System Architecture" icon={Server}>
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Database className="icon-sm text-primary" />
            <span className="text-sm font-medium">Data Persistence</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
            <li>Orders stored in PostgreSQL via BFF</li>
            <li>Orders persist across restarts</li>
            <li>Cart is intentionally in-memory only</li>
          </ul>
        </div>

        <div className="p-3 rounded-lg bg-info/10 border border-info/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="icon-sm text-info" />
            <span className="text-sm font-medium text-info">Engineering Playground</span>
          </div>
          <p className="text-xs text-muted-foreground">
            This is a demo application for exploring software engineering patterns.
            Cart data resets on refresh; orders are persistent.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Readiness Panel
// ---------------------------------------------------------------------------

function ReadinessPanel() {
  const items = [
    { label: 'Product catalog', status: 'wired' as const, note: 'GET /catalog/products' },
    { label: 'Cart operations', status: 'wired' as const, note: 'GET/POST /cart' },
    { label: 'Checkout', status: 'wired' as const, note: 'POST /checkout' },
    { label: 'Order lookup', status: 'wired' as const, note: 'GET /orders/:id' },
    { label: 'Order list', status: 'wired' as const, note: 'GET /orders' },
    { label: 'Cart item removal', status: 'mock' as const, note: 'Frontend-only' },
    { label: '3D Visualizer', status: 'embed' as const, note: 'External iframe' },
    { label: 'Performance view', status: 'mock' as const, note: 'Simulated data' },
  ];

  const statusColors = {
    wired: 'success',
    mock: 'warning',
    embed: 'info',
  } as const;

  return (
    <Card title="Frontend Readiness" icon={Heart}>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
            <span className="text-sm">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">{item.note}</span>
              <StatusBadge status={statusColors[item.status]} label={item.status} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        <strong className="text-foreground">wired</strong> = BFF endpoint |{' '}
        <strong className="text-foreground">mock</strong> = frontend fixture |{' '}
        <strong className="text-foreground">embed</strong> = external
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Performance & Visualizer Cards
// ---------------------------------------------------------------------------

function PerformanceCard() {
  return (
    <Card title="Performance Playground" icon={Gauge}>
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-info/10 border border-info/30">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="icon-sm text-info" />
            <span className="text-sm font-medium text-info">Simulated Data</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Performance metrics are deterministic mock data for UX demonstration.
            This is not live telemetry or actual k6 results.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          {['Browsing', 'Checkout', 'Mixed', 'Stress', 'Lookup', 'Errors'].map((s) => (
            <div key={s} className="p-2 rounded bg-secondary/30 border border-border/50 text-center">
              {s}
            </div>
          ))}
        </div>

        <Link href="/performance" className="btn btn-primary w-full">
          <Gauge className="icon-sm" />
          Open Performance Playground
        </Link>
      </div>
    </Card>
  );
}

function VisualizerCard() {
  const url = process.env.NEXT_PUBLIC_VISUALIZER_URL || '';
  const configured = url.length > 0;

  return (
    <Card title="3D Visualizer" icon={Box}>
      <div className="space-y-3">
        <ConnectionIndicator connected={configured} label="Visualizer Service" />

        {!configured && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
            <p className="text-xs text-muted-foreground">
              Set <code className="px-1 py-0.5 rounded bg-secondary text-warning">NEXT_PUBLIC_VISUALIZER_URL</code> to enable.
            </p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p className="mb-1">Standalone Three.js app:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>Vanilla JS + Three.js</li>
            <li>Data from GET /visualization-data</li>
            <li>Embedded via iframe</li>
          </ul>
        </div>

        <Link href="/visualizer" className="btn btn-secondary w-full">
          <Box className="icon-sm" />
          Open Visualizer
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API Test Cards
// ---------------------------------------------------------------------------

function ApiTestCard({
  title,
  endpoint,
  onTest,
  loading,
  result,
}: {
  title: string;
  endpoint: string;
  onTest: () => void;
  loading: boolean;
  result: ApiResult | null;
}) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border/50 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <code className="text-xs text-primary">{endpoint}</code>
        </div>
        <button onClick={onTest} disabled={loading} className="btn btn-primary btn-sm">
          {loading ? <Loader2 className="icon-sm animate-spin" /> : <Play className="icon-sm" />}
          Test
        </button>
      </div>
      <ResponseBox result={result} />
    </div>
  );
}

function ApiTestSection() {
  const health = useApiCall();
  const products = useApiCall();
  const orders = useApiCall();

  return (
    <Card title="API Endpoints" icon={Terminal}>
      <div className="space-y-3">
        <ApiTestCard
          title="Health Check"
          endpoint="GET /health"
          onTest={() => health.call(() => expressoApi.getHealth())}
          loading={health.loading}
          result={health.result}
        />
        <ApiTestCard
          title="Products"
          endpoint="GET /catalog/products"
          onTest={() => products.call(() => expressoApi.getProducts())}
          loading={products.loading}
          result={products.result}
        />
        <ApiTestCard
          title="Orders"
          endpoint="GET /orders"
          onTest={() => orders.call(() => expressoApi.getOrders())}
          loading={orders.loading}
          result={orders.result}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DevPage() {
  const [bffConnected, setBffConnected] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        await expressoApi.getHealth();
        setBffConnected(true);
      } catch {
        setBffConnected(false);
      } finally {
        setChecking(false);
      }
    };
    check();
  }, []);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="icon-badge">
            <Terminal className="icon-lg" />
          </div>
          <div>
            <h1 className="page-title">Developer Tools</h1>
            <p className="text-sm text-muted-foreground">
              API testing, debug utilities, and system information
            </p>
          </div>
        </div>
        {!checking && <ConnectionIndicator connected={bffConnected} label="BFF" />}
      </div>

      {/* Quick Navigation */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="btn btn-secondary btn-sm">
              <Coffee className="icon-xs" /> Catalog
            </Link>
            <Link href="/cart" className="btn btn-secondary btn-sm">
              <ShoppingCart className="icon-xs" /> Cart
            </Link>
            <Link href="/orders" className="btn btn-secondary btn-sm">
              <Package className="icon-xs" /> Orders
            </Link>
            <Link href="/performance" className="btn btn-secondary btn-sm">
              <Gauge className="icon-xs" /> Performance
            </Link>
            <Link href="/visualizer" className="btn btn-secondary btn-sm">
              <Box className="icon-xs" /> Visualizer
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        <DemoGuidePanel />
        <SystemInfoPanel />
        <ReadinessPanel />
        <ApiTestSection />
        <PerformanceCard />
        <VisualizerCard />
      </div>

      {/* Footer */}
      <div className="mt-8 p-4 rounded-lg bg-secondary/30 border border-border/50 text-center">
        <p className="text-xs text-muted-foreground">
          Expresso Engineering Playground - A containerized e-commerce demo for software engineering practices
        </p>
      </div>
    </div>
  );
}
