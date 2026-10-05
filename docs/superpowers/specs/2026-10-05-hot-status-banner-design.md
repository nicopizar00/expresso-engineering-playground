# Hot Coffee Banner Design

## Status

Approved in conversation on 2026-10-05 (sections 1–3). Pending written-spec
review.

## Problem

A signed-in user can see the hot/cold state of their orders only by opening
the Orders section. Nothing on the page tells them, at a glance, that a coffee
placed for them is still hot, and nothing updates on its own when an order is
placed for them from another browser or when the last hot coffee cools.

## Goals

- A banner appears for a signed-in user while they have at least one hot
  order, and only then.
- The banner shows how many coffees are hot and a live countdown to the next
  one cooling: "☕ 2 hot coffees — next one cools in 3:12".
- The banner refreshes on its own: it appears when an order placed for the
  user turns up (from this browser or another), and disappears when the last
  hot order cools.
- **Hard constraint:** the banner is fed by a dedicated BFF endpoint that
  identifies the user by the `auth` login token alone. It never requests the
  order list or individual orders.
- The endpoint is load-testable by the Punch k6 workflows as they exist today
  (k6 0.54, no extensions).

## Non-goals

- Server push (SSE or WebSocket). Deferred until Punch can drive SSE.
- The Punch workflows themselves (purchase → login → hot-status). Recorded as
  a follow-up.
- A configurable poll interval.
- Sound, browser notifications, or a dismiss button.
- Any change to the visualizer or to `DomainEventsService`.

## Decisions

| Topic              | Decision                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Transport          | Polling a snapshot endpoint (option B). Chosen over SSE so Punch can load-test the exact traffic the banner produces.                   |
| Which orders count | The same set as `GET /account/orders`: `ownerUsername = me.username OR ownerEmail = me.email`. Guest and `sid`-only orders never count. |
| Hot rule           | The existing one: hot while `now − placedAt < ORDER_COOL_DOWN_MS` (`temperatureOf`).                                                    |
| Banner content     | Count plus countdown to the earliest `coolsAt` among hot orders.                                                                        |
| Poll interval      | `HOT_STATUS_POLL_MS = 15_000`, a constant.                                                                                              |

## BFF

### Endpoint

`GET /account/hot-status`, served by the existing `AccountController`
(`@Controller("account")`) in the orders module.

- Identifies the user through `AuthSessionService.resolveUser`. No cookie,
  an unknown token, or an expired token → 401, the same as
  `GET /account/orders`.
- Takes no parameters. Never reads `sid`.
- 200 response:

```ts
// packages/contracts
export interface HotStatusResponse {
  hotCount: number; // >= 0
  nextCoolsAt: string | null; // ISO; earliest coolsAt among hot orders; null when hotCount is 0
  serverTime: string; // ISO; the instant the count was taken
}
```

### `HotStatusService`

New file `apps/bff/src/modules/orders/hot-status.service.ts`, one job: the
query below. It is provided by `OrdersModule` and injected into
`AccountController`.

One Prisma `aggregate` against Postgres, never the in-memory order cache, never
loading order rows:

```
WHERE (ownerUsername = me.username OR ownerEmail = me.email)
  AND placedAt > now − coolDown
SELECT count(*), min(placedAt)
```

- `hotCount` = the count.
- `nextCoolsAt` = `coolsAt(minPlacedAt, coolDownMs)` when the count is above
  0, else `null`.
- `serverTime` = the `now` used in the query.
- `coolDownMs` comes from the existing `ORDER_COOL_DOWN_MS` provider, so the
  banner and the order list always agree.
- Boundary: an order with `now − placedAt` exactly equal to `coolDownMs` is
  cold, matching `temperatureOf`'s strict `<`. In SQL this is
  `placedAt > now − coolDown`.

### Indexes

A new migration replaces `@@index([ownerUsername])` and
`@@index([ownerEmail])` on `Order` with `@@index([ownerUsername, placedAt])`
and `@@index([ownerEmail, placedAt])`. Each side of the `OR` becomes an index
range scan. `GET /account/orders` keeps working on the composite indexes
(leading column).

### Errors and logging

All errors go through the existing `http-exception.filter`. The endpoint has no
body, so no redaction is needed.

## Web

### `useHotStatus()`

- SWR key `user ? "account/hot-status" : null`. A signed-out user sends no
  request.
