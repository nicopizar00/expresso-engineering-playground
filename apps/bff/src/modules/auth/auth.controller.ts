import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { LoginDto, RegisterDto } from "./auth.dto";
import { AuthService } from "./auth.service";
import type { PublicUser } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @HttpCode(201)
  register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    return this.auth.register(body, req, res);
  }

  @Post("login")
  @HttpCode(200)
  login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    return this.auth.login(body, req, res);
  }

  @Post("logout")
  @HttpCode(204)
  logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.auth.logout(req, res);
  }
}
