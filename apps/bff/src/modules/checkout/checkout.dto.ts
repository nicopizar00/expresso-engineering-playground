import { IsOptional, IsUUID } from "class-validator";

// CUP-002: checkout is anonymous. No customer, recipient, or other human
// name field is accepted — the global ValidationPipe's
// forbidNonWhitelisted rejects any request body that includes one.
export class CheckoutDto {
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
