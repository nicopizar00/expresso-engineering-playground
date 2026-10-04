// Order temperature: "hot" for the cool-down window after placement (the
// moment the coffee is served), "cold" afterwards. Derived on read from
// placedAt — never persisted, no scheduler. See
// docs/next-steps/order-temperature.md.
import type { OrderTemperature } from "@mini-commerce/shared-types";

export const DEFAULT_COOL_DOWN_SECONDS = 300;
export const ORDER_COOL_DOWN_MS = Symbol("ORDER_COOL_DOWN_MS");

export function parseCoolDownSeconds(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_COOL_DOWN_SECONDS;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `ORDER_COOL_DOWN_SECONDS must be a positive integer, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

export function temperatureOf(
  placedAt: Date,
  now: Date,
  coolDownMs: number,
): OrderTemperature {
  return now.getTime() - placedAt.getTime() < coolDownMs ? "hot" : "cold";
}

export function coolsAt(placedAt: Date, coolDownMs: number): Date {
  return new Date(placedAt.getTime() + coolDownMs);
}
