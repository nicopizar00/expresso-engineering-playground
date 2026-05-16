'use client';

import { createContext, useContext, useCallback, ReactNode } from 'react';
import useSWR from 'swr';
import { expressoApi, Cart, AddCartItemInput } from '@/lib/api/expresso-api';

// View model for cart display
export interface CartViewModel {
  cart: Cart | null;
  isLoading: boolean;
  error: Error | null;
  itemCount: number;
  formattedTotal: string;
  isEmpty: boolean;
  addItem: (input: AddCartItemInput) => Promise<void>;
  refreshCart: () => void;
}

const CartContext = createContext<CartViewModel | null>(null);

async function fetchCart(): Promise<Cart> {
  return expressoApi.getCart();
}

function formatMoney(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { data: cart, error, isLoading, mutate } = useSWR<Cart, Error>(
    'cart',
    fetchCart,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const addItem = useCallback(
    async (input: AddCartItemInput) => {
      const updatedCart = await expressoApi.addCartItem(input);
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
    formattedTotal: cart ? formatMoney(cart.total.amountMinor, cart.total.currency) : '0.00 USD',
    isEmpty: !cart || cart.items.length === 0,
    addItem,
    refreshCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartViewModel {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
