'use client';

/**
 * CartProvider - Global cart state management
 *
 * Provides cart state and operations to all components via React Context.
 * Uses SWR for data fetching and cache management.
 *
 * TODO(state): Consider adding optimistic updates for better UX
 * TODO(api-wire): The BFF cart is session-based via cookies; ensure headers propagate
 * TODO(error-handling): Add retry logic and user-facing error toasts
 */

import { createContext, useContext, useCallback, ReactNode } from 'react';
import useSWR from 'swr';
import {
  expressoApi,
  Cart,
  AddCartItemInput,
  formatMoney,
} from '@/lib/api/expresso-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * View model for cart display.
 * Components should use this interface, not raw API types.
 */
export interface CartViewModel {
  /** Raw cart data from API (null while loading or on error) */
  cart: Cart | null;
  /** True while initial fetch is in progress */
  isLoading: boolean;
  /** Error from last fetch attempt */
  error: Error | null;
  /** Total number of items in cart */
  itemCount: number;
  /** Formatted total (e.g., "12.50 USD") */
  formattedTotal: string;
  /** True if cart has no items */
  isEmpty: boolean;
  /** Add an item to the cart */
  addItem: (input: AddCartItemInput) => Promise<void>;
  /** Update an existing line's quantity */
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  /** Remove a line from the cart */
  removeItem: (itemId: string) => Promise<void>;
  /** Trigger a cart refresh from the server */
  refreshCart: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CartContext = createContext<CartViewModel | null>(null);

async function fetchCart(): Promise<Cart> {
  return expressoApi.getCart();
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }: { children: ReactNode }) {
  const { data: cart, error, isLoading, mutate } = useSWR<Cart, Error>(
    'cart',
    fetchCart,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      // TODO(api-wire): Consider adding onError callback for toast notifications
    }
  );

  const addItem = useCallback(
    async (input: AddCartItemInput) => {
      // TODO(state): Add optimistic update here for instant feedback
      const updatedCart = await expressoApi.addCartItem(input);
      mutate(updatedCart, false);
    },
    [mutate]
  );

  const updateItem = useCallback(
    async (itemId: string, quantity: number) => {
      const updatedCart = await expressoApi.updateCartItem(itemId, { quantity });
      mutate(updatedCart, false);
    },
    [mutate]
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const updatedCart = await expressoApi.removeCartItem(itemId);
      mutate(updatedCart, false);
    },
    [mutate]
  );

  const refreshCart = useCallback(() => {
    mutate();
  }, [mutate]);

  const value: CartViewModel = {
    cart: cart ?? null,
    isLoading,
    error: error ?? null,
    itemCount: cart?.itemCount ?? 0,
    formattedTotal: cart
      ? formatMoney(cart.total.amountMinor, cart.total.currency)
      : '0.00 USD',
    isEmpty: !cart || cart.items.length === 0,
    addItem,
    updateItem,
    removeItem,
    refreshCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCart(): CartViewModel {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
