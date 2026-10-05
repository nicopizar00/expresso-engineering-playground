# Login and Order Ownership Design

## Status

Approved in conversation on 2026-10-05 (sections 1–3). Pending written-spec
review.

## Problem

Every order is anonymous today. Its only owner is the `sid` cookie of the
browser that placed it (`Order.sessionId`), and `GET /orders/mine` lists the
orders for that session. Nobody can sign in, so nobody can see their order
history from another browser, and nobody can place an order for someone else.

## Goals

- Users can register, sign in, and sign out with a username, an email, and a
  password.
- Anyone can place an order, signed in or not. At checkout the placer picks
  who the order is for:
  - **Me** — the signed-in user. This is the default when signed in.
  - **Guest** — nobody. This is the default when signed out.
  - **Someone else** — any username or email, typed freely. The user does not
    have to exist yet.
- A signed-in user sees every order placed for their username or email, newest
  first. The latest order is shown on its own card, with its hot/cold state.
- Orders placed for a username or email that is not registered yet appear in
  that user's history once they register.
- Guest checkout keeps working exactly as it does today.

## Non-goals

- Sending mail (verification, confirmations, password reset).
- Changing a username, email, or password after registration.
- Rate limiting and CSRF tokens. Both gaps are documented, not solved.
- Moving guest orders to an account when the guest signs in. Guest orders stay
  guest orders.
- New k6 scenarios. Existing scenarios keep working because omitting
  `orderFor` means guest.

## Decisions

| Topic | Decision |
|---|---|
| Credentials | Username + email + password. Login accepts username or email. |
| Session store | Database-backed `AuthSession` rows, separate `auth` cookie. |
| Password hashing | scrypt from `node:crypto`; no new dependency. |
| Order owner | Plain strings `ownerUsername` / `ownerEmail` on `Order`, no foreign key. |
| Guest orders at login | Not claimed. They stay sid-owned. |
| Who may pick "Someone else" | Anyone, signed in or not. |
| Recipient existence | Not checked. |

## Data model (Prisma)

```prisma
model User {
  id           Int           @id @default(autoincrement())
  username     String        @unique // normalized
  email        String        @unique // normalized
  passwordHash String        // "scrypt$N$r$p$<salt b64>$<hash b64>"
  createdAt    DateTime      @default(now())
  sessions     AuthSession[]
}

model AuthSession {
  id        Int      @id @default(autoincrement())
  tokenHash String   @unique // sha256(raw token), hex
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@index([userId])
}

model Order {
  // ...existing fields...
  ownerUsername String? // normalized; null unless placed for a username
  ownerEmail    String? // normalized; null unless placed for an email

  @@index([ownerUsername])
  @@index([ownerEmail])
}
```

At most one of `ownerUsername` and `ownerEmail` is set. Both null means guest.
Existing rows stay null and therefore remain guest orders. `sessionId` is
still stored on every new order, so the placing browser always sees it under
"This browser".

## Normalization and validation

One shared module, used by registration, login, and checkout:

- **Username:** trim, lowercase, must match `^[a-z0-9._-]{3,32}$`.
- **Email:** trim, lowercase, at most 254 characters, must match
  `^[^@\s]+@[^@\s]+\.[^@\s]+$`.
- **Password:** at least 8 characters, at most 200. Never normalized.
- **Recipient** (checkout "Someone else"): contains `@` → validated as email,
  otherwise validated as username.

The web app mirrors these rules for inline feedback. The BFF is authoritative.

## BFF

### `auth` module (`apps/bff/src/modules/auth`)

Follows the module pattern in `docs/architecture/bff-modules.md`:
controller, service, DTOs, types, specs. The cookie helper lives in
`core/auth` next to `core/session`, because checkout and orders read the
signed-in user too.

| Endpoint | Body | Success | Failures |
|---|---|---|---|
| `POST /auth/register` | `{username, email, password}` | 201 `{username, email}`, sets `auth` cookie | 400 validation; 409 `{field: "username" \| "email"}` |
| `POST /auth/login` | `{identifier, password}` | 200 `{username, email}`, sets `auth` cookie | 400 validation; 401 `invalid credentials` |
| `POST /auth/logout` | — | 204, deletes the session row, clears cookie | — (idempotent) |
| `GET /auth/me` | — | 200 `{user: {username, email} \| null}` | — |

- `identifier` containing `@` is looked up by email, otherwise by username.
- Registration signs the user in.
- Each login creates a new `AuthSession` row with a fresh 32-byte random
  token. Only `sha256(token)` is stored; the raw token lives only in the
  cookie.
- Session TTL comes from `AUTH_SESSION_TTL_DAYS` (default 30). An invalid
  value aborts startup, matching `ORDER_COOL_DOWN_SECONDS`.
- `auth` cookie: `httpOnly`, `sameSite: "lax"`, `path: "/"`,
  `secure: req.protocol === "https"`, `maxAge` = TTL. Same reasoning as the
  `sid` cookie in `SessionService`.
- `auth` and `sid` are independent. Signing in or out never touches the cart.

### Resolving the current user

`AuthSessionService.resolveUser(req, res)` returns the user or `null`:

- No cookie → `null`.
- Unknown token or `expiresAt` in the past → `null`, and the cookie is
  cleared.
- Public routes never fail because of a stale cookie.

### Password hashing

- scrypt with N=16384, r=8, p=1, 16-byte random salt, 64-byte key.
- Parameters are stored inside the hash string so they can change later.
- Verification uses `timingSafeEqual`.
- Login for an unknown identifier still runs one scrypt comparison against a
  fixed dummy hash, so response time does not reveal whether the user exists.

