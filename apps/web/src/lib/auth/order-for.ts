import type { OrderFor } from "@mini-commerce/contracts";
import { parseRecipient } from "./identity";

export type OrderForChoice = "self" | "guest" | "user";

export function defaultOrderForChoice(signedIn: boolean): OrderForChoice {
  return signedIn ? "self" : "guest";
}

// Validates on the client for instant feedback, then sends the recipient
// as typed (trimmed); the BFF normalizes it.
export function buildOrderFor(
  choice: OrderForChoice,
  recipient: string,
  signedIn: boolean,
): { ok: true; value: OrderFor } | { ok: false; error: string } {
  if (choice === "self") {
    return signedIn
      ? { ok: true, value: { type: "self" } }
      : { ok: false, error: "Sign in to order for yourself" };
  }
  if (choice === "guest") {
    return { ok: true, value: { type: "guest" } };
  }
  const trimmed = recipient.trim();
  return parseRecipient(trimmed)
    ? { ok: true, value: { type: "user", recipient: trimmed } }
    : { ok: false, error: "Enter a username (3-32 chars) or an email" };
}
