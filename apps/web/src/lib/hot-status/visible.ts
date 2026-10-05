import type { HotStatusResponse } from "@/lib/api/expresso-api";

export interface HotStatusSnapshot {
  status: HotStatusResponse;
  // serverTime − client clock at receipt.
  skewMs: number;
}

// SWR keeps the last data after an error; the banner must not.
export function pickVisible(
  signedIn: boolean,
  data: HotStatusSnapshot | undefined,
  error: unknown,
): HotStatusSnapshot | null {
  if (!signedIn || error || !data || data.status.hotCount < 1) return null;
  return data;
}