### Checkout

`CheckoutDto` gains an optional field:

```ts
orderFor?:
  | { type: "self" }
  | { type: "guest" }
  | { type: "user"; recipient: string };
```

| `orderFor` | Signed in | Signed out |
|---|---|---|
| omitted | owner = me (`ownerUsername`) | guest |
| `self` | owner = me (`ownerUsername`) | 401 |
| `guest` | guest | guest |
| `user` | recipient → `ownerUsername` or `ownerEmail` | same |

`type: "user"` with a missing or invalid `recipient` is a 400. Recipient
existence is not checked. Idempotent retries (`clientRequestId`) return the
original order unchanged, including its owner.

### Orders

- `Order` responses gain `owner: {username: string} | {email: string} | null`.
- `GET /account/orders` → `{items, latest}` for the signed-in user:
  `WHERE ownerUsername = me.username OR ownerEmail = me.email`, ordered by
  `placedAt` descending. `latest` is `items[0] ?? null`. Each item carries
  `temperature` and `coolsAt` as today. 401 when signed out.
- The account query reads Postgres, not the in-memory order cache, so orders
  placed for a recipient before they registered are always found. It is served
  by an `AccountController` (`@Controller("account")`) inside the orders
  module, which keeps it clear of the `orders/:id` route.
- `GET /orders/mine` and `GET /orders` are unchanged apart from the new
  `owner` field.

### Errors and logging

- All errors go through the existing `http-exception.filter`.
- `/auth/*` request bodies must never reach logs or spans. Check the logging
  interceptor and OTel HTTP instrumentation; redact if either captures bodies.

## Contracts

New request/response types (`RegisterRequest`, `LoginRequest`, `AuthUser`,
`MeResponse`, `AccountOrdersResponse`, `OrderOwner`, `OrderFor`) go in
`packages/contracts` so the BFF and web share them.

## Web

### Auth state

- `AuthProvider` + `useAuth()` wrap SWR on `GET /auth/me` and expose `user`,
  `login`, `register`, and `logout`.
- Each action revalidates `me` and the order lists.
- `expressoApi` gains `register`, `login`, `logout`, `getMe`, and
  `getAccountOrders`.

### Header account control

- **Signed out:** a "Sign in" button opens a dialog (using
  `useDialogA11y`) with two tabs:
  - **Sign in:** identifier (username or email) + password.
  - **Register:** username, email, password.
  - Errors show inline: 409 → "Username taken" / "Email taken", 401 →
    "Invalid credentials", 400 → field messages.
- **Signed in:** a username chip and a "Sign out" button.
- A successful sign-in or registration switches to the Orders section, Account
  scope.

### Orders section

Scopes: **Account** (only when signed in; the default then), **This browser**
(today's `mine`), **All**.

- **Account** scope:
  - A **Latest order card** at the top: a large hot/cold badge, order id,
    total, placed time, and a "cools at" countdown while hot. The card
    refetches at `coolsAt` so the badge flips live, reusing the detail view's
    refetch logic.
  - Below the card: the full list, newest first, each row with its badge.
  - With no orders: "No orders yet for you."
- **All** scope rows show the owner: "for ana", "for x@example.test", or
  "guest".
- Signing out drops the Account scope and falls back to This browser.

### Checkout panel — "Order for"

- Radio options: **Me** (disabled with a hint when signed out), **Guest**,
  **Someone else**.
- The default is Me when signed in, Guest when signed out.
- **Someone else** shows a "username or email" input with client-side checks
  that mirror the BFF rules.
- After placing: **Me** → Account scope. **Guest** / **Someone else** → This
  browser scope, where the placer still sees the order through `sid`.

## Seed

Two fictional demo users, `ana` / `ana@example.test` and `ben` /
`ben@example.test`, sharing one documented demo password. Each gets a few
orders, one of them recent enough to be hot when the seed runs. One extra
order is placed for `cara@example.test`, who is not registered, so the
"register later and see it" path can be checked by hand.

## Testing

- **BFF unit (Vitest):**
  - normalizers and validators
  - password hash and verify, plus the dummy-compare path
  - auth service: register, conflicts, login by username and by email, logout,
    expiry
  - checkout `orderFor` resolution (full table above)
  - account orders: username OR email match, ordering, `latest`
- **Web unit:** `AuthProvider`, the "Order for" control, and the latest-order
  card (hot, cold, flip at `coolsAt`).
- **Smoke (`./dev smoke`):** four new checks, 16 → 20:
  1. register a fresh random user
  2. `GET /auth/me` returns them
  3. checkout with `orderFor: self`
  4. `GET /account/orders` → `latest` is that order and is `hot`
- **E2E (Playwright):**
  - register → order for self → Account shows the latest order as hot
  - order for an unregistered email → register that email in a fresh browser
    context → the order is listed
  - guest checkout still works unchanged
- **k6:** no change. A follow-up is recorded in the next-steps doc.

## Docs

- `docs/next-steps/login.md` with open follow-ups (rate limiting, CSRF,
  profile edit, mail, k6 auth scenario), and `TODO(next-steps/login)` anchors
  at those points in the code.
- `docs/architecture/bff-modules.md`: the `auth` module and `core/auth`.
- `docs/cli-reference.md` and `CLAUDE.md`: smoke count 16 → 20.
- `.env.example`: `AUTH_SESSION_TTL_DAYS=30`.

## Known gaps (by design)

- Anyone can attribute an order to any username or email.
- No rate limiting on login or registration.
- No CSRF token. The design relies on `sameSite: lax` plus JSON request
  bodies.
- Registration 409s reveal whether a username or email is taken.
