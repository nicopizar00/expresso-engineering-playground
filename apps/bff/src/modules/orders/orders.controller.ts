import { Controller, Get, Param } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import type {
  Order,
  OrderStatusResponse,
  OrdersResponse,
} from "./orders.types";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(): OrdersResponse {
    return { items: this.orders.listAll() };
  }

  @Get(":id")
  get(@Param("id") id: string): Order {
    return this.orders.get(id);
  }

  // Reads Postgres directly; temperature is derived from placedAt.
  @Get(":id/status")
  status(@Param("id") id: string): Promise<OrderStatusResponse> {
    return this.orders.getStatus(id);
  }
}
