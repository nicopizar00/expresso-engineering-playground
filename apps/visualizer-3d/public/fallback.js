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
    temperatureCounts: { hot: 0, cold: 0 },
  },
  cart: {
    itemCount: 1,
    total: { amountMinor: 180, currency: "EUR" },
    updatedAt: Date.now(),
  },
  latestActivityAt: Date.now(),
};
