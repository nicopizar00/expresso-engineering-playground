# Hot Coffee Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A banner for signed-in users that shows how many of their coffees are
hot and a countdown to the next one cooling, fed by a dedicated polled BFF
endpoint `GET /account/hot-status` keyed on the `auth` cookie.

**Architecture:** The BFF gains `HotStatusService` (one Prisma `aggregate`, no
order rows) behind `AccountController`, plus composite owner/placedAt indexes.
The web app polls it with SWR every 15 s, refetches just after `nextCoolsAt`,
and renders `HotCoffeeBanner` above the home stage. No event bus or SSE
changes.

**Tech Stack:** NestJS 10, Prisma 6 + Postgres, Next.js 14 + SWR, Vitest,
Playwright, Python stdlib smoke.

**Spec:** `docs/superpowers/specs/2026-10-05-hot-status-banner-design.md`

## Global Constraints

- No AI attribution in commits or docs. English only. No real names, URLs,
  IPs, or credentials; demo data uses `@example.test`.
- Response shape exactly: `{ hotCount: number; nextCoolsAt: string | null; serverTime: string }`.
- Hot rule: hot while `now − placedAt < coolDownMs`; SQL filter
  `placedAt > now − coolDown` (exact boundary is cold).
- Owner match: `ownerUsername = me.username OR ownerEmail = me.email`. Guest
  and `sid`-only orders never count.
- 401 when signed out / unknown / expired token, same as `GET /account/orders`.
- The banner never calls `/orders*` or `/account/orders`; only
  `/account/hot-status`.
- `HOT_STATUS_POLL_MS = 15_000`; `refreshWhenHidden: false`;
  `revalidateOnFocus: true`; refetch 500 ms after `nextCoolsAt`.
- Copy: `"☕ 1 hot coffee — cools in m:ss"`,
  `"☕ N hot coffees — next one cools in m:ss"` (N ≥ 2).
- Banner: `role="status"`, `aria-live="polite"`, live text is the count only.
- Smoke count 20 → 21.
- Every commit passes `pnpm lint`, `pnpm format`, `pnpm typecheck`.

## Review Focus

1. **Huge cool-down (`ORDER_COOL_DOWN_SECONDS` up to one year)** — the
   `nextCoolsAt` timer delay exceeds `setTimeout`'s 2³¹−1 ms limit, which
   fires immediately and refetches in a tight loop. Expected: no timer when
   the delay exceeds the poll interval; polling covers it. Pinned by
   `refetchDelayMs` tests in Task 4.
2. **Malformed or missing date strings** (`nextCoolsAt`/`serverTime` not
   parseable) — expected: countdown shows `0:00`, never `NaN:NaN`. Pinned in
   Task 4.
3. **Client clock far off server clock** — expected: the countdown follows
   server time via `serverTime` skew. Pinned in Task 4.
4. **Session ends while the banner is up (401 on poll)** — expected: banner
   hides and the stale user is dropped (`useAuth().refresh()`), no error UI.
   Pinned by the 401 branch in Task 5 and the mocked E2E sign-out case in
   Task 6.
5. **Stale data after a non-401 error** — SWR keeps the last `data` on error;
   expected: banner hides while the last fetch failed. Pinned in Task 5's
   `pickVisible` test.

---

### Task 1: BFF hot-status service and endpoint

**Files:**

- Create: `apps/bff/src/modules/orders/hot-status.service.ts`
- Create: `apps/bff/src/modules/orders/hot-status.service.spec.ts`
- Modify: `apps/bff/src/modules/orders/orders.types.ts` (add `HotStatusResponse`)
- Modify: `apps/bff/src/modules/orders/orders.module.ts` (provider + header comment)
- Modify: `apps/bff/src/modules/orders/account.controller.ts` (new route)
- Modify: `apps/bff/src/modules/orders/account.controller.spec.ts`
- Modify: `packages/contracts/src/index.ts` (add `HotStatusResponse`)

**Interfaces:**

- Consumes: `PrismaService` (`../../prisma.service`), `ORDER_COOL_DOWN_MS`,
  `DEFAULT_COOL_DOWN_SECONDS`, `coolsAt` from `./order-temperature`,
  `AuthSessionService.resolveUser(req, res)`.
- Produces: `HotStatusService.forUser(user: {username: string; email: string}, now?: Date): Promise<HotStatusResponse>`;
  route `GET /account/hot-status`; contract type `HotStatusResponse`
  exported from `@mini-commerce/contracts`.

- [ ] **Step 1: Write the failing service tests**

