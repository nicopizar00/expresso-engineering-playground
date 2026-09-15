# UAT — README Walkthrough Validation

End-to-end user acceptance test for the `README.md` walkthrough.

**Audience.** A Claude Code agent (or any LLM agent that can run shell
commands) in a fresh terminal on macOS or Linux, OR a developer following
the same steps by hand. Both produce the same report.

**Preconditions.**

- Repo cloned and the runner's `$PWD` is the repo root.
- Only Docker Desktop / Engine + Homebrew on `PATH`. The walkthrough
  promises a Docker-only experience, so the test should mask Node and
  pnpm to confirm that:
  ```bash
  hash -r
  command -v node && echo "WARNING: node on PATH"
  command -v pnpm && echo "WARNING: pnpm on PATH"
  ```
  If either is on `PATH`, document it but do not abort — the
  walkthrough should still succeed.
- Optional clean slate before starting:
  ```bash
  ./dev down 2>/dev/null || true
  docker volume rm $(docker volume ls -q --filter "name=postgres") 2>/dev/null || true
  rm -f .env
  ```

**Output format.** For every numbered step, emit one line to stdout:

```
[PASS]  step-N — <one-line summary>
[FAIL]  step-N — expected <X>, got <Y>          # exit non-zero at end if any FAIL
[DRIFT] step-N — <observation>                  # not a failure; documents a known gap
[SKIP]  step-N — <reason>                       # only when a precondition genuinely couldn't be met
```

At the end, print:

```
Summary: <P> passed / <F> failed / <D> drifted / <S> skipped
Runtime: <hh:mm:ss>
```

Followed by:

- **Drift register** — bullet list of every `[DRIFT]` line, with a
  one-sentence recommendation for the next iteration.
- **Failure detail** — for every `[FAIL]`, the exact command, expected
  result, and actual result (stdout/stderr excerpt).

Exit `0` if and only if there are zero `[FAIL]` rows. `[DRIFT]` does
not fail the run.

---

## 1. Preflight (4 checks)

| #   | Command                  | Pass criterion                                                                                                                                     |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | `docker --version`       | Exits 0; prints `Docker version <major>.<minor>.<patch>` with `<major>` ≥ 24.                                                                      |
| 1.2 | `docker compose version` | Exits 0; output contains `v2.`                                                                                                                     |
| 1.3 | `jq --version`           | Exits 0; output matches `^jq-1\.[0-9]+`                                                                                                            |
| 1.4 | `./dev doctor`           | Exits 0; stdout contains `All required prerequisites are available.` (warning about `.env` does not yet auto-fix in `./dev` — see drift register). |

Human checklist:

- [ ] All four versions are present and meet minimums.
- [ ] `./dev doctor` ends green (after `cp .env.example .env`).

---

## 2. Quick Start (3 checks)

| #   | Command                            | Pass criterion                                                                                                                                |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | `cp .env.example .env && ./dev up` | Exits 0; stdout contains `BFF is running on http://localhost:3001` AND `Postgres is healthy` AND `Schema is up to date`.                      |
| 2.2 | `./dev status`                     | Exits 0; output lists `postgres`, `bff`, `otel-collector` with `State=running`. The `Health` column should be `healthy` for postgres and bff. |
| 2.3 | `./dev smoke`                      | Exits 0; final line is `All 15 smoke checks passed.`                                                                                          |

Human checklist:

- [ ] `./dev up` completes without errors.
- [ ] Three containers running and healthy.
- [ ] All 15 smoke checks pass (includes the SSE frame against `/visualization-updates`).

---

## 3. BFF endpoints via curl (11 checks)

All assertions use `jq -e` so a non-matching shape exits non-zero.

