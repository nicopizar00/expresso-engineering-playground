// Auth domain module — fictional mini-commerce store.
//
// Responsibility: user registration and sign-in. Sessions live in
// core/auth (AuthCoreModule) so checkout and orders can resolve the
// signed-in user without depending on this module.
// Public surface:
//   - POST /auth/register   — create user + sign in (409 {field} on conflict)
//   - POST /auth/login      — sign in by username or email (generic 401)
//   - POST /auth/logout     — end the session (idempotent, 204)
//   - GET  /auth/me         — {user} or {user: null}

import { Module } from "@nestjs/common";
import { AuthCoreModule } from "../../core/auth/auth-core.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [AuthCoreModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