`apps/bff/src/modules/orders/hot-status.service.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import { HotStatusService } from "./hot-status.service";

const COOL = 300_000;
const NOW = new Date("2026-10-05T12:00:00.000Z");
const ana = { username: "ana", email: "ana@example.test" };

function make(result: { count: number; min: Date | null }) {
  const aggregate = vi.fn().mockResolvedValue({
    _count: { _all: result.count },
    _min: { placedAt: result.min },
  });
  const prisma = { order: { aggregate } } as unknown as PrismaService;
  return { svc: new HotStatusService(prisma, COOL), aggregate };
}

describe("HotStatusService", () => {
  it("aggregates by owner username OR email, strictly inside the cool-down window", async () => {
    const { svc, aggregate } = make({ count: 0, min: null });
    await svc.forUser(ana, NOW);
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        OR: [{ ownerUsername: "ana" }, { ownerEmail: "ana@example.test" }],
        placedAt: { gt: new Date(NOW.getTime() - COOL) },
      },
      _count: { _all: true },
      _min: { placedAt: true },
    });
  });

  it("returns zero and null nextCoolsAt with no hot orders", async () => {
    const { svc } = make({ count: 0, min: null });
    await expect(svc.forUser(ana, NOW)).resolves.toEqual({
      hotCount: 0,
      nextCoolsAt: null,
      serverTime: NOW.toISOString(),
    });
  });

  it("derives nextCoolsAt from the earliest hot placedAt", async () => {
    const earliest = new Date(NOW.getTime() - 120_000);
    const { svc } = make({ count: 2, min: earliest });
    await expect(svc.forUser(ana, NOW)).resolves.toEqual({
      hotCount: 2,
      nextCoolsAt: new Date(earliest.getTime() + COOL).toISOString(),
      serverTime: NOW.toISOString(),
    });
  });

  it("defaults now to the current time", async () => {
    const { svc } = make({ count: 0, min: null });
    const before = Date.now();
    const out = await svc.forUser(ana);
    expect(Date.parse(out.serverTime)).toBeGreaterThanOrEqual(before);
  });
});
```

Note: the owner/guest/other-user semantics live in the `where` clause pinned
by the first test; the real-Postgres behaviour is covered by the smoke check
(Task 3) and the real-BFF E2E (Task 6).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders/hot-status.service.spec.ts`
Expected: FAIL, cannot resolve `./hot-status.service`.

- [ ] **Step 3: Add the type and the service**

Append to `apps/bff/src/modules/orders/orders.types.ts`:

```ts
// GET /account/hot-status — banner snapshot for the signed-in user.
export interface HotStatusResponse {
  readonly hotCount: number;
  // Earliest coolsAt among hot orders; null when hotCount is 0.
  readonly nextCoolsAt: string | null;
  // The instant the count was taken; lets clients correct clock skew.
  readonly serverTime: string;
}
```

Append the same interface (same comments) to `packages/contracts/src/index.ts`
directly after `AccountOrdersResponse`, with the header comment
`// GET /account/hot-status — the signed-in user's hot-order summary.`

`apps/bff/src/modules/orders/hot-status.service.ts`:

```ts
// Hot-status snapshot for the web banner: how many of the signed-in user's
// orders are hot, and when the next one cools. One aggregate against
// Postgres — never loads order rows, never reads the in-memory cache.
// Same owner rule as listForAccount, same hot rule as temperatureOf.
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import {
  DEFAULT_COOL_DOWN_SECONDS,
  ORDER_COOL_DOWN_MS,
  coolsAt,
} from "./order-temperature";
import type { HotStatusResponse } from "./orders.types";

@Injectable()
export class HotStatusService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(ORDER_COOL_DOWN_MS)
    private readonly coolDownMs: number = DEFAULT_COOL_DOWN_SECONDS * 1000,
  ) {}

  async forUser(
    user: { username: string; email: string },
    now: Date = new Date(),
  ): Promise<HotStatusResponse> {
    const { _count, _min } = await this.prisma.order.aggregate({
      where: {
        OR: [{ ownerUsername: user.username }, { ownerEmail: user.email }],
        // Strict: an order exactly coolDownMs old is cold (temperatureOf uses <).
        placedAt: { gt: new Date(now.getTime() - this.coolDownMs) },
      },
      _count: { _all: true },
      _min: { placedAt: true },
    });
    const hotCount = _count._all;
    const earliest = _min.placedAt;
    return {
      hotCount,
      nextCoolsAt:
        hotCount > 0 && earliest
          ? coolsAt(earliest, this.coolDownMs).toISOString()
          : null,
      serverTime: now.toISOString(),
    };
  }
}
```

In `orders.module.ts`: import `HotStatusService`, add it to `providers`
(after `OrdersService`), and add this line to the header's public surface list
after the `/account/orders` line:

```
//   - GET /account/hot-status   — signed-in user's hot count + next coolsAt (banner)
```

- [ ] **Step 4: Run service tests**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders/hot-status.service.spec.ts`
Expected: 4 passed.

- [ ] **Step 5: Write the failing controller tests**

In `account.controller.spec.ts`, change `make` to also build a hot-status
mock and pass it as the third constructor argument:

```ts
import type { HotStatusService } from "./hot-status.service";

function make(
  user: { id: number; username: string; email: string } | null,
  items: unknown[] = [],
  hot: unknown = { hotCount: 0, nextCoolsAt: null, serverTime: "x" },
) {
  const orders = { listForAccount: vi.fn().mockResolvedValue(items) };
  const sessions = { resolveUser: vi.fn().mockResolvedValue(user) };
  const hotStatus = { forUser: vi.fn().mockResolvedValue(hot) };
  return {
    controller: new AccountController(
      orders as unknown as OrdersService,
      sessions as unknown as AuthSessionService,
      hotStatus as unknown as HotStatusService,
    ),
    orders,
    hotStatus,
  };
}
```

Add tests:

```ts
it("mounts GET hot-status", () => {
  expect(
    Reflect.getMetadata(PATH_METADATA, AccountController.prototype.hotStatus),
  ).toBe("hot-status");
});

