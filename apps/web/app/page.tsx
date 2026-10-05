"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { expressoApi, ProductsResponse } from "@/lib/api/expresso-api";
import { ProductCatalogGrid } from "@/components/catalog/ProductCatalogGrid";
import { CatalogGridSkeleton } from "@/components/system/LoadingSkeleton";
import { PageErrorState } from "@/components/system/ErrorBanner";
import { EmptyState } from "@/components/system/EmptyState";
import { CartCheckoutPanel } from "@/components/cart/CartCheckoutPanel";
import { VisualizerEmbed } from "@/components/visualizer/VisualizerEmbed";
import {
  OrdersSection,
  type OrdersScope,
} from "@/components/sections/OrdersSection";
import { PerformanceSection } from "@/components/sections/PerformanceSection";
import { DevSection } from "@/components/sections/DevSection";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSection } from "@/components/system/SectionProvider";
import { Sparkles } from "lucide-react";

async function fetchProducts(): Promise<ProductsResponse> {
  return expressoApi.getProducts();
}

export default function HomeWorkspace() {
  const { section, setSection } = useSection();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [ordersScope, setOrdersScope] = useState<OrdersScope>("mine");
  // Kept (unlike justPlacedOrderId) so the detail can show the success
  // banner for the order this browser just placed.
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [justPlacedOrderId, setJustPlacedOrderId] = useState<string | null>(
    null,
  );

  const { data, error, isLoading, mutate } = useSWR<ProductsResponse, Error>(
    "products",
    fetchProducts,
    { revalidateOnFocus: false },
  );

  const { user, isLoading: authLoading } = useAuth();
  // undefined until /auth/me first resolves, so a signed-in page load
  // defaults to the Account tab without jumping sections.
  const prevUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (authLoading) return;
    const current = user?.username ?? null;
    const prev = prevUser.current;
    prevUser.current = current;
    if (prev === undefined) {
      if (current) setOrdersScope("account");
      return;
    }
    if (!prev && current) {
      setSelectedOrderId(null);
      setOrdersScope("account");
      setSection("orders");
    } else if (prev && !current) {
      setOrdersScope((s) => (s === "account" ? "mine" : s));
    }
  }, [user, authLoading, setSection]);

  const productCount = data?.items.length ?? 0;

  const handleOrderPlaced = useCallback(
    (orderId: string, forSelf: boolean) => {
      setSelectedOrderId(orderId);
      setOrdersScope(forSelf ? "account" : "mine");
      setPlacedOrderId(orderId);
      // Held briefly so VisualizerEmbed can tell "cart just emptied because
      // Place Order succeeded" from "cart emptied because the reservation
      // expired" and only animate the hero cup for the former.
      setJustPlacedOrderId(orderId);
      setTimeout(() => setJustPlacedOrderId(null), 1000);
      setSection("orders");
    },
    [setSection],
  );

  return (
    <div className="home-stage">
      <div
        className={`home-stage-strip${section !== "catalog" ? " home-stage-strip--full" : ""}`}
      >
        {section === "catalog" && (
          <>
            <section
              className="home-stage-catalog"
              aria-label="Product catalog"
              data-testid="home-catalog"
            >
              <header className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h1
                    className="text-lg font-semibold tracking-tight"
                    style={{ color: "var(--foreground)" }}
                  >
                    Catalog
                  </h1>
                  <p
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Browse, add, and watch the counter react.
                  </p>
                </div>
                {productCount > 0 && (
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium tone-muted"
                    data-testid="home-product-count"
                  >
                    <Sparkles
                      className="h-3 w-3"
                      style={{ color: "var(--primary)" }}
                    />
                    {productCount} products
                  </span>
                )}
              </header>

              {isLoading ? (
                <CatalogGridSkeleton count={6} />
              ) : error ? (
                <PageErrorState
                  title="Failed to load products"
                  message={
                    error.message ||
                    "Could not connect to the BFF. Try enabling Demo Mode or make sure it is running on port 3001."
                  }
                  onRetry={() => mutate()}
                />
              ) : !data || data.items.length === 0 ? (
                <EmptyState
                  variant="products"
                  action={{ label: "Refresh", onClick: () => mutate() }}
                />
              ) : (
                <ProductCatalogGrid products={data.items} />
              )}
            </section>

            <aside className="home-stage-cart" aria-label="Cart and checkout">
              <CartCheckoutPanel onOrderPlaced={handleOrderPlaced} />
            </aside>
          </>
        )}

        {section === "orders" && (
          <div className="home-stage-section" data-testid="home-orders">
            <OrdersSection
              selectedOrderId={selectedOrderId}
              placedOrderId={placedOrderId}
              scope={ordersScope}
              onScopeChange={setOrdersScope}
              onSelect={setSelectedOrderId}
              onBack={() => {
                setSelectedOrderId(null);
                // The success banner is only for the just-placed visit.
                setPlacedOrderId(null);
              }}
            />
          </div>
        )}

        {section === "performance" && (
          <div className="home-stage-section" data-testid="home-performance">
            <PerformanceSection />
          </div>
        )}

        {section === "dev" && (
          <div className="home-stage-section" data-testid="home-dev">
            <DevSection
              onOpenCatalog={() => setSection("catalog")}
              onOpenOrders={() => setSection("orders")}
              onOpenPerformance={() => setSection("performance")}
            />
          </div>
        )}
      </div>

      <section className="home-stage-viz" aria-label="3D order counter">
        <VisualizerEmbed
          embed
          fill
          title="Order counter"
          justPlacedOrderId={justPlacedOrderId}
        />
      </section>
    </div>
  );
}
