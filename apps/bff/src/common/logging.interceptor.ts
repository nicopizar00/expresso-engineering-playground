import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable, tap } from "rxjs";

// Lightweight request log: method, path, status, duration.
//
// TODO: replace with structured (JSON) logs once a logger like pino is added,
// and enrich with trace_id/span_id once telemetry.ts is wired.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const status = http.getResponse<{ statusCode: number }>().statusCode;
        this.logger.log(
          `${req.method} ${req.originalUrl ?? req.url} ${status} ${Date.now() - start}ms`,
        );
      }),
    );
  }
}
