'use client';

// Developer API debug page.
//
// This page provides a utilitarian interface to test all BFF endpoints directly.
// It is intentionally kept simple for debugging purposes.

import { useState } from 'react';
import { Activity, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { expressoApi, Product, ExpressoApiError } from '@/lib/api/expresso-api';

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
        {result.ok ? (
          <CheckCircle className="h-3 w-3" />
        ) : (
          <XCircle className="h-3 w-3" />
        )}
        <span className="font-semibold">
          {result.ok ? 'OK' : `ERROR${result.status ? ` (${result.status})` : ''}`}
        </span>
      </div>
      <pre 
        className="p-3 overflow-x-auto max-h-60 overflow-y-auto font-mono"
        style={{ color: 'var(--foreground)' }}
      >
        {JSON.stringify(result.data, null, 2)}
      </pre>
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
    <div 
      className="rounded-lg border p-4 space-y-3"
      style={{ 
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      <h2 
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function ActionButton({ 
  onClick, 
  loading, 
  children 
}: { 
  onClick: () => void; 
  loading: boolean; 
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
      style={{
        backgroundColor: 'var(--primary)',
        color: 'var(--primary-foreground)',
      }}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {children}
    </button>
  );
}

function HealthCard() {
  const { result, loading, call } = useApiCall();

  return (
    <Card title="Health Check">
      <ActionButton onClick={() => call(() => expressoApi.getHealth())} loading={loading}>
        GET /health
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
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
          className="text-xs divide-y rounded-md overflow-hidden max-h-40 overflow-y-auto"
          style={{ 
            backgroundColor: 'var(--secondary)',
            borderColor: 'var(--border)',
          }}
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

function AddToCartCard({ products }: { products: Product[] | null }) {
  const { result, loading, call } = useApiCall();
  const [productId, setProductId] = useState('prod_espresso');
  const [quantity, setQuantity] = useState(1);

  return (
    <Card title="Cart - Add Item">
      <div className="space-y-2">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Product</label>
          {products && products.length > 0 ? (
            <select 
              value={productId} 
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-2 py-1.5 rounded text-xs border"
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
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
              placeholder="prod_espresso"
              className="w-full px-2 py-1.5 rounded text-xs border"
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            />
          )}
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Quantity</label>
          <input
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
          />
        </div>
      </div>
      <ActionButton 
        onClick={() => call(() => expressoApi.addCartItem({ productId, quantity }))} 
        loading={loading}
      >
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

function CheckoutCard() {
  const { result, loading, call } = useApiCall();
  const [customerName, setCustomerName] = useState('Alex Demo');

  return (
    <Card title="Checkout">
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Customer name</label>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Alex Demo"
          className="w-full px-2 py-1.5 rounded text-xs border"
          style={{
            backgroundColor: 'var(--background)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        />
      </div>
      <ActionButton 
        onClick={() => call(() => expressoApi.checkout({ customerName }))} 
        loading={loading}
      >
        POST /checkout
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

function OrderLookupCard() {
  const { result, loading, call } = useApiCall();
  const [orderId, setOrderId] = useState('ord_demo');

  return (
    <Card title="Order - Lookup">
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Order ID</label>
        <input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="w-full px-2 py-1.5 rounded text-xs border"
          style={{
            backgroundColor: 'var(--background)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        />
      </div>
      <ActionButton 
        onClick={() => call(() => expressoApi.getOrderById(orderId))} 
        loading={loading}
      >
        GET /orders/:id
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

function OrderManageCard() {
  const { result, loading, call } = useApiCall();
  const [orderId, setOrderId] = useState('ord_demo');
  const [action, setAction] = useState<'cancel' | 'update_status' | 'mark_prepared'>('mark_prepared');
  const [nextStatus, setNextStatus] = useState<'pending' | 'preparing' | 'prepared' | 'cancelled'>('preparing');
  const [reason, setReason] = useState('');

  return (
    <Card title="Order - Manage">
      <div className="space-y-2">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Order ID</label>
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
          >
            <option value="mark_prepared">mark_prepared</option>
            <option value="cancel">cancel</option>
            <option value="update_status">update_status</option>
          </select>
        </div>
        {action === 'update_status' && (
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Next status</label>
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as typeof nextStatus)}
              className="w-full px-2 py-1.5 rounded text-xs border"
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            >
              <option value="pending">pending</option>
              <option value="preparing">preparing</option>
              <option value="prepared">prepared</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>Reason (optional)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. customer request"
            className="w-full px-2 py-1.5 rounded text-xs border"
            style={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
          />
        </div>
      </div>
      <ActionButton 
        onClick={() => call(() => expressoApi.manageOrder(orderId, {
          action,
          ...(action === 'update_status' ? { nextStatus } : {}),
          ...(reason ? { reason } : {}),
        }))} 
        loading={loading}
      >
        POST /orders/:id/manage
      </ActionButton>
      <ResponseBox result={result} />
    </Card>
  );
}

export default function DevPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

  return (
    <div className="container py-8">
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-5 w-5" style={{ color: 'var(--primary)' }} />
          <h1 
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--foreground)' }}
          >
            API Debug Console
          </h1>
        </div>
        <p 
          className="text-sm"
          style={{ color: 'var(--muted-foreground)' }}
        >
          Developer tools for testing BFF endpoints directly.
        </p>
        <p 
          className="text-xs font-mono mt-2 px-2 py-1 rounded inline-block"
          style={{ 
            backgroundColor: 'var(--secondary)',
            color: 'var(--muted-foreground)',
          }}
        >
          {apiBase}
        </p>
      </header>

      <div 
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
      >
        <HealthCard />
        <CatalogCard products={products} onLoaded={setProducts} />
        <AddToCartCard products={products} />
        <ViewCartCard />
        <CheckoutCard />
        <OrderLookupCard />
        <OrderManageCard />
      </div>
    </div>
  );
}
