import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { AuthUser } from "../../core/auth/auth-session";
import { parseRecipient } from "../../core/auth/identity";

export type OrderForInput =
  | { type: "self" }
  | { type: "guest" }
  | { type: "user"; recipient?: string };

export interface OrderOwnerColumns {
  ownerUsername?: string;
  ownerEmail?: string;
}

// Who an order is for. Omitted → self when signed in, else guest (keeps
// smoke and k6 traffic, which never send orderFor, on the guest path). The
// recipient need not be registered: it is stored as a normalized string and
// matched when that user signs in.
export function resolveOrderOwner(
  orderFor: OrderForInput | undefined,
  user: AuthUser | null,
): OrderOwnerColumns {
  const type = orderFor?.type ?? (user ? "self" : "guest");
  switch (type) {
    case "guest":
      return {};
    case "self":
      if (!user) {
        throw new UnauthorizedException("sign in to order for yourself");
      }
      return { ownerUsername: user.username };
    case "user": {
      const raw = (orderFor as { recipient?: string }).recipient ?? "";
      const recipient = parseRecipient(raw);
      if (!recipient) {
        throw new BadRequestException({
          message: "recipient must be a valid username or email",
          field: "recipient",
        });
      }
      return "email" in recipient
        ? { ownerEmail: recipient.email }
        : { ownerUsername: recipient.username };
    }
  }
}
