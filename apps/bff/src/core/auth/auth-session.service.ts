import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Request, Response } from "express";
import { PrismaService } from "../../prisma.service";
import { readCookie } from "../cookies";
import {
  AUTH_COOKIE,
  AUTH_SESSION_TTL_MS,
  DEFAULT_SESSION_TTL_DAYS,
  hashToken,
  newToken,
  type AuthUser,
} from "./auth-session";

// DB-backed sign-in sessions behind the `auth` cookie. Independent of the
// anonymous `sid` cookie (SessionService), so signing in or out never
// touches the cart. Cookie attributes mirror `sid` — see SessionService for
// why secure is derived from req.protocol instead of NODE_ENV.
@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(AUTH_SESSION_TTL_MS)
    private readonly ttlMs: number = DEFAULT_SESSION_TTL_DAYS *
      24 *
      60 *
      60 *
      1000,
  ) {}

  async start(userId: number, req: Request, res: Response): Promise<void> {
    const token = newToken();
    await this.prisma.authSession.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
    });
    // TODO(next-steps/login): CSRF token (today: sameSite=lax + JSON bodies).
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: req.protocol === "https",
      maxAge: this.ttlMs,
    });
  }

  // Never throws for a bad cookie: public routes treat it as signed out.
  async resolveUser(req: Request, res: Response): Promise<AuthUser | null> {
    const token = readCookie(req.headers.cookie, AUTH_COOKIE);
    if (!token) return null;
    const row = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    // TODO(next-steps/login): periodic session sweep; expired rows are only
    // deleted when presented, and re-login leaves old rows behind.
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      if (row) {
        await this.prisma.authSession.deleteMany({ where: { id: row.id } });
      }
      res.clearCookie(AUTH_COOKIE, { path: "/" });
      return null;
    }
    return {
      id: row.user.id,
      username: row.user.username,
      email: row.user.email,
    };
  }

  async end(req: Request, res: Response): Promise<void> {
    const token = readCookie(req.headers.cookie, AUTH_COOKIE);
    if (token) {
      await this.prisma.authSession.deleteMany({
        where: { tokenHash: hashToken(token) },
      });
    }
    res.clearCookie(AUTH_COOKIE, { path: "/" });
  }
}
