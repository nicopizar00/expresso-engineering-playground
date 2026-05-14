# apps/bff

Placeholder for the **NestJS** Backend-for-Frontend / API application.

## Responsibility

- Aggregates domain modules behind a single HTTP surface for `apps/web`.
- Hosts the domain modules of the modular monolith (Phase 1):
  - `trips`         — trip catalog and search.
  - `booking`       — booking lifecycle (hold, confirm, cancel).
  - `orders`        — post-booking order and payment state.
  - `users`         — traveler profiles and preferences.
  - `notifications` — outbound notifications (email/sms placeholders).
- Owns persistence (PostgreSQL via Prisma — placeholder only today).
- Emits OpenTelemetry traces, metrics, and logs (placeholder today).

## Module layout

Each module is a self-contained NestJS feature module. Modules expose a
narrow public surface (controllers + service interfaces); internals are not
imported from other modules. This is what enables Phase 3 extraction later.

```
src/
├── main.ts                       # bootstrap (placeholder)
├── app.module.ts                 # root composition (placeholder)
└── modules/
    ├── trips/
    ├── booking/
    ├── orders/
    ├── users/
    └── notifications/
```

## Persistence

Prisma schema lives in `prisma/schema.prisma`. The schema is intentionally
empty in this iteration — only the file exists so that future migrations
have a home.

## Next iteration TODOs

- [ ] Add NestJS dependencies and a real `main.ts` bootstrap.
- [ ] Add `@nestjs/swagger` to expose OpenAPI on `/docs`.
- [ ] Replace placeholder modules with controller + service skeletons.
- [ ] Wire Prisma client and a `health` endpoint that pings the DB.
- [ ] Wire OpenTelemetry SDK with OTLP exporter (env-configurable endpoint).
- [ ] Add Pact provider verification entry point in `tests/contract`.
