"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useAuth } from "@/components/auth/AuthProvider";
import { expressoApi, ExpressoApiError } from "@/lib/api/expresso-api";
import { clockSkewMs, refetchDelayMs } from "./countdown";
import { pickVisible, type HotStatusSnapshot } from "./visible";

// "orders" prefix: AuthProvider revalidates every orders* key on sign-in.
export const HOT_STATUS_KEY = "orders-hot-status";
export const HOT_STATUS_POLL_MS = 15_000;

export function useHotStatus(): HotStatusSnapshot | null {
  const { user, refresh } = useAuth();
  const { data, error, mutate } = useSWR<HotStatusSnapshot, Error>(
    user ? HOT_STATUS_KEY : null,
    async () => {
      try {
        const status = await expressoApi.getHotStatus();
        return { status, skewMs: clockSkewMs(status.serverTime, Date.now()) };
      } catch (err) {
        // The BFF already cleared the cookie; drop the stale user.
        if (err instanceof ExpressoApiError && err.status === 401) {
          void refresh().catch(() => undefined);
        }
        throw err;
      }
    },
    {
      refreshInterval: HOT_STATUS_POLL_MS,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );

  const nextCoolsAt = data?.status.nextCoolsAt ?? null;
  const skewMs = data?.skewMs ?? 0;
  useEffect(() => {
    if (!nextCoolsAt) return;
    const delay = refetchDelayMs(
      nextCoolsAt,
      Date.now(),
      skewMs,
      HOT_STATUS_POLL_MS,
    );
    if (delay === null) return;
    const id = setTimeout(() => void mutate(), delay);
    return () => clearTimeout(id);
  }, [nextCoolsAt, skewMs, mutate]);

  return pickVisible(Boolean(user), data, error);
}
