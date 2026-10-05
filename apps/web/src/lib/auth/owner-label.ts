import type { OrderOwner } from "@mini-commerce/contracts";

export function ownerLabel(owner: OrderOwner): string {
  if (!owner) return "guest";
  return "username" in owner ? `for ${owner.username}` : `for ${owner.email}`;
}
