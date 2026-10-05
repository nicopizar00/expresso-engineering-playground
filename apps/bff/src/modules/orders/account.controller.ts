import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthSessionService } from "../../core/auth/auth-session.service";
import { HotStatusService } from "./hot-status.service";
import { OrdersService } from "./orders.service";
import type { AccountOrdersResponse, HotStatusResponse } from "./orders.types";

// Lives under /account (not /orders) so it can never collide with
// GET /orders/:id.
@Controller("account")
export class AccountController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly sessions: AuthSessionService,
    private readonly hotStatusService: HotStatusService,
  ) {}

  @Get("orders")
  async orders(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountOrdersResponse> {
    const user = await this.sessions.resolveUser(req, res);
    if (!user) {
      throw new UnauthorizedException("sign in to see your orders");
    }
    const items = await this.ordersService.listForAccount(user);
    return { items, latest: items[0] ?? null };
  }

  // Banner feed: identified by the auth cookie alone; never returns orders.
  @Get("hot-status")
  async hotStatus(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HotStatusResponse> {
    const user = await this.sessions.resolveUser(req, res);
    if (!user) {
      throw new UnauthorizedException("sign in to see your hot coffees");
    }
    return this.hotStatusService.forUser(user);
  }
}
