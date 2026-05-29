import { Type } from "class-transformer";
import { IsInt, IsString, Max, Min } from "class-validator";

// Validation kept intentionally thin. Tighten constraints (productId regex,
// currency enum, etc.) once contracts/openapi lands.
export class AddCartItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  quantity!: number;
}