it("hot-status 401s when signed out (no, forged, or expired cookie)", async () => {
  const { controller, hotStatus } = make(null);
  await expect(controller.hotStatus(req, res)).rejects.toBeInstanceOf(
    UnauthorizedException,
  );
  expect(hotStatus.forUser).not.toHaveBeenCalled();
});

it("hot-status returns the service snapshot for the signed-in user", async () => {
  const snap = {
    hotCount: 2,
    nextCoolsAt: "2026-10-05T12:05:00.000Z",
    serverTime: "2026-10-05T12:00:00.000Z",
  };
  const { controller, hotStatus } = make(
    { id: 1, username: "ana", email: "ana@example.test" },
    [],
    snap,
  );
  await expect(controller.hotStatus(req, res)).resolves.toEqual(snap);
  expect(hotStatus.forUser).toHaveBeenCalledWith({
    id: 1,
    username: "ana",
    email: "ana@example.test",
  });
});
```

(`resolveUser` already returns `null` for forged and expired cookies — that
is pinned in `auth-session.service.spec.ts`; the controller only sees `null`.)

- [ ] **Step 6: Run to verify failure**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders/account.controller.spec.ts`
Expected: FAIL, `hotStatus` is not a function / undefined metadata.

- [ ] **Step 7: Add the route**

In `account.controller.ts`, import `HotStatusService` and
`HotStatusResponse`, add `private readonly hotStatusService: HotStatusService`
as the third constructor parameter, and add:

```ts
  // Banner feed: identified by the auth cookie alone; never returns orders.
  @Get("hot-status")
  async hotStatus(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HotStatusResponse> {
    const user = await this.sessions.resolveUser(req, res);
    if (!user) {
      throw new UnauthorizedException("sign in to see your hot coffees");
    }
    return this.hotStatusService.forUser(user);
  }
```

- [ ] **Step 8: Run BFF tests and checks**

Run: `pnpm --filter @mini-commerce/bff test && pnpm typecheck && pnpm lint && pnpm format`
Expected: all pass (BFF count was 238; now 245).

- [ ] **Step 9: Commit**

```bash
git add apps/bff/src/modules/orders packages/contracts/src/index.ts
git commit -m "feat(bff): GET /account/hot-status for the signed-in user"
```

---

### Task 2: Composite owner/placedAt indexes

**Files:**

- Modify: `apps/bff/prisma/schema.prisma` (model `Order` indexes)
- Create: `apps/bff/prisma/migrations/20261005140000_order_owner_placed_at_indexes/migration.sql`

**Interfaces:**

- Consumes: existing indexes `Order_ownerUsername_idx`, `Order_ownerEmail_idx`.
- Produces: `Order_ownerUsername_placedAt_idx`, `Order_ownerEmail_placedAt_idx`.

- [ ] **Step 1: Edit the schema**

In `model Order`, replace

```prisma
  @@index([ownerUsername])
  @@index([ownerEmail])
```

with

```prisma
  // Composite so GET /account/hot-status (owner + placedAt range) and
  // GET /account/orders (owner, newest first) are index scans.
  @@index([ownerUsername, placedAt])
  @@index([ownerEmail, placedAt])
```

- [ ] **Step 2: Write the migration**

`apps/bff/prisma/migrations/20261005140000_order_owner_placed_at_indexes/migration.sql`:

```sql
-- DropIndex
DROP INDEX "Order_ownerUsername_idx";

-- DropIndex
DROP INDEX "Order_ownerEmail_idx";

-- CreateIndex
CREATE INDEX "Order_ownerUsername_placedAt_idx" ON "Order"("ownerUsername", "placedAt");

-- CreateIndex
CREATE INDEX "Order_ownerEmail_placedAt_idx" ON "Order"("ownerEmail", "placedAt");
```

- [ ] **Step 3: Verify schema and migrations agree**

With the local stack up (`./dev up`) and `.env` loaded:

