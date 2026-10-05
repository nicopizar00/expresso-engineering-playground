import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { SessionService } from "../../core/session/session.service";
import { OrdersService } from "./orders.service";
import type {
  Order,
  OrderStatusResponse,
  OrdersResponse,
} from "./orders.types";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly session: SessionService,
  ) {}

  @Get()
  list(): OrdersResponse {
    return { items: this.orders.listAll() };
  }

  // Declared before :id so Nest does not route "mine" as an order id.
  // Mints the `sid` cookie for a fresh browser, which then owns nothing yet.
  @Get("mine")
  mine(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): OrdersResponse {
    const sessionId = this.session.resolveSessionId(req, res);
    return { items: this.orders.listForSession(sessionId) };
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