| #    | Command                                                                                                                                                                                                       | Pass criterion                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1  | `curl -s http://localhost:3001/health \| jq -e '.status == "ok"'`                                                                                                                                             | exit 0                                                                                                                                                                                                                                                 |
| 3.2  | `curl -s http://localhost:3001/catalog/products \| jq -e '.items \| length == 1'`                                                                                                                             | exit 0                                                                                                                                                                                                                                                 |
| 3.3  | `curl -s http://localhost:3001/catalog/products/prod_espresso \| jq -e '.id == "prod_espresso"'`                                                                                                              | exit 0                                                                                                                                                                                                                                                 |
| 3.4  | `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3001/cart/items -H 'Content-Type: application/json' -d '{"productId":"prod_espresso","quantity":1}'`                                         | output `201`                                                                                                                                                                                                                                           |
| 3.5  | `curl -s http://localhost:3001/cart \| jq -e '.items \| length >= 1'`                                                                                                                                         | exit 0                                                                                                                                                                                                                                                 |
| 3.6  | `ORDER_ID=$(curl -s -X POST http://localhost:3001/checkout -H 'Content-Type: application/json' -d '{}' \| jq -r '.orderId'); [ -n "$ORDER_ID" ]`                                          | non-empty `$ORDER_ID`                                                                                                                                                                                                                                  |
| 3.7  | `curl -s http://localhost:3001/orders \| jq -e '.items \| length >= 1'` (**must be `.items`, not `.orders`**)                                                                                                 | exit 0                                                                                                                                                                                                                                                 |
| 3.8  | `curl -s "http://localhost:3001/orders/$ORDER_ID" \| jq -e '.id == env.ORDER_ID'`                                                                                                                             | exit 0                                                                                                                                                                                                                                                 |
| 3.9  | `curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:3001/orders/$ORDER_ID/manage" -H 'Content-Type: application/json' -d '{"action":"mark_prepared"}'`                                          | output `202`                                                                                                                                                                                                                                           |
| 3.10 | `curl -s http://localhost:3001/visualization-data \| jq -e '.items \| length >= 1'`                                                                                                                           | exit 0                                                                                                                                                                                                                                                 |
| 3.11 | `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3001/catalog/products -H 'Content-Type: application/json' -d '{"id":"prod_uat","name":"UAT","priceMinor":100,"currency":"EUR"}'` | output `404` — the product-creation route was removed from the controller so the catalog can never grow past one product (CUP-001). |

Human checklist:

- [ ] Each of 3.1–3.10 produces the documented shape and status.
- [ ] 3.7 explicitly returns `.items` (not `.orders`) — important: the k6 read-heavy scenario at `tests/performance/k6/scenarios/read-heavy/read-heavy.ts` previously asserted `.orders`. If that scenario passes today, the bug was fixed; if it fails, file a follow-up.

---

## 4. Web app single page and sections (5 checks)

Run `./dev up web` once before this section. The web app has exactly one
route (`/`); everything below is a section switched via header nav buttons
(`Catalog`, `Orders`, `Performance`, `API`), not a separate URL. The
visualizer stage stays mounted above whichever section is active — it is
not itself a section.

