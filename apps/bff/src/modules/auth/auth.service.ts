import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { PrismaService } from "../../prisma.service";
import { AuthSessionService } from "../../core/auth/auth-session.service";
import {
  isValidPassword,
  normalizeEmail,
  normalizeUsername,
} from "../../core/auth/identity";
import {
  dummyHash,
  hashPassword,
  verifyPassword,
} from "../../core/auth/password";
import type { LoginDto, RegisterDto } from "./auth.dto";
import type { MeResponse, PublicUser } from "./auth.types";

type ConflictField = "username" | "email";

// P2002 meta.target is a field list on most connectors and the index name
// ("User_email_key") on others; accept both.
function conflictField(err: unknown): ConflictField | null {
  const e = err as { code?: string; meta?: { target?: string[] | string } };
  if (e?.code !== "P2002") return null;
  const target = Array.isArray(e.meta?.target)
    ? e.meta!.target.join(",")
    : String(e.meta?.target ?? "");
  if (target.includes("email")) return "email";
  if (target.includes("username")) return "username";
  return null;
}

function toPublic(user: { username: string; email: string }): PublicUser {
  return { username: user.username, email: user.email };
}

// TODO(next-steps/login): rate-limit register and login.
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AuthSessionService,
  ) {}

  async register(
    dto: RegisterDto,
    req: Request,
    res: Response,
  ): Promise<PublicUser> {
    const username = normalizeUsername(dto.username);
    if (!username) {
      throw new BadRequestException({
        message: "username must be 3-32 chars of a-z, 0-9, . _ -",
        field: "username",
      });
    }
    const email = normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException({
        message: "email is not valid",
        field: "email",
      });
    }
    if (!isValidPassword(dto.password)) {
      throw new BadRequestException({
        message: "password must be 8-200 characters",
        field: "password",
      });
    }

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          username,
          email,
          passwordHash: await hashPassword(dto.password),
        },
      });
    } catch (err) {
      const field = conflictField(err);
      if (field) {
        throw new ConflictException({ message: `${field} taken`, field });
      }
      throw err;
    }
    await this.sessions.start(user.id, req, res);
    this.logger.log(`registered user id=${user.id}`);
    return toPublic(user);
  }

  async login(dto: LoginDto, req: Request, res: Response): Promise<PublicUser> {
    const key = dto.identifier.trim().toLowerCase();
    const user = key.includes("@")
      ? await this.prisma.user.findUnique({ where: { email: key } })
      : await this.prisma.user.findUnique({ where: { username: key } });
    // Always run one comparison so unknown identifiers cost the same time.
    const ok = await verifyPassword(
      dto.password,
      user?.passwordHash ?? (await dummyHash()),
    );
    if (!user || !ok) {
      throw new UnauthorizedException("invalid credentials");
    }
    await this.sessions.start(user.id, req, res);
    return toPublic(user);
  }

  async logout(req: Request, res: Response): Promise<void> {
    await this.sessions.end(req, res);
  }

  async me(req: Request, res: Response): Promise<MeResponse> {
    const user = await this.sessions.resolveUser(req, res);
    return { user: user && toPublic(user) };
  }
}
