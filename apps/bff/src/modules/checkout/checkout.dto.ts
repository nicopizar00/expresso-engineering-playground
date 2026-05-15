import { IsOptional, IsString, IsUUID, Length } from "class-validator";

// No real payment is processed in this iteration. The body only carries
// customer identity placeholders so the order has somewhere to attribute.
export class CheckoutDto {
  @IsString()
  @Length(1, 80)
  customerName!: string;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
