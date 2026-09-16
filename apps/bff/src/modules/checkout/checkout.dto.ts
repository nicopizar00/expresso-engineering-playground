import { IsOptional, IsUUID } from "class-validator";

// CUP-002: checkout is anonymous. No customer, recipient, or other human
// name field is accepted — the global ValidationPipe's
// forbidNonWhitelisted rejects any request body that includes one.
export class CheckoutDto {
  // Proves the client is checking out the reservation it actually holds
  // (see CartService's 1-hour reservation). Mismatch/expiry => 409.
  @IsUUID()
  cartId!: string;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
