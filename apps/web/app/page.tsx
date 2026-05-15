'use client';

import { useState } from 'react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

type ApiResult = { ok: boolean; data: unknown };

function useApiCall() {
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function call(fn: () => Promise<Response>) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fn();
      const data = await res.json().catch(() => null);
      setResult({ ok: res.ok, data });
    } catch (err) {
      setResult({ ok: false, data: { error: (err as Error).message } });
    } finally {
      setLoading(false);
    }
  }

  return { result, loading, call };
}

function ResponseBox({ result }: { result: ApiResult | null }) {
  if (!result) return null;
  return (
    <div className="response">
      <div className={`response-status ${result.ok ? 'ok' : 'err'}`}>
        {result.ok ? 'OK' : 'ERROR'}
      </div>
      <pre>{JSON.stringify(result.data, null, 2)}</pre>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function HealthCard() {
  const { result, loading, call } = useApiCall();

  return (
    <Card title="Health Check">
      <button
        className="action"
        disabled={loading}
        onClick={() => call(() => fetch(`${API_BASE}/health`))}
      >
        {loading ? 'Checking…' : 'GET /health'}
      </button>
      <ResponseBox result={result} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Catalog: load products
// ---------------------------------------------------------------------------

type Product = {
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price: { amountMinor: number; currency: string };
  inventory: number;
};

function formatPrice(p: Product['price']): string {
  return `${(p.amountMinor / 100).toFixed(2)} ${p.currency}`;
}

function CatalogCard({
  products,
  onLoaded,
}: {
  products: Product[] | null;
  onLoaded: (items: Product[]) => void;
}) {
  const { result, loading, call } = useApiCall();

  async function load() {
    await call(async () => {
      const res = await fetch(`${API_BASE}/catalog/products`);
      const data = await res.json();
      if (res.ok && Array.isArray(data?.items)) {
        onLoaded(data.items as Product[]);
      }
      // Re-emit response for the box.
      return new Response(JSON.stringify(data), { status: res.status });
    });
  }

  return (
    <Card title="Catalog — Load Products">
      <button className="action" disabled={loading} onClick={load}>
        {loading ? 'Loading…' : 'GET /catalog/products'}
      </button>
      {products && products.length > 0 && (
        <ul className="product-list">
          {products.map((p) => (
            <li key={p.productId}>
              <span className="product-name">{p.name}</span>
              <span className="product-meta">
                {p.category} · {formatPrice(p.price)} · stock {p.inventory}
              </span>
              <span className="product-id">{p.productId}</span>
            </li>
          ))}
        </ul>
      )}
      <ResponseBox result={result} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Add to cart
// ---------------------------------------------------------------------------

function AddToCartCard({ products }: { products: Product[] | null }) {
  const { result, loading, call } = useApiCall();
  const [productId, setProductId] = useState('prod_espresso');
  const [quantity, setQuantity] = useState(1);

  return (
    <Card title="Cart — Add Item">
      <div className="field">
        <label>Product</label>
        {products && products.length > 0 ? (
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.name} ({p.productId})
              </option>
            ))}
          </select>
        ) : (
          <input
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="prod_espresso"
          />
        )}
      </div>
      <div className="field">
        <label>Quantity</label>
        <input
          type="number"
          min={1}
          max={20}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </div>
      <button
        className="action"
        disabled={loading}
        onClick={() =>
          call(() =>
            fetch(`${API_BASE}/cart/items`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ productId, quantity }),
            }),
          )
        }
      >
        {loading ? 'Adding…' : 'POST /cart/items'}
      </button>
      <ResponseBox result={result} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// View cart
// ---------------------------------------------------------------------------

function ViewCartCard() {
  const { result, loading, call } = useApiCall();

  return (
    <Card title="Cart — View">
      <button
        className="action"
        disabled={loading}
        onClick={() => call(() => fetch(`${API_BASE}/cart`))}
      >
        {loading ? 'Loading…' : 'GET /cart'}
      </button>
      <ResponseBox result={result} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

function CheckoutCard() {
  const { result, loading, call } = useApiCall();
  const [customerName, setCustomerName] = useState('Alex Demo');

  return (
    <Card title="Checkout">
      <div className="field">
        <label>Customer name</label>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Alex Demo"
        />
      </div>
      <button
        className="action"
        disabled={loading}
        onClick={() =>
          call(() =>
            fetch(`${API_BASE}/checkout`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ customerName }),
            }),
          )
        }
      >
        {loading ? 'Submitting…' : 'POST /checkout'}
      </button>
      <ResponseBox result={result} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Order lookup
// ---------------------------------------------------------------------------

function OrderLookupCard() {
  const { result, loading, call } = useApiCall();
  const [orderId, setOrderId] = useState('ord_demo');

  return (
    <Card title="Order — Lookup">
      <div className="field">
        <label>Order ID</label>
        <input value={orderId} onChange={(e) => setOrderId(e.target.value)} />
      </div>
      <button
        className="action"
        disabled={loading}
        onClick={() => call(() => fetch(`${API_BASE}/orders/${orderId}`))}
      >
        {loading ? 'Loading…' : 'GET /orders/:id'}
      </button>
      <ResponseBox result={result} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Order management
// ---------------------------------------------------------------------------

function OrderManageCard() {
  const { result, loading, call } = useApiCall();
  const [orderId, setOrderId] = useState('ord_demo');
  const [action, setAction] =
    useState<'cancel' | 'update_status' | 'mark_prepared'>('mark_prepared');
  const [nextStatus, setNextStatus] =
    useState<'pending' | 'preparing' | 'prepared' | 'cancelled'>('preparing');
  const [reason, setReason] = useState('');

  return (
    <Card title="Order — Manage">
      <div className="field">
        <label>Order ID</label>
        <input value={orderId} onChange={(e) => setOrderId(e.target.value)} />
      </div>
      <div className="field">
        <label>Action</label>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
        >
          <option value="mark_prepared">mark_prepared</option>
          <option value="cancel">cancel</option>
          <option value="update_status">update_status</option>
        </select>
      </div>
      {action === 'update_status' && (
        <div className="field">
          <label>Next status</label>
          <select
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as typeof nextStatus)}
          >
            <option value="pending">pending</option>
            <option value="preparing">preparing</option>
            <option value="prepared">prepared</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
      )}
      <div className="field">
        <label>Reason (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. customer request"
        />
      </div>
      <button
        className="action"
        disabled={loading}
        onClick={() =>
          call(() =>
            fetch(`${API_BASE}/orders/${orderId}/manage`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                action,
                ...(action === 'update_status' ? { nextStatus } : {}),
                ...(reason ? { reason } : {}),
              }),
            }),
          )
        }
      >
        {loading ? 'Submitting…' : 'POST /orders/:id/manage'}
      </button>
      <ResponseBox result={result} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  // Lift catalog state so the "Add to cart" card can use product ids as a
  // dropdown after products are loaded.
  const [products, setProducts] = useState<Product[] | null>(null);

  return (
    <main className="page">
      <header className="page-header">
        <h1>Mini Commerce Playground</h1>
        <p className="api-url">API: {API_BASE}</p>
      </header>

      <div className="grid">
        <HealthCard />
        <CatalogCard products={products} onLoaded={setProducts} />
        <AddToCartCard products={products} />
        <ViewCartCard />
        <CheckoutCard />
        <OrderLookupCard />
        <OrderManageCard />
      </div>
    </main>
  );
}
