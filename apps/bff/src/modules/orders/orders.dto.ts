import { IsIn, IsOptional, IsString } from "class-validator";
import type { OrderStatus } from "@mini-commerce/shared-types";

// Set of supported management actions is intentionally tiny for this
// iteration; expand once the order state machine is real.
export class ManageOrderDto {
  @IsIn(["cancel", "update_status", "mark_prepared"])
  action!: "cancel" | "update_status" | "mark_prepared";

  // Required when action === "update_status".
  @IsOptional()
  @IsIn(["pending", "preparing", "prepared", "cancelled"])
  nextStatus?: OrderStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
