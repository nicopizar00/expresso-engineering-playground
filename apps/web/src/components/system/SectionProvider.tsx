"use client";

/**
 * SectionProvider - single source of truth for which app section is showing
 *
 * The whole app is one route (`/`); "navigation" between Catalog, Orders,
 * Performance, and API Debug is a client-side section switch, not a page
 * load. The active section lives in the `?tab=` query param so refresh,
 * back/forward, and copy-pasting the URL all still work.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type SectionId = "catalog" | "orders" | "performance" | "dev";

const SECTION_IDS: readonly SectionId[] = [
  "catalog",
  "orders",
  "performance",
  "dev",
];

interface SectionContextValue {
  section: SectionId;
  setSection: (id: SectionId) => void;
}

const SectionContext = createContext<SectionContextValue | null>(null);

function isSectionId(value: string | null): value is SectionId {
  return value !== null && (SECTION_IDS as readonly string[]).includes(value);
}

export function SectionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const section: SectionId = isSectionId(tabParam) ? tabParam : "catalog";

  const setSection = useCallback(
    (id: SectionId) => {
      router.push(`/?tab=${id}`);
    },
    [router],
  );

  const value = useMemo(() => ({ section, setSection }), [section, setSection]);

  return (
    <SectionContext.Provider value={value}>{children}</SectionContext.Provider>
  );
}

export function useSection(): SectionContextValue {
  const ctx = useContext(SectionContext);
  if (!ctx) {
    throw new Error("useSection must be used within a SectionProvider");
  }
  return ctx;
}
