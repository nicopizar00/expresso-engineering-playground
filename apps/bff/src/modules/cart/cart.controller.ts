import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { AddCartItemDto, UpdateCartItemDto } from "./cart.dto";
import { CartService } from "./cart.service";
import type { Cart } from "./cart.types";

@Controller("cart")
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(): Cart {
    return this.cart.get();
  }

  @Post("items")
  @HttpCode(201)
  addItem(@Body() body: AddCartItemDto): Cart {
    return this.cart.add(body);
  }

  @Patch("items/:itemId")
  updateItem(
    @Param("itemId") itemId: string,
    @Body() body: UpdateCartItemDto,
  ): Cart {
    return this.cart.updateQuantity(itemId, body.quantity);
  }

  @Delete("items/:itemId")
  removeItem(@Param("itemId") itemId: string): Cart {
    return this.cart.remove(itemId);
  }
}
