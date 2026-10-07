import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
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

  // No owner → every order. owner=session → the caller's orders, minting the
  // `sid` cookie for a fresh browser (which then owns nothing yet). Any other
  // value, including empty or repeated, is a 400 rather than a silent "all".
  @Get()
  list(
    @Query("owner") owner: string | string[] | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): OrdersResponse {
    if (owner === undefined) {
      return { items: this.orders.listAll() };
    }
    if (owner === "session") {
      const sessionId = this.session.resolveSessionId(req, res);
      return { items: this.orders.listForSession(sessionId) };
    }
    throw new BadRequestException('owner must be "session" when present');
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