- `refreshInterval: HOT_STATUS_POLL_MS` (15 000 ms),
  `refreshWhenHidden: false`, `revalidateOnFocus: true`.
- A one-shot timer refetches 500 ms after `nextCoolsAt`, so the banner hides
  as soon as the last coffee cools instead of up to 15 s later.
- Revalidated immediately after a successful checkout (any "Order for"
  choice), after sign-in and registration. Sign-out clears the cached value.
- 401 drops the stale user through `useAuth().refresh()`, the same as the
  checkout 401 path. Any other error hides the banner; polling continues; no
  error UI.
- `expressoApi` gains `getHotStatus()`.

### Countdown logic

`apps/web/src/lib/hot-status/countdown.ts`, pure functions:

- `skewMs = serverTime − clientNowAtReceipt`.
- `remainingMs = max(0, nextCoolsAt − (Date.now() + skewMs))`.
- Formatted as `m:ss`.
- Copy: `"☕ 1 hot coffee — cools in m:ss"`;
  `"☕ N hot coffees — next one cools in m:ss"` for N ≥ 2.

### `HotCoffeeBanner`

- `apps/web/src/components/sections/HotCoffeeBanner.tsx`.
- Full width, directly under the header, above the page sections.
- Renders `null` unless `hotCount >= 1`.
- Re-renders once per second through `useSecondTick`, only while visible.
  The hook is private to `LatestOrderCard.tsx` today; move it to
  `apps/web/src/lib/hooks/use-second-tick.ts` and import it from both
  components.
- `role="status"` and `aria-live="polite"`. The live text is the count only;
  the ticking countdown sits outside the live region so screen readers are not
  flooded.
- A "View" button switches to Orders → My account.
- Uses the hot accent (`var(--warning)`) and the `Flame` icon, like
  `LatestOrderCard`. Must not break the mobile visual-integrity test.

## Testing

- **BFF unit (Vitest), `HotStatusService`:** no orders → `{0, null}`; one hot
  order → its `coolsAt`; several hot → the earliest; boundary at exactly
  `coolDownMs` → cold; email-only match counts; another user's hot order does
  not count; guest orders do not count.
- **BFF unit, controller:** 401 with no cookie; 401 with a forged or expired
  cookie; 200 with the response shape.
- **Web unit:** `countdown.ts` (skew, clamp at 0, `m:ss`) and the copy
  (singular and plural). Pure logic only, as with existing web tests.
- **E2E mocked (Playwright, `installCommerceApiMock` + a hot-status route):**
  signed out → no banner and no hot-status request; signed in and hot → banner
  with count and countdown; mocked state switches to `hotCount: 0` → banner
  disappears.
- **E2E real BFF (`login-real-bff.spec.ts`):** register → order for self →
  banner appears.
- **Smoke (`./dev smoke`):** one new check, 20 → 21: after "order for self",
  `GET /account/hot-status` returns `hotCount >= 1` and a future
  `nextCoolsAt`.

## Docs

- `docs/next-steps/hot-status.md`: what shipped; why polling, not streaming;
  follow-ups below.
- `docs/next-steps/README.md`: link the new topic.
- `docs/architecture/bff-modules.md`: one line for the endpoint and
  `HotStatusService`.
- Smoke count 20 → 21 in `CLAUDE.md`, `README.md`,
  `docs/local-development.md`, `docs/cli-reference.md`,
  `docs/quality-strategy/README.md`.

## Follow-ups (recorded, not built)

- **Punch hot-status load chain**, three workflows chained through Punch
  datasets:
  1. `purchase-registered` — places orders for registered users; produces
     `buyers` `[username, email]` for successful orders only.
  2. `login` — requires `buyers`; runs multiple iterations; produces
     `auth-tokens` `[username, authToken]` from `res.cookies["auth"]` on 200
     only.
  3. `hot-status` — requires `auth-tokens`; `GET /account/hot-status` with
     `Cookie: auth=<token>`.
     Open question: how the k6 users are registered (a register step or a larger
     seed).
- **SSE push** (`GET /account/hot-status/stream`) with typed owner-carrying
  domain events, once Punch can drive SSE (`xk6-sse`).

## Contract for Punch

- The endpoint needs only `Cookie: auth=<token>`.
- Tokens stay valid across workflows (`AUTH_SESSION_TTL_DAYS`, default 30).
- A user can hold many sessions at once; each login creates its own.
- The response is small and its shape is stable.
