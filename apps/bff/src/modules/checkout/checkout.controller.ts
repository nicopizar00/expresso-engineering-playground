import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { CheckoutDto } from "./checkout.dto";
import { CheckoutService } from "./checkout.service";
import type { CheckoutResponse } from "./checkout.types";

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @HttpCode(201)
  create(@Body() body: CheckoutDto): CheckoutResponse {
    return this.checkout.checkout(body);
  }
}
