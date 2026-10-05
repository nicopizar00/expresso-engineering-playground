// Not @Global — consumers import it explicitly, like SessionModule.
import { Module } from "@nestjs/common";
import { AUTH_SESSION_TTL_MS, parseSessionTtlDays } from "./auth-session";
import { AuthSessionService } from "./auth-session.service";

@Module({
  providers: [
    AuthSessionService,
    {
      provide: AUTH_SESSION_TTL_MS,
      // Throws at bootstrap on an invalid value.
      useFactory: () =>
        parseSessionTtlDays(process.env.AUTH_SESSION_TTL_DAYS) *
        24 *
        60 *
        60 *
        1000,
    },
  ],
  exports: [AuthSessionService],
})
export class AuthCoreModule {}
