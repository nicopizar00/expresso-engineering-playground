# Workflow Naming Design

## Status

Approved in conversation on 2026-10-06 (naming rule, scenario-dir rename,
smoke removal, menu simplification). This is spec B of two; it ships after
spec A ([`2026-10-06-rest-route-conventions-design.md`](2026-10-06-rest-route-conventions-design.md)),
whose routes the names below are derived from.

## Problem

Workflow IDs mix nouns, verbs, and invented terms (`cart-fulfill`,
`place-order`, `purchase-flow`), say nothing about the channel, and do not
map to the API they load. Descriptions are full sentences. The Punch menu's
**Required Input** / **Generated Output** columns repeat every producer and
target, so the widest cells (`orders ← place-order, purchase-flow,
purchase-flow-browser`) dominate the table.

## Goals

- One naming rule: `<channel>-<resource>[-<sub>]`, where `channel` is `http`
  or `browser` and `resource[-sub]` is the spec A route the workflow drives.
  End-to-end journeys use `purchase` as their resource.
- Workflow ID, YAML file stem, `metadata.name`, scenario dir, scenario file,
  report file, and `./dev perf:<id>` command are all the same string.
- Browser scenarios mirror their `http-*` counterpart: same journey steps,
  same `group` names, same check names, same dataset output.
- Descriptions of 3–5 words.
- Menu shows dataset names only: `Name │ Description │ In │ Out`.
- Remove the `smoke` workflow and the unwired `load` / `stress` scenarios.

## Non-goals

- Changing datasets (`carts`, `orders`, `owned-orders`, `auth-tokens`),
  their columns, thresholds, or scenario logic beyond renames and browser
  alignment.
- Removing `targets:` from YAML. Punch still validates producer/consumer
  links with them; only the menu stops showing them.
- `./dev smoke` (the endpoint checks in `scripts/pg/smoke.py`). It is not a
  k6 workflow and stays.

## Name map

| Old                     | New                        | Route driven (spec A)    | Description                |
| ----------------------- | -------------------------- | ------------------------ | -------------------------- |
| `cart-fulfill`          | `http-cart`                | `POST /cart/items`       | Reserve carts, no checkout |
| `cart-fulfill-browser`  | `browser-cart`             | `POST /cart/items`       | Reserve carts in Chromium  |
| `place-order`           | `http-orders`              | `POST /orders`           | Create orders from carts   |
| `order-status`          | `http-orders-status`       | `GET /orders/:id/status` | Read order status          |
| `login`                 | `http-auth-login`          | `POST /auth/login`       | Log in, capture tokens     |
| `hot-status`            | `http-me-hot-status`       | `GET /me/hot-status`     | Poll hot-status banner     |
| `purchase-flow`         | `http-purchase`            | journey                  | Full purchase journey      |
| `purchase-flow-browser` | `browser-purchase`         | journey                  | Full purchase in Chromium  |
| `purchase-registered`   | `http-purchase-registered` | journey as demo user     | Purchase as demo users     |
| `smoke`                 | deleted                    | —                        | —                          |

Scenarios `load` and `stress` (no workflow, documented as unwired
placeholders) are deleted.

## Data chain after rename

```
http-cart / browser-cart          ── carts ──▶ http-orders
http-orders / http-purchase /
  browser-purchase                ── orders ──▶ http-orders-status
http-purchase-registered          ── owned-orders ──▶ http-auth-login (optional)
http-auth-login                   ── auth-tokens ──▶ http-me-hot-status
```

Every `targets:` list in YAML is rewritten to the new IDs.

## Menu (vendor/punch)

`src/punch/menu.py`, `_workflow_menu_rows`:

- Headers `("Name", "Description", "In", "Out")`.
- **In**: `requires` datasets, then `optional` datasets suffixed `?`,
  comma-joined. `—` when none.
- **Out**: `produces` dataset names, comma-joined. `—` when none.
- Producer lookup (`catalog.producers_of`) and target lists leave the table.
  The catalog is still loaded elsewhere for data preflight.

Target render:

```
Name                     │ Description                │ In            │ Out
browser-cart             │ Reserve carts in Chromium  │ —             │ carts
browser-purchase         │ Full purchase in Chromium  │ —             │ orders
http-auth-login          │ Log in, capture tokens     │ owned-orders? │ auth-tokens
http-cart                │ Reserve carts, no checkout │ —             │ carts
http-me-hot-status       │ Poll hot-status banner     │ auth-tokens   │ —
http-orders              │ Create orders from carts   │ carts         │ orders
http-orders-status       │ Read order status          │ orders        │ —
http-purchase            │ Full purchase journey      │ —             │ orders
http-purchase-registered │ Purchase as demo users     │ —             │ owned-orders
```

Committed directly in `vendor/punch` with its tests updated, pushed to its
remote, then the submodule pointer bumped in this repo.

## Browser alignment

`browser-cart` must run the same steps as `http-cart`, in the same order and
with the same `group` and check names, through the web UI. The same goes for
`browser-purchase` and `http-purchase`. Where a browser step has no UI
equivalent (for example the visualization read), the browser scenario
asserts the network response the UI triggers instead of skipping the step.
Each pair emits identical dataset rows.

## Decisions

| Topic           | Decision                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI             | `scripts/pg/cli.py` and `perf.py` register `perf:<new-id>` only. Old commands are removed, with no aliases.                                                        |
| CI k6 gate      | `.github/workflows/ci.yml` replaces `./dev perf:smoke` with `VUS=1 ITERATIONS=1 ./dev perf:http-purchase` (no `--produce`, so no dataset is written).              |
| Fresh-checkout  | CLAUDE.md and the performance docs point at `./dev perf:http-purchase` instead of `./dev perf:smoke`.                                                              |
| Reports         | `tests/performance/k6/reports/<new-id>-summary.json`. Old report files are not migrated.                                                                           |
| Build artifacts | Scenario `.ts` and built `.js` renamed together; the k6 build config, `compose.performance.yaml`, `Taskfile.yml`, and `package.json` scripts follow the new paths. |
| Docs            | Live docs move to the new IDs. Dated specs and plans under `docs/superpowers/` stay as written.                                                                    |
| Memory notes    | Project memories that name old workflows are updated after merge.                                                                                                  |

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm pg:test` green,
  including `test_k6_workflows.py`, `test_perf_ci_docs_contract.py`, and
  Punch's own test suite.
- `./bin/punch` lists exactly the nine workflows above with the target
  render's columns.
- The chain runs end to end: `perf:http-cart --produce carts` →
  `perf:http-orders --produce orders` → `perf:http-orders-status`, and
  `perf:http-purchase-registered --produce owned-orders` →
  `perf:http-auth-login --produce auth-tokens` → `perf:http-me-hot-status`.
- `perf:browser-cart` and `perf:browser-purchase` pass and their CSV rows
  match the columns of their `http-*` pairs.
- CI k6 job green on a real push.
- `grep` for old IDs (`cart-fulfill`, `place-order`, `order-status`,
  `purchase-flow`, `perf:smoke`, `perf:login`, `perf:hot-status`, and
  `purchase-registered` not preceded by `http-`) outside
  `docs/superpowers/` and `vendor/` returns nothing.
