# Login and Order Ownership

Status: open (core shipped 2026-10-05; follow-ups below).

Spec: [`docs/superpowers/specs/2026-10-05-login-design.md`](../superpowers/specs/2026-10-05-login-design.md)

## What shipped

- **Accounts:** `POST /auth/register` (username + email + password, signs in),
  `POST /auth/login` (username or email), `POST /auth/logout`,
  `GET /auth/me`. scrypt hashes; DB-backed sessions behind an httpOnly `auth`
  cookie, independent of the cart's `sid`. TTL: `AUTH_SESSION_TTL_DAYS`
  (default 30).
- **Order for:** checkout takes `orderFor` — `self`, `guest`, or
  `user` + `recipient` (username or email, need not exist). Omitted → self
  when signed in, guest otherwise. Stored as `Order.ownerUsername` /
  `Order.ownerEmail`.
- **Account orders:** `GET /account/orders` → `{items, latest}` for the
  signed-in user (owner username OR email), newest first.
- **Web:** header Sign in / Register dialog (icon-only Sign in button below
  the `sm` breakpoint, `aria-label` "Sign in"), "Order for" radio in
  checkout, Orders tabs My account (signed in only) / This browser / All
  orders, an owner label ("for ana", "for x@example.test", "guest") on rows
  in every tab, and a latest-order card with live hot/cold.
- **Smoke:** 20 checks (register, me, order for self, account latest hot).

## Demo accounts (seed)

| Username | Email | Password |
|---|---|---|
| `ana` | `ana@example.test` | `espresso-demo` |
| `ben` | `ben@example.test` | `espresso-demo` |

`ord_seed_cara_1` is owned by `cara@example.test`, which is not registered.
Register that email to see it appear.

## Known gaps (by design)

- Anyone can attribute an order to any username or email.
- Registration 409s reveal whether a username or email is taken.
- No rate limiting on register or login.
- No CSRF token (today: `sameSite=lax` + JSON bodies).

## Open follow-ups

- Rate limiting on register/login. Anchor: `TODO(next-steps/login)` in
  `apps/bff/src/modules/auth/auth.service.ts`.
- CSRF token. Anchor: `TODO(next-steps/login)` in
  `apps/bff/src/core/auth/auth-session.service.ts` (`start`).
- Profile edit (username/email/password change) and password reset by mail.
- k6: an authenticated purchase scenario (`orderFor: self`) and an
  `account-orders` read scenario.
- Session sweep: old `AuthSession` rows are not removed on re-login, and
  expired rows are only deleted when presented. Add a periodic sweep.
  Anchor: `TODO(next-steps/login)` in `resolveUser` of
  `apps/bff/src/core/auth/auth-session.service.ts`.
- Test the latest-order card's live hot to cold flip (no component or e2e
  test covers it).
- Paginate `/account/orders` (currently unbounded).
- Clear the sign-in dialog's typed state (including the password) on close.
- Tooling gap: `./dev up` does not rebuild the BFF image after code changes.
  Use `docker compose -f infra/docker/compose.yaml up -d --build bff`.
- The `secure` cookie flag stays false behind a TLS-terminating proxy (no
  `trust proxy`), the same as `sid`.
