// Bootstrap order matters:
//   1. initTelemetry() runs FIRST so OTel auto-instrumentations attach to
//      HTTP/Express/Pg before NestFactory creates the app. Today this is a
//      no-op placeholder (see common/telemetry.ts).
//   2. NestFactory creates the AppModule.
//   3. Global pipes / interceptors / filters are applied.
//   4. App listens on PORT (default 3001) — never hardcode a URL.

import "reflect-metadata";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { LoggingInterceptor } from "./common/logging.interceptor";
import { initTelemetry } from "./common/telemetry";

export async function bootstrap(): Promise<void> {
  initTelemetry();

  const app = await NestFactory.create(AppModule, {
    logger: ["log", "warn", "error", "debug"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Allow the local web app (port 3000) to call the BFF in development.
  // Restrict origins via CORS_ORIGIN env var when needed.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
  });

  // TODO: mount @nestjs/swagger at /docs once packages/contracts is wired.

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger("Bootstrap").log(`BFF listening on :${port}`);
}

if (require.main === module) {
  void bootstrap().catch((err) => {
    // Last-resort logger: Nest may not be up yet.
    // eslint-disable-next-line no-console
    console.error("Fatal bootstrap error", err);
    process.exit(1);
  });
}
