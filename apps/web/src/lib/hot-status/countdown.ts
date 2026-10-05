// Pure countdown math for the hot coffee banner. Time is measured on the
// server's clock: skew = serverTime − client clock at receipt.

const REFETCH_GRACE_MS = 500;

export function clockSkewMs(
  serverTimeIso: string,
  clientNowMs: number,
): number {
  const server = Date.parse(serverTimeIso);
  return Number.isNaN(server) ? 0 : server - clientNowMs;
}

export function remainingMs(
  nextCoolsAtIso: string,
  clientNowMs: number,
  skewMs: number,
): number {
  const target = Date.parse(nextCoolsAtIso);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, target - (clientNowMs + skewMs));
}

export function formatRemaining(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Delay for the one-shot refetch just after the next coffee cools, or null
// when regular polling will refetch first. Returning null for long delays
// also keeps clear of setTimeout's 2^31-1 ms ceiling.
export function refetchDelayMs(
  nextCoolsAtIso: string,
  clientNowMs: number,
  skewMs: number,
  pollMs: number,
): number | null {
  if (Number.isNaN(Date.parse(nextCoolsAtIso))) return null;
  const delay =
    remainingMs(nextCoolsAtIso, clientNowMs, skewMs) + REFETCH_GRACE_MS;
  return delay > pollMs ? null : delay;
}

export function hotCountText(hotCount: number): string {
  return hotCount === 1 ? "1 hot coffee" : `${hotCount} hot coffees`;
}

export function coolsInText(hotCount: number): string {
  return hotCount === 1 ? "cools in" : "next one cools in";
}
