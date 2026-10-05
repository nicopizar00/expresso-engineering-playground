# Hot Coffee Banner

Status: open (core shipped 2026-10-05; follow-ups below).

Spec: [`docs/superpowers/specs/2026-10-05-hot-status-banner-design.md`](../superpowers/specs/2026-10-05-hot-status-banner-design.md)

## What shipped

- **BFF:** `GET /account/hot-status` → `{hotCount, nextCoolsAt, serverTime}`
  for the signed-in user (`auth` cookie only; 401 otherwise). One Postgres
  aggregate in `HotStatusService`; never loads order rows. Composite indexes
  `(ownerUsername, placedAt)` and `(ownerEmail, placedAt)`.
- **Web:** `HotCoffeeBanner` above the home stage while `hotCount ≥ 1`:
  "☕ 2 hot coffees — next one cools in 3:12". SWR polls every 15 s (paused in
  hidden tabs), refetches 500 ms after `nextCoolsAt`, and after checkout and
  sign-in.
- **Smoke:** 21 checks (adds hot-status after order for self).

## Why polling, not streaming

The Punch k6 image (k6 0.54, no extensions) cannot hold an SSE stream, so a
pushed banner could not be load-tested. Polling keeps the banner's real
traffic identical to what Punch drives.

## Contract for Punch

- Only `Cookie: auth=<token>` is needed.
- Tokens stay valid across workflows (`AUTH_SESSION_TTL_DAYS`, default 30).
- Each login creates its own session; a user can hold many.

## Open follow-ups

- **Punch hot-status load chain**, chained through Punch datasets:
  1. `purchase-registered` — places orders for registered users; produces
     `buyers` `[username, email]` for successful orders only.
  2. `login` — requires `buyers`; multiple iterations; produces
     `auth-tokens` `[username, authToken]` from `res.cookies["auth"]` on 200.
  3. `hot-status` — requires `auth-tokens`; `GET /account/hot-status` with
     `Cookie: auth=<token>`.
     Open question: how the k6 users get registered (register step or larger
     seed).
- **SSE push** (`GET /account/hot-status/stream`) with owner-carrying domain
  events, once Punch can drive SSE (`xk6-sse`).
- An order placed for me from another browser shows up within one poll
  interval (≤ 15 s), not instantly.
