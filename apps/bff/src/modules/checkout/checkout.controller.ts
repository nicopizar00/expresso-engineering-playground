import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthSessionService } from "../../core/auth/auth-session.service";
import { SessionService } from "../../core/session/session.service";
import { CheckoutDto } from "./checkout.dto";
import { CheckoutService } from "./checkout.service";
import type { CheckoutResponse } from "./checkout.types";

@Controller("checkout")
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly session: SessionService,
    private readonly auth: AuthSessionService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: CheckoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CheckoutResponse> {
    const sessionId = this.session.resolveSessionId(req, res);
    // A stale/forged auth cookie resolves to null → guest, never an error.
    const user = await this.auth.resolveUser(req, res);
    return this.checkout.checkout(sessionId, body, user);
  }
}