```bash
set -a; . ./.env; set +a
pnpm --filter @mini-commerce/bff exec prisma migrate deploy
pnpm --filter @mini-commerce/bff exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: deploy applies `20261005140000_order_owner_placed_at_indexes`; diff
prints "No difference detected" and exits 0. Then
`pnpm --filter @mini-commerce/bff exec prisma generate && pnpm typecheck`.

- [ ] **Step 4: Commit**

```bash
git add apps/bff/prisma
git commit -m "perf(bff): composite owner + placedAt indexes on Order"
```

---

### Task 3: Smoke check 21 and smoke-count docs

**Files:**

- Modify: `scripts/pg/smoke.py` (new check after `GET /account/orders (latest hot)`)
- Modify: `CLAUDE.md:41`, `README.md:75`, `docs/architecture/orchestrator-python.md:87`,
  `docs/cli-reference.md:57`, `docs/local-development.md` (sample block +
  "All 20"), `docs/quality-strategy/README.md:83`,
  `docs/uat/walkthrough-uat.md:79,85`

**Interfaces:**

- Consumes: `GET /account/hot-status` from Task 1; `acct_jar` in `smoke.py`.

- [ ] **Step 1: Add the check**

In `scripts/pg/smoke.py`, directly after
`results.append(_check("GET  /account/orders (latest hot)", account_orders))`:

```python
    def hot_status() -> None:
        _, payload = request_json(f"{API_BASE}/account/hot-status", expect_status=200, cookie_jar=acct_jar)
        if not isinstance(payload, dict):
            raise HttpError(f"unexpected hot-status payload: {payload!r}")
        if not isinstance(payload.get("hotCount"), int) or payload["hotCount"] < 1:
            raise HttpError(f"hotCount should be >= 1, got {payload.get('hotCount')!r}")
        next_cools = payload.get("nextCoolsAt")
        server_time = payload.get("serverTime")
        if not isinstance(next_cools, str) or not isinstance(server_time, str):
            raise HttpError(f"nextCoolsAt/serverTime must be strings: {payload!r}")
        # ISO-8601 strings in the same UTC format compare chronologically.
        if not next_cools > server_time:
            raise HttpError(f"nextCoolsAt {next_cools!r} is not after serverTime {server_time!r}")
    results.append(_check("GET  /account/hot-status (hot count)", hot_status))
```

- [ ] **Step 2: Update counts**

Change every "20" smoke count listed in **Files** to "21". In
`docs/local-development.md`'s sample output add
`  ✓ GET  /account/hot-status (hot count)` after
`  ✓ GET  /account/orders (latest hot)`. In `CLAUDE.md:41` the comment becomes
`# 21 endpoint checks (typed scene shape + order temperature + SSE frame + login + hot status)`.
Do not touch `docs/next-steps/login.md` or `docs/next-steps/order-temperature.md`
(historical records).

Verify none remain: `git grep -n -E "\b20 (endpoint |smoke )?checks|All 20" -- '*.md' ':!docs/superpowers' ':!docs/next-steps'`
Expected: no output.

- [ ] **Step 3: Run**

Rebuild the BFF image so the new route is live, then smoke:

```bash
docker compose -f infra/docker/compose.yaml up -d --build bff
./dev smoke
pnpm pg:test
```

Expected: `All 21 smoke checks passed.`; pg tests OK.

- [ ] **Step 4: Commit**

```bash
git add scripts/pg/smoke.py CLAUDE.md README.md docs
git commit -m "test(smoke): check GET /account/hot-status (21 checks)"
```

---

### Task 4: Web countdown logic and shared second-tick hook

**Files:**

- Create: `apps/web/src/lib/hot-status/countdown.ts`
- Create: `apps/web/src/lib/hot-status/countdown.test.ts`
- Create: `apps/web/src/lib/hooks/use-second-tick.ts`
- Modify: `apps/web/src/components/sections/LatestOrderCard.tsx` (import both)

**Interfaces:**

- Produces (all from `@/lib/hot-status/countdown`):
  - `clockSkewMs(serverTimeIso: string, clientNowMs: number): number`
  - `remainingMs(nextCoolsAtIso: string, clientNowMs: number, skewMs: number): number`
  - `formatRemaining(ms: number): string`
  - `refetchDelayMs(nextCoolsAtIso: string, clientNowMs: number, skewMs: number, pollMs: number): number | null`
  - `hotCountText(hotCount: number): string`
  - `coolsInText(hotCount: number): string`
- Produces: `useSecondTick(enabled: boolean): number` from `@/lib/hooks/use-second-tick`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/hot-status/countdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clockSkewMs,
  coolsInText,
  formatRemaining,
  hotCountText,
  refetchDelayMs,
  remainingMs,
} from "./countdown";

const T = Date.parse("2026-10-05T12:00:00.000Z");

describe("clockSkewMs", () => {
  it("is server minus client", () => {
    expect(clockSkewMs("2026-10-05T12:00:10.000Z", T)).toBe(10_000);
    expect(clockSkewMs("2026-10-05T11:59:50.000Z", T)).toBe(-10_000);
  });
  it("is 0 for an unparseable serverTime", () => {
    expect(clockSkewMs("nope", T)).toBe(0);
  });
});

