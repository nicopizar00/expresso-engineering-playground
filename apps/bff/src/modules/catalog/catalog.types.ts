import type { Money } from "@mini-commerce/shared-types";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export interface Product {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly category: "drink" | "food" | "accessory";
  readonly price: Money;
  readonly inventory: number;
}

export interface ProductsResponse {
  readonly items: ReadonlyArray<Product>;
}

class CreatePriceDto {
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  description!: string;

  @IsIn(["drink", "food", "accessory"])
  category!: "drink" | "food" | "accessory";

  @ValidateNested()
  @Type(() => CreatePriceDto)
  price!: CreatePriceDto;

  @IsInt()
  @Min(0)
  inventory!: number;
}
