"use client";

/**
 * AuthProvider - signed-in user state for the whole app.
 *
 * SWR on GET /me. Any failure (including a 404 from an API mock that
 * predates auth) reads as signed out. Each action revalidates every
 * orders-* SWR key so the order lists follow the identity change.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  expressoApi,
  type AuthUser,
  type LoginRequest,
  type MeResponse,
  type RegisterRequest,
} from "@/lib/api/expresso-api";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login(input: LoginRequest): Promise<AuthUser>;
  register(input: RegisterRequest): Promise<AuthUser>;
  logout(): Promise<void>;
  /** Revalidate GET /me (e.g. after a 401 from another endpoint). */
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, error, mutate } = useSWR<MeResponse, Error>(
    "auth-me",
    () => expressoApi.getMe(),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const { mutate: globalMutate } = useSWRConfig();

  const refreshOrders = useCallback(() => {
    void globalMutate(
      (key) => typeof key === "string" && key.startsWith("orders"),
      undefined,
      { revalidate: true },
    );
  }, [globalMutate]);

  const signedIn = useCallback(
    async (user: AuthUser) => {
      await mutate({ user }, { revalidate: false });
      refreshOrders();
      return user;
    },
    [mutate, refreshOrders],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data?.user ?? null,
      isLoading: data === undefined && !error,
      login: async (input) => signedIn(await expressoApi.login(input)),
      register: async (input) => signedIn(await expressoApi.register(input)),
      refresh: async () => {
        await mutate();
      },
      logout: async () => {
        await expressoApi.logout();
        await mutate({ user: null }, { revalidate: false });
        refreshOrders();
      },
    }),
    [data, error, mutate, refreshOrders, signedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
