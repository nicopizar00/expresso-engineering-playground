import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { AddCartItemDto } from "./cart.dto";
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
}
