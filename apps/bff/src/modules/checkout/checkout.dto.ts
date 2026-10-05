import { Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class OrderForDto {
  @IsIn(["self", "guest", "user"])
  type!: "self" | "guest" | "user";

  // Required when type is "user"; validated by resolveOrderOwner so the
  // error names the field.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  recipient?: string;
}

// CUP-002: no customer name is accepted (forbidNonWhitelisted rejects it).
// Who the order is for is expressed through `orderFor` only.
export class CheckoutDto {
  // Proves the client is checking out the reservation it actually holds
  // (see CartService's 1-hour reservation). Mismatch/expiry => 409.
  @IsUUID()
  cartId!: string;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrderForDto)
  orderFor?: OrderForDto;
}