| #   | Check                            | LLM assertion                                                          | Human "you should see"                                                                    |
| --- | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 4.1 | `/` loads                        | `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` → 200  | Catalog grid with 1 product (Cup of Coffee), the visualizer stage, and inline cart/checkout panel |
| 4.2 | Catalog section (default)        | HTML contains `Catalog` heading text                                   | Catalog grid, cart drawer, and inline checkout panel — no dedicated `/cart` or `/checkout` route |
| 4.3 | Orders section                   | Click the `Orders` header nav button                                   | Orders list (or a placed order's detail view), with status management actions              |
| 4.4 | Performance section               | Click the `Performance` header nav button                              | Mock-only Performance Playground, no live-telemetry claims                                 |
| 4.5 | API section                      | Click the `API` header nav button                                      | Developer console with API client matrix and demo-mode toggle (formerly `/dev`)            |

For LLM execution, mark a check `[PASS]` if the HTTP code matches AND
the page HTML contains a literal expected substring (e.g. `Add to cart`
for `/`). Section switches happen client-side (no new navigation/HTTP
request), so 4.3–4.5 must be verified with a browser or browser-automation
tool, not `curl`. If the substring check fails but the HTTP code is
correct, emit `[DRIFT]` rather than `[FAIL]`.

---

## 5. 3D Visualizer (4 checks)

Run `./dev up full` once. The visualizer is SSE-primary against
`GET /visualization-updates` with a 2 s polling fallback on
`GET /visualization-data`.

| #   | Command                                                                                          | Pass criterion                                                  |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 5.1 | `curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/`                                  | output `200`                                                    |
| 5.2 | `curl -s http://localhost:3002/ \| grep -i -c 'three'`                                           | `>= 1` (Three.js script tag present)                            |
| 5.3 | `curl -s http://localhost:3001/visualization-data \| jq -e '.scene.recentOrders \| length >= 0'` | exit 0 (polling-fallback feed used by the visualizer)           |
| 5.4 | `curl -sN --max-time 3 http://localhost:3001/visualization-updates \| grep -m1 -c '^data: '`     | `>= 1` (SSE-primary stream emits at least one frame within 3 s) |

Human checklist:

- [ ] Page at <http://localhost:3002> renders a 3D scene.
- [ ] HUD status line reaches `live (sse) · N objects` (SSE-primary, no manual reload required). If SSE is blocked, the HUD shows `live · N objects` (polling-fallback).
- [ ] Trigger a cart add or `POST /checkout` from another terminal and the scene repaints without a page reload.
- [ ] Status semantics in the scene reflect order state (not generic health colours).

---

## 6. Inner loop hot reload (1 check)

```bash
./dev dev &
WATCH_PID=$!
sleep 8                                  # let the watch settle
# Append a benign log line to the health controller
echo '' >> apps/bff/src/modules/health/health.controller.ts
sleep 12                                 # wait for nest --watch rebuild
curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/health
kill -INT $WATCH_PID 2>/dev/null || true
```

Pass criterion: the final `curl` outputs `200`. Revert the edit before
ending the test:

```bash
git checkout -- apps/bff/src/modules/health/health.controller.ts
```

---

## 7. Performance smoke (1 check)

| #   | Command            | Pass criterion                                                                                                                                        |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | `./dev perf:smoke` | Exits 0; `tests/performance/k6/reports/smoke-summary.json` exists and is valid JSON (`jq . tests/performance/k6/reports/smoke-summary.json` exits 0). |

Cleanup (do not fail the UAT on this):

```bash
./dev perf:clean
```

---

## 8. Reset / teardown (2 checks)

| #   | Command                                                                                                         | Pass criterion                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 8.1 | `./dev down`                                                                                                    | Exits 0; `./dev status` reports `No services running.`                               |
| 8.2 | `./dev up && curl -s http://localhost:3001/orders \| jq -e '.items \| map(.id) \| contains(["'"$ORDER_ID"'"])'` | exit 0 — the order placed in 3.6 still exists, proving the postgres volume survived. |

---

## 9. Drift register (expected findings)

These items are **known gaps** discovered during the planning phase. The
UAT prompt should flag them as `[DRIFT]`, not `[FAIL]`, and include them
verbatim in the drift register at the end of the report. The next
iteration can then decide which to act on.

1. **k6 `read-heavy` assertion may target `.orders[]` instead of
   `.items[]`.** Inspect
   `tests/performance/k6/scenarios/read-heavy/read-heavy.ts`. If the
   scenario uses `.json("orders")`, recommend changing it to
   `.json("items")` — the BFF response shape is `{ "items": [...] }`
   (`apps/bff/src/modules/orders/orders.controller.ts:10` →
   `OrdersResponse`).
2. ~~**`POST /catalog/products` exists but is undocumented.**~~ Resolved —
   the route was removed from `catalog.controller.ts` (the catalog is now
   strictly one product; see CUP-001). Check 3.11 asserts the route now
   404s.
3. **`tests/performance/k6/scenarios/load/` and
   `tests/performance/k6/scenarios/stress/` exist but have no CLI
   command.** Either wire them through `./dev perf:*` and
   `pnpm pg:perf:*`, or delete the empty scaffolds.
4. **`./dev` ships only `perf:smoke` and `perf:clean`.** The
   `checkout-flow` and `read-heavy` scenarios are reachable only via
   `pnpm pg:*` (which requires host Node + pnpm). For Docker-only
   parity, add `cmd_perf_checkout_flow` and `cmd_perf_read_heavy` to
   the `dev` script.
5. **`./dev doctor` warns about `.env` but does not auto-create it,
   while `pnpm pg:doctor` does.** Align both CLIs by adding the same
   `.env.example → .env` bootstrap to the `dev` script.

---

## 10. Authoritative source-of-truth references

When in doubt, read these files. They are the contract this UAT
validates against.

- `apps/bff/src/main.ts` — port (3001 default), CORS, global pipes.
- `apps/bff/src/modules/health/health.controller.ts`
- `apps/bff/src/modules/catalog/catalog.controller.ts`
- `apps/bff/src/modules/cart/cart.controller.ts`
- `apps/bff/src/modules/checkout/checkout.controller.ts`
- `apps/bff/src/modules/orders/orders.controller.ts`
- `apps/bff/src/modules/visualization/visualization.controller.ts`
- `apps/web/app/page.tsx` — the single page and its four nav-driven sections that the web UAT exercises.
- `infra/docker/compose.yaml` — service names, ports, profiles.
- `dev` — subcommand list and behavior.
- `README.md` — the walkthrough this UAT validates.

---

## How to invoke this UAT

LLM agent prompt template:

> Run the UAT described in `docs/uat/walkthrough-uat.md` against the
> current working tree. Execute each numbered step in order, emit one
> `[PASS]/[FAIL]/[DRIFT]/[SKIP]` line per step, and at the end print the
> summary block, drift register, and failure detail. Exit non-zero if
> any step `[FAIL]`s. Do **not** modify files outside `apps/bff/src/`,
> and only that file is touched in Step 6 — revert with
> `git checkout --` before exiting.

Human runner: open this file, work top to bottom, tick the boxes, and
log any `[FAIL]` or `[DRIFT]` line in the issue tracker before closing
the session.
