import { createHash, randomBytes } from "node:crypto";

export const AUTH_COOKIE = "auth";
export const AUTH_SESSION_TTL_MS = Symbol("AUTH_SESSION_TTL_MS");
export const DEFAULT_SESSION_TTL_DAYS = 30;
const MAX_SESSION_TTL_DAYS = 365;

export interface AuthUser {
  readonly id: number;
  readonly username: string;
  readonly email: string;
}

// Same fail-fast contract as ORDER_COOL_DOWN_SECONDS: a bad value aborts
// bootstrap instead of minting sessions with a surprising lifetime.
export function parseSessionTtlDays(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_SESSION_TTL_DAYS;
  if (!/^[1-9]\d*$/.test(raw) || Number(raw) > MAX_SESSION_TTL_DAYS) {
    throw new Error(
      `AUTH_SESSION_TTL_DAYS must be an integer in 1..${MAX_SESSION_TTL_DAYS}, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