describe("remainingMs", () => {
  it("measures against server time via skew", () => {
    // Client clock 60 s behind the server: 3 min left on the server clock.
    expect(remainingMs("2026-10-05T12:04:00.000Z", T, 60_000)).toBe(180_000);
  });
  it("clamps at 0 once passed", () => {
    expect(remainingMs("2026-10-05T11:59:00.000Z", T, 0)).toBe(0);
  });
  it("is 0 for an unparseable nextCoolsAt", () => {
    expect(remainingMs("nope", T, 0)).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("renders m:ss, rounding up partial seconds", () => {
    expect(formatRemaining(192_000)).toBe("3:12");
    expect(formatRemaining(1)).toBe("0:01");
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(3_600_000)).toBe("60:00");
  });
  it("never renders NaN", () => {
    expect(formatRemaining(Number.NaN)).toBe("0:00");
    expect(formatRemaining(-5)).toBe("0:00");
  });
});

describe("refetchDelayMs", () => {
  it("fires 500 ms after nextCoolsAt", () => {
    expect(refetchDelayMs("2026-10-05T12:00:05.000Z", T, 0, 15_000)).toBe(
      5_500,
    );
  });
  it("fires 500 ms from now when already passed", () => {
    expect(refetchDelayMs("2026-10-05T11:00:00.000Z", T, 0, 15_000)).toBe(500);
  });
  it("returns null when polling will get there first (also avoids setTimeout overflow)", () => {
    expect(refetchDelayMs("2026-10-05T12:00:20.000Z", T, 0, 15_000)).toBe(null);
    expect(refetchDelayMs("2027-10-05T12:00:00.000Z", T, 0, 15_000)).toBe(null);
  });
  it("returns null for an unparseable nextCoolsAt", () => {
    expect(refetchDelayMs("nope", T, 0, 15_000)).toBe(null);
  });
});

describe("copy", () => {
  it("singular", () => {
    expect(hotCountText(1)).toBe("1 hot coffee");
    expect(coolsInText(1)).toBe("cools in");
  });
  it("plural", () => {
    expect(hotCountText(2)).toBe("2 hot coffees");
    expect(coolsInText(2)).toBe("next one cools in");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @mini-commerce/web exec vitest run src/lib/hot-status/countdown.test.ts`
Expected: FAIL, cannot resolve `./countdown`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/hot-status/countdown.ts`:

```ts
// Pure countdown math for the hot coffee banner. Time is measured on the
// server's clock: skew = serverTime − client clock at receipt.

const REFETCH_GRACE_MS = 500;

export function clockSkewMs(
  serverTimeIso: string,
  clientNowMs: number,
): number {
  const server = Date.parse(serverTimeIso);
  return Number.isNaN(server) ? 0 : server - clientNowMs;
}

export function remainingMs(
  nextCoolsAtIso: string,
  clientNowMs: number,
  skewMs: number,
): number {
  const target = Date.parse(nextCoolsAtIso);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, target - (clientNowMs + skewMs));
}

export function formatRemaining(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Delay for the one-shot refetch just after the next coffee cools, or null
// when regular polling will refetch first. Returning null for long delays
// also keeps clear of setTimeout's 2^31-1 ms ceiling.
export function refetchDelayMs(
  nextCoolsAtIso: string,
  clientNowMs: number,
  skewMs: number,
  pollMs: number,
): number | null {
  if (Number.isNaN(Date.parse(nextCoolsAtIso))) return null;
  const delay =
    remainingMs(nextCoolsAtIso, clientNowMs, skewMs) + REFETCH_GRACE_MS;
  return delay > pollMs ? null : delay;
}

export function hotCountText(hotCount: number): string {
  return hotCount === 1 ? "1 hot coffee" : `${hotCount} hot coffees`;
}

export function coolsInText(hotCount: number): string {
  return hotCount === 1 ? "cools in" : "next one cools in";
}
```

`apps/web/src/lib/hooks/use-second-tick.ts` (moved verbatim from
`LatestOrderCard.tsx`):

```ts
import { useEffect, useState } from "react";

// Current time, re-rendered once a second while enabled.
export function useSecondTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
```

In `LatestOrderCard.tsx`: delete the local `useSecondTick` and
`formatRemaining`, import them from `@/lib/hooks/use-second-tick` and
`@/lib/hot-status/countdown`, and drop `useEffect, useState` from the React
import if no longer used.

- [ ] **Step 4: Run**

Run: `pnpm --filter @mini-commerce/web test && pnpm typecheck && pnpm lint && pnpm format`
Expected: all pass (web count was 35; now 48).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib apps/web/src/components/sections/LatestOrderCard.tsx
git commit -m "feat(web): hot-status countdown logic and shared second tick"
```

---

### Task 5: Web hook, banner, and page wiring

**Files:**

- Modify: `apps/web/src/lib/api/expresso-api.ts` (type re-export, mock + real + public `getHotStatus`)
- Create: `apps/web/src/lib/hot-status/visible.ts`
- Create: `apps/web/src/lib/hot-status/visible.test.ts`
- Create: `apps/web/src/lib/hot-status/use-hot-status.ts`
- Create: `apps/web/src/components/sections/HotCoffeeBanner.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**

- Consumes: everything from Task 4; `HotStatusResponse` from contracts
  (Task 1); `useAuth()` (`user`, `refresh`); `ExpressoApiError` (`.status`).
- Produces: `expressoApi.getHotStatus(): Promise<HotStatusResponse>`;
  `HOT_STATUS_KEY = "orders-hot-status"`; `HOT_STATUS_POLL_MS = 15_000`;
  `useHotStatus(): HotStatusSnapshot | null`;
  `<HotCoffeeBanner onView={() => void} />` with `data-testid="hot-coffee-banner"`,
  `data-testid="hot-coffee-count"`, `data-testid="hot-coffee-countdown"`.

Key choice: `HOT_STATUS_KEY` starts with `orders` so `AuthProvider`'s existing
`refreshOrders` (revalidates every `orders*` key on sign-in) covers sign-in
and registration with no AuthProvider change. Sign-out sets the key to `null`.

- [ ] **Step 1: Write the failing `pickVisible` test**

`apps/web/src/lib/hot-status/visible.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickVisible } from "./visible";

const snap = {
  status: { hotCount: 1, nextCoolsAt: "x", serverTime: "y" },
  skewMs: 0,
};

describe("pickVisible", () => {
  it("shows a snapshot with at least one hot coffee", () => {
    expect(pickVisible(true, snap, undefined)).toBe(snap);
  });
  it("hides when signed out", () => {
    expect(pickVisible(false, snap, undefined)).toBeNull();
  });
  it("hides stale data while the last fetch failed", () => {
    expect(pickVisible(true, snap, new Error("503"))).toBeNull();
  });
  it("hides with zero hot coffees or no data yet", () => {
    expect(
      pickVisible(
        true,
        { ...snap, status: { ...snap.status, hotCount: 0 } },
        undefined,
      ),
    ).toBeNull();
    expect(pickVisible(true, undefined, undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @mini-commerce/web exec vitest run src/lib/hot-status/visible.test.ts`
Expected: FAIL, cannot resolve `./visible`.

- [ ] **Step 3: Implement `visible.ts`**

```ts
import type { HotStatusResponse } from "@/lib/api/expresso-api";

export interface HotStatusSnapshot {
  status: HotStatusResponse;
  // serverTime − client clock at receipt.
  skewMs: number;
}

// SWR keeps the last data after an error; the banner must not.
export function pickVisible(
  signedIn: boolean,
  data: HotStatusSnapshot | undefined,
  error: unknown,
): HotStatusSnapshot | null {
  if (!signedIn || error || !data || data.status.hotCount < 1) return null;
  return data;
}
```

- [ ] **Step 4: Add `getHotStatus` to the API client**

In `apps/web/src/lib/api/expresso-api.ts`:

- Add `HotStatusResponse` to both the contracts type import list and the
  type re-export list (next to `AccountOrdersResponse`).
- `mockApi` (demo mode, after `getAccountOrders`):

```ts
  async getHotStatus(): Promise<HotStatusResponse> {
    await simulateLatency();
    throw new ExpressoApiError("GET", "/account/hot-status", 401, {
      error: { message: "sign in to see your hot coffees" },
    });
  },
```

- `realApi` (after `getAccountOrders`):

```ts
  getHotStatus(): Promise<HotStatusResponse> {
    return request<HotStatusResponse>("GET", "/account/hot-status");
  },
```

- public `expressoApi` (after `getAccountOrders`):

```ts
  getHotStatus(): Promise<HotStatusResponse> {
    return isDemoMode() ? mockApi.getHotStatus() : realApi.getHotStatus();
  },
```

- [ ] **Step 5: Implement the hook**

`apps/web/src/lib/hot-status/use-hot-status.ts`:

```ts
"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useAuth } from "@/components/auth/AuthProvider";
import { expressoApi, ExpressoApiError } from "@/lib/api/expresso-api";
import { clockSkewMs, refetchDelayMs } from "./countdown";
import { pickVisible, type HotStatusSnapshot } from "./visible";

// "orders" prefix: AuthProvider revalidates every orders* key on sign-in.
export const HOT_STATUS_KEY = "orders-hot-status";
export const HOT_STATUS_POLL_MS = 15_000;

export function useHotStatus(): HotStatusSnapshot | null {
  const { user, refresh } = useAuth();
  const { data, error, mutate } = useSWR<HotStatusSnapshot, Error>(
    user ? HOT_STATUS_KEY : null,
    async () => {
      try {
        const status = await expressoApi.getHotStatus();
        return { status, skewMs: clockSkewMs(status.serverTime, Date.now()) };
      } catch (err) {
        // The BFF already cleared the cookie; drop the stale user.
        if (err instanceof ExpressoApiError && err.status === 401) {
          void refresh().catch(() => undefined);
        }
        throw err;
      }
    },
    {
      refreshInterval: HOT_STATUS_POLL_MS,
      refreshWhenHidden: false,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );

  const nextCoolsAt = data?.status.nextCoolsAt ?? null;
  const skewMs = data?.skewMs ?? 0;
  useEffect(() => {
    if (!nextCoolsAt) return;
    const delay = refetchDelayMs(
      nextCoolsAt,
      Date.now(),
      skewMs,
      HOT_STATUS_POLL_MS,
    );
    if (delay === null) return;
    const id = setTimeout(() => void mutate(), delay);
    return () => clearTimeout(id);
  }, [nextCoolsAt, skewMs, mutate]);

  return pickVisible(Boolean(user), data, error);
}
```

- [ ] **Step 6: Implement the banner**

`apps/web/src/components/sections/HotCoffeeBanner.tsx`:

```tsx
"use client";

/**
 * HotCoffeeBanner - shown to a signed-in user while at least one coffee
 * placed for them is hot. Fed only by GET /account/hot-status (polled);
 * never reads the order list. The live region carries the count only so
 * the ticking countdown does not flood screen readers.
 */

import { Flame } from "lucide-react";
import { useSecondTick } from "@/lib/hooks/use-second-tick";
import {
  coolsInText,
  formatRemaining,
  hotCountText,
  remainingMs,
} from "@/lib/hot-status/countdown";
import { useHotStatus } from "@/lib/hot-status/use-hot-status";

export function HotCoffeeBanner({ onView }: { onView: () => void }) {
  const snap = useHotStatus();
  const now = useSecondTick(snap !== null);
  if (!snap) return null;
  const { status, skewMs } = snap;
  const left = status.nextCoolsAt
    ? formatRemaining(remainingMs(status.nextCoolsAt, now, skewMs))
    : "0:00";

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
      style={{
        flex: "0 0 auto",
        borderBottom: "1px solid var(--warning)",
        color: "var(--foreground)",
      }}
      data-testid="hot-coffee-banner"
    >
      <Flame
        className="h-4 w-4 shrink-0"
        style={{ color: "var(--warning)" }}
        aria-hidden
      />
      <span role="status" aria-live="polite" data-testid="hot-coffee-count">
        ☕ {hotCountText(status.hotCount)}
      </span>
      <span
        className="tabular-nums"
        style={{ color: "var(--muted-foreground)" }}
        data-testid="hot-coffee-countdown"
      >
        — {coolsInText(status.hotCount)} {left}
      </span>
      <button
        type="button"
        className="ml-auto text-xs font-medium underline"
        onClick={onView}
      >
        View
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Wire into the page**

In `apps/web/app/page.tsx`:

- Imports: `useSWRConfig` from `swr` (alongside `useSWR`),
  `HotCoffeeBanner` from `@/components/sections/HotCoffeeBanner`,
  `HOT_STATUS_KEY` from `@/lib/hot-status/use-hot-status`.
- In the component: `const { mutate: globalMutate } = useSWRConfig();`
- In `handleOrderPlaced`, first line of the callback:
  `void globalMutate(HOT_STATUS_KEY);` and add `globalMutate` to its deps.
- Add a handler:

```tsx
const handleViewHot = useCallback(() => {
  setSelectedOrderId(null);
  setOrdersScope("account");
  setSection("orders");
}, [setSection]);
```

- Wrap the returned tree in a fragment with the banner first (the parent
  `.shell-content-full` is a flex column, so the banner sits above the stage):

```tsx
return (
  <>
    <HotCoffeeBanner onView={handleViewHot} />
    <div className="home-stage">{/* ...unchanged... */}</div>
  </>
);
```

- [ ] **Step 8: Run**

Run: `pnpm --filter @mini-commerce/web test && pnpm typecheck && pnpm lint && pnpm format && pnpm --filter @mini-commerce/web build`
Expected: all pass (web count 52).

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(web): hot coffee banner polled from /account/hot-status"
```

---

### Task 6: E2E coverage

**Files:**

- Modify: `tests/e2e/fixtures/commerce-api.ts` (hot-status route)
- Create: `tests/e2e/tests/hot-status.spec.ts`
- Modify: `tests/e2e/tests/login-real-bff.spec.ts` (assert banner in first test)

**Interfaces:**

- Consumes: banner test ids from Task 5; existing mock state (`orders`,
  `currentUser`, `coolDownMs`).

- [ ] **Step 1: Mock route**

In `installCommerceApiMock`, directly after the `GET /account/orders` branch:

```ts
if (method === "GET" && path === "/account/hot-status") {
  if (!currentUser) {
    return fulfillJson(route, 401, {
      statusCode: 401,
      error: { message: "sign in to see your hot coffees" },
    });
  }
  const user = currentUser;
  const now = Date.now();
  const hot = [...orders.values()].filter(
    (o) =>
      o.owner &&
      ("username" in o.owner
        ? o.owner.username === user.username
        : o.owner.email === user.email) &&
      now - Date.parse(o.placedAt) < coolDownMs,
  );
  const earliest = Math.min(...hot.map((o) => Date.parse(o.placedAt)));
  return fulfillJson(route, 200, {
    hotCount: hot.length,
    nextCoolsAt: hot.length
      ? new Date(earliest + coolDownMs).toISOString()
      : null,
    serverTime: new Date(now).toISOString(),
  });
}
```

- [ ] **Step 2: Mocked spec**

`tests/e2e/tests/hot-status.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  installCommerceApiMock,
  makeOrder,
  type Product,
} from "../fixtures/commerce-api";

const products: Product[] = [
  {
    productId: "prod_espresso_001",
    sku: "ESP-001",
    name: "Classic Espresso",
    description: "Rich, bold single-shot espresso.",
    category: "drink",
    price: { amountMinor: 350, currency: "USD" },
    inventory: 50,
  },
];
const ana = {
  username: "ana",
  email: "ana@example.test",
  password: "espresso-demo",
};
const HOUR = 60 * 60 * 1000;

async function signIn(page: Page) {
  await page.getByTestId("account-signin").click();
  const dialog = page.getByTestId("signin-dialog");
  await dialog.getByLabel("Username or email").fill(ana.username);
  await dialog.getByLabel("Password").fill(ana.password);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("hot coffee banner", () => {
  test("signed out: no banner and no hot-status request", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/account/hot-status")) calls.push(r.url());
    });
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      seedOrders: [
        makeOrder("ord_hot", new Date().toISOString(), { username: "ana" }),
      ],
    });
    await page.goto("/");
    await expect(page.getByTestId("account-signin")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("hot-coffee-banner")).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test("signed in with two hot coffees: count and countdown", async ({
    page,
  }) => {
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      seedOrders: [
        makeOrder("ord_a", new Date().toISOString(), { username: "ana" }),
        makeOrder("ord_b", new Date().toISOString(), {
          email: "ana@example.test",
        }),
        makeOrder("ord_cold", new Date(Date.now() - HOUR).toISOString(), {
          username: "ana",
        }),
        makeOrder("ord_ben", new Date().toISOString(), { username: "ben" }),
      ],
    });
    await page.goto("/");
    await signIn(page);
    const banner = page.getByTestId("hot-coffee-banner");
    await expect(banner.getByTestId("hot-coffee-count")).toHaveText(
      "☕ 2 hot coffees",
    );
    await expect(banner.getByTestId("hot-coffee-count")).toHaveAttribute(
      "role",
      "status",
    );
    await expect(banner.getByTestId("hot-coffee-countdown")).toHaveText(
      /next one cools in \d+:\d{2}/,
    );
  });

  test("banner disappears when the last coffee cools", async ({ page }) => {
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      coolDownMs: 4_000,
      seedOrders: [
        makeOrder("ord_a", new Date().toISOString(), { username: "ana" }),
      ],
    });
    await page.goto("/");
    await signIn(page);
    const banner = page.getByTestId("hot-coffee-banner");
    await expect(banner.getByTestId("hot-coffee-count")).toHaveText(
      "☕ 1 hot coffee",
    );
    // Refetch fires 500 ms after nextCoolsAt — well before the 15 s poll.
    await expect(banner).toHaveCount(0, { timeout: 8_000 });
  });

  test("signing out hides the banner", async ({ page }) => {
    await installCommerceApiMock(page, {
      products,
      accounts: [ana],
      seedOrders: [
        makeOrder("ord_a", new Date().toISOString(), { username: "ana" }),
      ],
    });
    await page.goto("/");
    await signIn(page);
    await expect(page.getByTestId("hot-coffee-banner")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByTestId("hot-coffee-banner")).toHaveCount(0);
  });
});
```

Note: the 4 s cool-down test seeds the order at test start; sign-in takes
well under 4 s, so the banner is visible first. If it flakes on CI, raise
`coolDownMs` to 6 000 and the hide timeout to 10 000.

- [ ] **Step 3: Real-BFF assertion**

In `login-real-bff.spec.ts`, first test, after the latest-card temperature
assertion add:

```ts
await expect(page.getByTestId("hot-coffee-count")).toHaveText(
  "☕ 1 hot coffee",
);
```

- [ ] **Step 4: Run**

Run the mocked spec plus the suites that render the page:

```bash
pnpm --filter @mini-commerce/e2e exec playwright test tests/hot-status.spec.ts tests/account-orders.spec.ts tests/login.spec.ts tests/visual-integrity.spec.ts
```

Expected: all pass. Then, with the real stack up (`./dev up web` after
`docker compose -f infra/docker/compose.yaml up -d --build bff web`), run
`tests/login-real-bff.spec.ts` the same way it was run for the login feature.
Expected: pass. The 6 pre-existing `visualizer-interaction.spec.ts` failures
are out of scope.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): hot coffee banner mocked and real-BFF coverage"
```

---

### Task 7: Docs

**Files:**

- Create: `docs/next-steps/hot-status.md`
- Modify: `docs/next-steps/README.md` (new entry after Login)
- Modify: `docs/architecture/bff-modules.md` (Auth and account orders section)

- [ ] **Step 1: Write `docs/next-steps/hot-status.md`**

```markdown
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
```

- [ ] **Step 2: Index and architecture lines**

In `docs/next-steps/README.md`, insert after the Login entry (5.) and
renumber the following entries by one:

```markdown
6. **[Hot Coffee Banner](hot-status.md)** — _core shipped 2026-10-05_
   - Polled `GET /account/hot-status` banner; Punch load chain and SSE push
     are follow-ups.
```

In `docs/architecture/bff-modules.md`, in "Auth and account orders", after
the `GET /account/orders` bullet:

```markdown
- **`orders`** also serves `GET /account/hot-status` (`AccountController` →
  `HotStatusService`): hot count and next `coolsAt` for the signed-in user,
  one aggregate query, never order rows.
```

- [ ] **Step 3: Run**

Run: `pnpm format`
Expected: pass (run `pnpm exec prettier --write` on the touched docs first if
it fails).

- [ ] **Step 4: Commit**

```bash
git add docs/next-steps docs/architecture/bff-modules.md
git commit -m "docs: hot coffee banner next-steps and module note"
```
