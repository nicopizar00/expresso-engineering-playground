import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import type { MeResponse } from "./auth.types";

// /me is the current-user alias. GET /me/orders and GET /me/hot-status live
// in the orders module's AccountController under the same prefix.
@Controller("me")
export class MeController {
  constructor(private readonly auth: AuthService) {}

  // 200 with user:null for guests (not 401) so the web app's bootstrap
  // probe never logs a console error.
  @Get()
  me(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.auth.me(req, res);
  }
}
