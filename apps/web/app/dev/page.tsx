'use client';

/**
 * Developer tools page with API debug console and Demo Guide.
 *
 * This page provides:
 * - Direct endpoint testing against the BFF
 * - Mock scenario controls for testing different UI states
 * - Demo Guide explaining how to explore the frontend
 */

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
  ExternalLink,
  Gauge,
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
// API Testing Hooks
// ---------------------------------------------------------------------------

type ApiResult = { ok: boolean; data: unknown; status?: number };

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
// Shared UI Components
// ---------------------------------------------------------------------------

function ResponseBox({ result }: { result: ApiResult | null }) {
  if (!result) return null;
  return (
    <div
      className="rounded-md overflow-hidden text-xs"
      style={{ backgroundColor: 'var(--secondary)' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{
          backgroundColor: result.ok ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          color: result.ok ? 'var(--success)' : 'var(--destructive)',
        }}
      >
        {result.ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        <span className="font-semibold">
          {result.ok ? 'OK' : `ERROR${result.status ? ` (${result.status})` : ''}`}
        </span>
      </div>
      <pre
        className="p-3 overflow-x-auto max-h-40 overflow-y-auto font-mono"
        style={{ color: 'var(--foreground)' }}
      >
        {JSON.stringify(result.data, null, 2)}
      </pre>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--muted-foreground)' }}>
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </h2>
      {children}
    </div>
  );
}

function ActionButton({ onClick, loading, children }: { onClick: () => void; loading: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
      style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
      {children}
    </button>
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

  function handleScenarioChange(newScenario: MockScenario) {
    setMockScenario(newScenario);
    setScenarioState(newScenario);
  }

  const scenarios: { value: MockScenario; label: string; description: string }[] = [
    { value: 'happy', label: 'Happy Path', description: '7 products, checkout success included' },
    { value: 'loading', label: 'Loading State', description: '2s delay to see loading UI' },
    { value: 'empty', label: 'Empty State', description: 'Empty catalog, no orders' },
    { value: 'error', label: 'API Error', description: 'Simulates 500/503 failures' },
    { value: 'cart-filled', label: 'Cart Filled', description: '3 items pre-added to cart' },
    { value: 'checkout-failure', label: 'Checkout Fail', description: 'Checkout always fails' },
  ];

  return (
    <Card title="Demo Guide" icon={BookOpen}>
      {/* Demo Mode Status */}
      <div
        className="p-3 rounded-md text-sm"
        style={{
          backgroundColor: isDemoMode ? 'rgba(234, 179, 8, 0.1)' : 'var(--secondary)',
          borderColor: isDemoMode ? 'var(--warning)' : 'var(--border)',
          border: '1px solid',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
            <FlaskConical className="h-4 w-4" />
            Demo Mode
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: isDemoMode ? 'var(--warning)' : 'var(--secondary)',
              color: isDemoMode ? 'var(--warning-foreground)' : 'var(--muted-foreground)',
            }}
          >
            {isDemoMode ? 'Active' : 'Off'}
          </span>
        </div>
        <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
          {isDemoMode
            ? 'Using mock data. All API calls return local fixtures.'
            : 'Connecting to real BFF. Enable demo mode to explore without backend.'}
        </p>
        <button
          onClick={() => setDemoMode(!isDemoMode)}
          className="text-xs font-medium underline"
          style={{ color: 'var(--primary)' }}
        >
          {isDemoMode ? 'Disable Demo Mode' : 'Enable Demo Mode'}
        </button>
      </div>

      {/* Scenario Selector (only in demo mode) */}
      {isDemoMode && (
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>
            Mock Scenario
          </label>
          <div className="grid grid-cols-2 gap-2">
            {scenarios.map((s) => (
              <button
                key={s.value}
                onClick={() => handleScenarioChange(s.value)}
                className="text-left p-2 rounded-md text-xs transition-colors border"
                style={{
                  backgroundColor: scenario === s.value ? 'var(--primary)' : 'var(--background)',
                  color: scenario === s.value ? 'var(--primary-foreground)' : 'var(--foreground)',
                  borderColor: scenario === s.value ? 'var(--primary)' : 'var(--border)',
                }}
              >
                <div className="font-medium">{s.label}</div>
                <div
                  className="text-[10px] mt-0.5"
                  style={{ color: scenario === s.value ? 'var(--primary-foreground)' : 'var(--muted-foreground)', opacity: 0.8 }}
                >
                  {s.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Test Links */}
      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>
          Quick Navigation
        </label>
        <div className="flex flex-wrap gap-2">
          <a href="/" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium" style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
            <ShoppingCart className="h-3 w-3" /> Catalog
          </a>
          <a href="/cart" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium" style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
            <ShoppingCart className="h-3 w-3" /> Cart
          </a>
          <a href={`/orders/${sampleOrderId}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium" style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
            <Package className="h-3 w-3" /> Sample Order
          </a>
          <a href="/visualizer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium" style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
            <Zap className="h-3 w-3" /> 3D Visualizer
          </a>
        </div>
      </div>

      {/* Visualizer Note */}
      <div
        className="p-2 rounded text-xs"
        style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
      >
        <strong style={{ color: 'var(--foreground)' }}>Visualizer states:</strong> Controlled by{' '}
        <code className="px-1 rounded" style={{ backgroundColor: 'var(--background)' }}>
          NEXT_PUBLIC_VISUALIZER_URL
        </code>{' '}
        env var, not by mock scenarios. Set it to see the iframe; unset it to see the configuration state.
      </div>
    </Card>
  );
}

function PerformanceInfoPanel() {
  return (
    <Card title="Performance Playground" icon={Gauge}>
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          The Performance Playground presents simulated request activity for design
          evaluation. It is not a monitoring dashboard or a live telemetry surface.
        </p>

        {/* Current State */}
        <div
          className="p-3 rounded-md"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--info)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
              Mock Data Mode
            </span>
            <span
              className="px-2 py-0.5 text-xs font-medium rounded-full"
              style={{ backgroundColor: 'var(--info)', color: 'var(--info-foreground)' }}
            >
              Active
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            All performance data is currently deterministic mock data for design validation.
          </p>
        </div>

        {/* Scenario Types */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>
            Available Mock Scenarios
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { name: 'Browsing Load', intensity: 'low' },
              { name: 'Checkout Spike', intensity: 'high' },
              { name: 'Mixed User Journey', intensity: 'medium' },
              { name: 'Catalog Stress', intensity: 'stress' },
              { name: 'Order Lookup Pressure', intensity: 'medium' },
              { name: 'Error Injection', intensity: 'low' },
            ].map((scenario) => (
              <div
                key={scenario.name}
                className="px-2 py-1.5 rounded"
                style={{ backgroundColor: 'var(--secondary)' }}
              >
                <span style={{ color: 'var(--foreground)' }}>{scenario.name}</span>
                <span
                  className="ml-1.5 text-[10px] uppercase"
                  style={{
                    color:
                      scenario.intensity === 'stress'
                        ? 'var(--destructive)'
                        : scenario.intensity === 'high'
                          ? 'var(--warning)'
                          : scenario.intensity === 'medium'
                            ? 'var(--info)'
                            : 'var(--success)',
                  }}
                >
                  {scenario.intensity}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Future Integration */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>
            Potential Data Adapters
          </label>
          <div className="space-y-1.5 text-xs">
            {[
              { label: 'k6 summary JSON parsing', status: 'planned' },
              { label: 'Observable metric source', status: 'planned' },
              { label: 'CI performance artifacts', status: 'planned' },
              { label: 'Measured service metrics', status: 'planned' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span style={{ color: 'var(--foreground)' }}>{item.label}</span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Link */}
        <Link
          href="/performance"
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <Gauge className="h-4 w-4" />
          Open Performance Playground
        </Link>

      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Frontend Readiness Panel
// ---------------------------------------------------------------------------

function ReadinessPanel() {
  const readinessItems = [
    { label: 'Product catalog', status: 'wired', note: 'GET /catalog/products' },
    { label: 'Product detail', status: 'wired', note: 'GET /catalog/products/:id' },
    { label: 'Cart view', status: 'wired', note: 'GET /cart' },
    { label: 'Add to cart', status: 'wired', note: 'POST /cart/items' },
    { label: 'Checkout', status: 'wired', note: 'POST /checkout' },
    { label: 'Order lookup', status: 'wired', note: 'GET /orders/:id' },
    { label: 'Order management', status: 'wired', note: 'POST /orders/:id/manage' },
    { label: 'Health check', status: 'wired', note: 'GET /health' },
    { label: 'Order list', status: 'wired', note: 'GET /orders' },
    { label: 'Update quantity', status: 'wired', note: 'PATCH /cart/items/:id' },
    { label: 'Remove cart item', status: 'wired', note: 'DELETE /cart/items/:id' },
    { label: '3D Visualizer', status: 'embed', note: 'Same-origin /viz proxy → internal network' },
  ];

  return (
    <Card title="Frontend Readiness" icon={Heart}>
      <div className="space-y-1.5 text-xs">
        {readinessItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-1">
            <span style={{ color: 'var(--foreground)' }}>{item.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                {item.note}
              </span>
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor:
                    item.status === 'wired'
                      ? 'rgba(34, 197, 94, 0.2)'
                      : item.status === 'mock'
                        ? 'rgba(234, 179, 8, 0.2)'
                        : 'rgba(59, 130, 246, 0.2)',
                  color:
                    item.status === 'wired'
                      ? 'var(--success)'
                      : item.status === 'mock'
                        ? 'var(--warning)'
                        : 'var(--info)',
                }}
              >
                {item.status}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
        <p>
          <strong style={{ color: 'var(--foreground)' }}>wired</strong> = calls real BFF endpoint |{' '}
          <strong style={{ color: 'var(--foreground)' }}>mock</strong> = frontend-only fixture behavior |{' '}
          <strong style={{ color: 'var(--foreground)' }}>embed</strong> = external app integration
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API Debug Cards
// ---------------------------------------------------------------------------

function HealthCard() {
  const { result, loading, call } = useApiCall();
  return (
    <Card title="Health Check" icon={Activity}>
      <ActionButton onClick={() => call(() => expressoApi.getHealth())} loading={loading}>
        GET /health
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

function CatalogCard({ products, onLoaded }: { products: ReadonlyArray<Product> | null; onLoaded: (items: ReadonlyArray<Product>) => void }) {
  const { result, loading, call } = useApiCall();

  async function load() {
    await call(async () => {
      const response = await expressoApi.getProducts();
      onLoaded(response.items);
      return response;
    });
  }

  return (
    <Card title="Catalog - Load Products">
      <ActionButton onClick={load} loading={loading}>
        GET /catalog/products
      </ActionButton>
      {products && products.length > 0 && (
        <ul
          className="text-xs divide-y rounded-md overflow-hidden max-h-32 overflow-y-auto"
          style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
        >
          {products.map((p) => (
            <li key={p.productId} className="px-3 py-2 flex justify-between">
              <span style={{ color: 'var(--foreground)' }}>{p.name}</span>
              <span className="font-mono" style={{ color: 'var(--muted-foreground)' }}>
                {(p.price.amountMinor / 100).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ResponseBox result={result} />
    </Card>
  );
}

function AddToCartCard({ products }: { products: ReadonlyArray<Product> | null }) {
  const { result, loading, call } = useApiCall();
  const [productId, setProductId] = useState('prod_espresso_001');
  const [quantity, setQuantity] = useState(1);

  return (
    <Card title="Cart - Add Item">
      <div className="space-y-2">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
            Product
          </label>
          {products && products.length > 0 ? (
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-2 py-1.5 rounded text-xs border"
              style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              {products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="prod_espresso_001"
              className="w-full px-2 py-1.5 rounded text-xs border"
              style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          )}
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
            Quantity
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
        </div>
      </div>
      <ActionButton onClick={() => call(() => expressoApi.addCartItem({ productId, quantity }))} loading={loading}>
        POST /cart/items
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

function ViewCartCard() {
  const { result, loading, call } = useApiCall();
  return (
    <Card title="Cart - View">
      <ActionButton onClick={() => call(() => expressoApi.getCart())} loading={loading}>
        GET /cart
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

function CartMutateCard() {
  const { result, loading, call } = useApiCall();
  const [itemId, setItemId] = useState('ci_001');
  const [quantity, setQuantity] = useState(2);

  return (
    <Card title="Cart - Update / Remove">
      <div className="space-y-2">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
            Item ID
          </label>
          <input
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder="ci_001"
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
            Quantity
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <ActionButton
          onClick={() => call(() => expressoApi.updateCartItem(itemId, { quantity }))}
          loading={loading}
        >
          PATCH /cart/items/:id
        </ActionButton>
        <ActionButton
          onClick={() => call(() => expressoApi.removeCartItem(itemId))}
          loading={loading}
        >
          DELETE /cart/items/:id
        </ActionButton>
      </div>
      <ResponseBox result={result} />
    </Card>
  );
}

function CheckoutCard() {
  const { result, loading, call } = useApiCall();
  const [customerName, setCustomerName] = useState('Alex Demo');

  return (
    <Card title="Checkout">
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
          Customer name
        </label>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Alex Demo"
          className="w-full px-2 py-1.5 rounded text-xs border"
          style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        />
      </div>
      <ActionButton onClick={() => call(() => expressoApi.checkout({ customerName }))} loading={loading}>
        POST /checkout
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

function OrderLookupCard() {
  const { result, loading, call } = useApiCall();
  const [orderId, setOrderId] = useState(getSampleOrderId());

  return (
    <Card title="Order - Lookup">
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
          Order ID
        </label>
        <input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="w-full px-2 py-1.5 rounded text-xs border"
          style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        />
      </div>
      <ActionButton onClick={() => call(() => expressoApi.getOrderById(orderId))} loading={loading}>
        GET /orders/:id
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

function OrderManageCard() {
  const { result, loading, call } = useApiCall();
  const [orderId, setOrderId] = useState(getSampleOrderId());
  const [action, setAction] = useState<'cancel' | 'update_status' | 'mark_prepared'>('mark_prepared');
  const [nextStatus, setNextStatus] = useState<'pending' | 'preparing' | 'prepared' | 'cancelled'>('preparing');

  return (
    <Card title="Order - Manage">
      <div className="space-y-2">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
            Order ID
          </label>
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
            Action
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
          >
            <option value="mark_prepared">mark_prepared</option>
            <option value="cancel">cancel</option>
            <option value="update_status">update_status</option>
          </select>
        </div>
        {action === 'update_status' && (
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
              Next status
            </label>
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as typeof nextStatus)}
              className="w-full px-2 py-1.5 rounded text-xs border"
              style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              <option value="pending">pending</option>
              <option value="preparing">preparing</option>
              <option value="prepared">prepared</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
        )}
      </div>
      <ActionButton
        onClick={() =>
          call(() =>
            expressoApi.manageOrder(orderId, {
              action,
              ...(action === 'update_status' ? { nextStatus } : {}),
            })
          )
        }
        loading={loading}
      >
        POST /orders/:id/manage
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DevPage() {
  const [products, setProducts] = useState<ReadonlyArray<Product> | null>(null);
  // The browser talks to the web app's own /api/bff proxy, which rewrites to
  // the BFF container over the internal network (unless explicitly overridden).
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/bff → bff (internal)';
  const isDemoMode = getDemoModeStatus();

  return (
    <div className="container py-8">
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-5 w-5" style={{ color: 'var(--primary)' }} />
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>
            Developer Tools
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          API debug console, demo controls, and frontend readiness status.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span
            className="text-xs font-mono px-2 py-1 rounded"
            style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
          >
            {apiBase}
          </span>
          {isDemoMode && (
            <span
              className="text-xs px-2 py-1 rounded font-medium"
              style={{ backgroundColor: 'var(--warning)', color: 'var(--warning-foreground)' }}
            >
              Demo Mode
            </span>
          )}
        </div>
      </header>

      {/* Demo Guide and Readiness - prominently displayed */}
      <div className="grid gap-4 mb-8 lg:grid-cols-2">
        <DemoGuidePanel />
        <ReadinessPanel />
      </div>

      {/* Performance mock-data guidance */}
      <div className="mb-8">
        <PerformanceInfoPanel />
      </div>

      {/* API Debug Cards */}
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
        API Debug Console
      </h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        <HealthCard />
        <CatalogCard products={products} onLoaded={setProducts} />
        <AddToCartCard products={products} />
        <ViewCartCard />
        <CartMutateCard />
        <CheckoutCard />
        <OrderLookupCard />
        <OrderManageCard />
      </div>
    </div>
  );
}
