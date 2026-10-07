# REST Route Conventions Design

## Status

Approved in conversation on 2026-10-06 (route audit, A-then-B split). This
is spec A of two; spec B
([`2026-10-06-workflow-naming-design.md`](2026-10-06-workflow-naming-design.md))
names k6 workflows after the routes defined here and ships after this one.

## Problem

BFF routes mix resource nouns, verbs, and namespaces: `POST /checkout`
creates an order, `catalog` prefixes `products` without being a resource,
current-user data lives under both `/auth/me` and `/account/*`, the
session-owned order list is a magic `mine` segment that must be declared
before `:id`, and the visualizer reads `/visualization-data` and
`/visualization-updates` instead of one resource with a stream.

Spec B derives workflow names from routes, so the routes must first follow
one convention.

## Goals

- Every BFF route follows plain REST: plural or singleton resource nouns,
  HTTP method as the verb, filters as query parameters, sub-resources for
  owned collections, `/me` as the current-user alias.
- All callers (web, visualizer, contracts, e2e, k6, `./dev smoke`, docs)
  move to the new routes in the same change.
- No behaviour change: same bodies, status codes, cookies, and SSE frames.

## Non-goals

- Versioning (`/v1`) or keeping the old routes as aliases. This is a
  playground with no external clients; old routes are removed outright.
- Changing auth action routes (`/auth/register`, `/auth/login`,
  `/auth/logout`) or `POST /assets/refresh`. Both are accepted
  action-route conventions.
- Merging or splitting BFF modules. Module ownership stays as documented in
  [`docs/architecture/bff-modules.md`](../../architecture/bff-modules.md).
- Renaming k6 workflows or scenarios (spec B).

## Route map

| Old                              | New                             | Owner module (unchanged) |
| -------------------------------- | ------------------------------- | ------------------------ |
| `GET /health`                    | unchanged                       | health                   |
| `GET /catalog/products`          | `GET /products`                 | catalog                  |
| `GET /catalog/products/:id`      | `GET /products/:id`             | catalog                  |
| `GET /cart`                      | unchanged                       | cart                     |
| `POST /cart/items`               | unchanged                       | cart                     |
| `PATCH /cart/items/:itemId`      | unchanged                       | cart                     |
| `DELETE /cart/items/:itemId`     | unchanged                       | cart                     |
| `POST /checkout`                 | `POST /orders`                  | checkout                 |
| `GET /orders`                    | unchanged                       | orders                   |
| `GET /orders/mine`               | `GET /orders?owner=session`     | orders                   |
| `GET /orders/:id`                | unchanged                       | orders                   |
| `GET /orders/:id/status`         | unchanged                       | orders                   |
| `GET /auth/me`                   | `GET /me`                       | auth                     |
| `GET /account/orders`            | `GET /me/orders`                | orders                   |
| `GET /account/hot-status`        | `GET /me/hot-status`            | orders                   |
| `POST /auth/register`            | unchanged                       | auth                     |
| `POST /auth/login`               | unchanged                       | auth                     |
| `POST /auth/logout`              | unchanged                       | auth                     |
| `GET /visualization-data`        | `GET /visualization`            | visualization            |
| `GET /visualization-updates` SSE | `GET /visualization/events` SSE | visualization            |
| `POST /assets/refresh`           | unchanged                       | assets                   |

## Decisions

| Topic                | Decision                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create order         | `CheckoutController` keeps its module and service; only its decorator changes to `@Controller("orders")` + `@Post()`. Request body (`cartId`, optional `orderFor`) and `201` response stay identical.                                                  |
| Session-owned orders | `GET /orders` reads optional `owner` query. Absent → all orders (today's `listAll`). `session` → today's `mine` behaviour, including minting the `sid` cookie. Any other value → `400`. The `mine` route and its declare-before-`:id` comment go away. |
| `/me` controller     | `/me` is served by the auth module (`GET /me`). `/me/orders` and `/me/hot-status` stay in the orders module's `AccountController`, re-pathed to `@Controller("me")`. Two controllers sharing a prefix is valid Nest; no path collides.                 |
| Contracts            | `packages/contracts` route comments and any exported path strings move to the new routes. Type names (`AccountOrdersResponse`, `MeResponse`, `CheckoutResponse`) stay; renaming types is out of scope.                                                 |
| Old routes           | Removed, no redirects. A request to an old route returns Nest's default `404`.                                                                                                                                                                         |
| Web proxy            | `/api/bff/:path*` rewrite is path-agnostic; no change in `next.config.mjs`.                                                                                                                                                                            |
| Visualizer           | `transport.js` fetches `${API_BASE}/visualization` and opens `EventSource(${API_BASE}/visualization/events)`. Frame format unchanged.                                                                                                                  |
| k6 scenarios         | Route strings in every scenario (including `load`, `stress`, `smoke`, browser scenarios' network waits if any) move to the new routes here, so k6 keeps passing between spec A and spec B. Names and dirs stay until spec B.                           |
| Docs                 | Live docs (architecture, cli-reference, READMEs, next-steps, UAT, CLAUDE.md) move to new routes. Dated specs and plans under `docs/superpowers/` are historical records and stay as written.                                                           |

## Change surface

- `apps/bff/src/modules/{catalog,checkout,orders,auth,visualization}` —
  controller decorators, `orders` query handling, controller specs.
- `apps/bff` e2e/integration tests that hit routes.
- `packages/contracts/src/index.ts` — route comments/paths.
- `apps/web/src/lib/api/expresso-api.ts` — request paths and
  `ExpressoApiError` labels; `mock-data.ts` if it keys by path.
- `apps/visualizer-3d/public/transport.js`, `index.html`, README.
- `tests/e2e/fixtures/commerce-api.ts`, `tests/e2e/tests/*`,
  `tests/e2e/TEST_PLAN.md`.
- `scripts/pg/smoke.py` (`./dev smoke`) and its tests.
- `tests/performance/k6/scenarios/*` route strings.
- `infra/docker/compose.yaml` comment.
- Live docs listed above.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm pg:test` green.
- New BFF tests: `GET /orders?owner=session` returns only session orders and
  sets `sid`; `GET /orders?owner=bogus` → `400`; `GET /checkout` and
  `GET /catalog/products` → `404`.
- `./dev up full` then `./dev smoke`: all checks pass on new routes.
- Web: browse, add to cart, check out, see order, log in, account page,
  hot-status banner — all work through `/api/bff`.
- Visualizer: scene loads and an SSE frame arrives after checkout.
- `grep` for old routes (`/catalog/products`, `/checkout"`, `orders/mine`,
  `/account/`, `auth/me`, `visualization-data`, `visualization-updates`)
  outside `docs/superpowers/` and `vendor/` returns nothing.
