// =============================================================================
// Fallback data — offline showcase, no backend required.
//
// Typed scene with a single non-empty cart → ceramic cup rendered as hero;
// exercises the same dispatcher as a live BFF.
// =============================================================================
export const FALLBACK_SCENE = {
  products: [],
  recentOrders: [],
  orderAggregates: {
    totalCount: 0,
    olderCount: 0,
    statusCounts: { pending: 0, preparing: 0, prepared: 0, cancelled: 0 },
  },
  cart: {
    itemCount: 1,
    total: { amountMinor: 180, currency: "EUR" },
    updatedAt: Date.now(),
  },
  latestActivityAt: Date.now(),
};
