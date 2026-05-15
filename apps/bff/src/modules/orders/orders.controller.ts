import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ManageOrderDto } from "./orders.dto";
import { OrdersService } from "./orders.service";
import type { ManageOrderResponse, Order } from "./orders.types";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(":id")
  get(@Param("id") id: string): Order {
    return this.orders.get(id);
  }

  @Post(":id/manage")
  @HttpCode(202)
  manage(
    @Param("id") id: string,
    @Body() body: ManageOrderDto,
  ): ManageOrderResponse {
    return this.orders.manage(id, body);
  }
}
