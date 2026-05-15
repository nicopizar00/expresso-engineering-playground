# Orchestrator wire-up

## Goal

Make `pnpm pg:*` the **single canonical interface** for the local stack.
Today, three layers compete for the same actions:

1. `pnpm pg:<cmd>` → `scripts/playground.mjs` (Node CLI)
2. `./scripts/*.sh` (six shell scripts that duplicate the Node CLI)
3. Raw `docker compose -f infra/docker/compose.yaml ...`

The result is a mixed Docker-first model (web runs on the host, BFF in
Docker) with port-3001 collisions, manual `prisma migrate` / `prisma db
seed` steps after `pg:up`, and a `pg:seed` script that still prints
`TODO`. This thread closes all of that.

## Why now

- Phase 2 shipped Prisma for the catalog. Migration + seed must run after
  postgres is healthy but before the BFF starts serving; today this is a
  manual ritual.
- `apps/web/.env.local` requires a manual copy; postgres creds are
  hardcoded in `compose.yaml`; `playground.mjs` reads no `.env`. Three
  config sources, none authoritative.
- The Docker BFF and the host BFF (`pnpm pg:dev`) both bind 3001 — first
  one in wins, the second silently fails or stalls.

## Sub-tasks (execution order)

### 1. Containerize the web app
- New `apps/web/Dockerfile` — multi-stage, Next.js `output: "standalone"`.
- Enable `output: "standalone"` in `apps/web/next.config.mjs`.
- Same workspace-aware pattern as `apps/bff/Dockerfile`.

### 2. Add Compose profiles
- Add `web` service to `infra/docker/compose.yaml` under a `web` profile.
- Tag every service with one or more of: `core`, `web`, `viz`, `full`.
- Keep `visualizer` as a legacy alias for back-compat.

### 3. Centralize config in a root `.env`
- New root `.env` (gitignored) with `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB`, `BFF_PORT=3001`, `WEB_PORT=3000`, `VIZ_PORT=3002`,
  `DATABASE_URL=...`.
- Update `compose.yaml` to read from it via `${VAR:-default}` syntax.
- Update `.env.example` to mirror the keys exactly.
- Update `apps/bff/.env` to source from the root (or delete it and let
  compose pass `DATABASE_URL` through).

### 4. Make `playground.mjs` load the root `.env`
- Use Node's `--env-file=.env` flag in the `pnpm pg:*` script wrappers
  (root `package.json`), or parse `.env` manually at the top of
  `playground.mjs`.
- Drop the hardcoded `BFF_PORT = 3001` / `WEB_PORT = 3000` constants —
  read from `process.env`.

### 5. Wire `prisma migrate deploy` + `prisma db seed` into `pg:up`
- After postgres reports healthy, run `pnpm --filter @mini-commerce/bff
  exec prisma migrate deploy` (idempotent).
- Then run `prisma db seed` only if the catalog table is empty (to avoid
  re-seeding on every boot). The existing `seed.ts` already uses
  `upsert`, so a naive always-run is also safe — pick one.
- Both run BEFORE the BFF container starts.

### 6. Make `pg:seed` real
- Replace the stub body in `playground.mjs::seed()` with a call to
  `pnpm --filter @mini-commerce/bff exec prisma db seed`.
- Delete the "TODO" log lines.

### 7. Add `pg:status`
- `docker compose ps` (parsed) + per-service healthcheck + bound ports
  in one table. macOS-friendly output (use `column` or build a small
  table in JS).

### 8. `pg:up [target]`
- Accept one positional arg: `core` | `web` | `viz` | `full` (default
  `full`).
- Maps to a compose-profile invocation.
- Pre-flight port-collision detection: if `BFF_PORT` is taken by a host
  process, print the offending PID (`lsof -i:3001`) and prompt the user
  to kill it.

### 9. Switch `pg:dev` to `docker compose watch`
- Compose 2.22+ (ships with Docker Desktop on macOS) supports `watch`
  with sync/rebuild rules. Define `develop.watch` rules in
  `compose.yaml` for `bff` and `web`.
- `pg:dev` becomes `docker compose watch`.
- Keep `pg:dev:host` as an opt-in escape hatch (current host-side
  Turborepo flow) for users who prefer host hot-reload.

### 10. Retire `scripts/*.sh`
- Delete `app-up.sh`, `app-down.sh`, `full-up.sh`, `full-down.sh`,
  `visualizer-up.sh`, `visualizer-down.sh`.
- Or shim each to a one-line `pnpm pg:<cmd>` invocation if external
  docs/CI reference them.

## Critical files

- `scripts/playground.mjs` — main orchestrator
- `infra/docker/compose.yaml` — services + profiles + watch rules
- `apps/web/Dockerfile` *(new)*
- `apps/web/next.config.mjs` — enable `output: "standalone"`
- `apps/web/package.json` — verify dev/build/start scripts work with
  standalone output
- `.env` *(new, gitignored)*, `.env.example`
- `apps/bff/.env` — review (may be removable)
- `package.json` (root) — add `--env-file=.env` to `pg:*` script
  invocations
- `scripts/{app,full,visualizer}-{up,down}.sh` — delete or shim

## Verification

1. Fresh clone, then `cp .env.example .env`. No further edits required.
2. `pnpm pg:up` (no args) — postgres + otel + bff + web + viz all up,
   all healthchecks green, schema migrated, products seeded.
3. `pnpm pg:up core` — only postgres + otel + bff.
4. `pnpm pg:status` — table showing all running services, their
   healthcheck status, and bound ports.
5. `pnpm pg:dev` — edit a `.ts` file in `apps/bff/src/` and see the
   container BFF reload.
6. `pnpm pg:smoke` — all 9 checks pass.
7. No port-3001 collision possible: `pg:dev` does not bind on the host.

## Anchors

Run this to see what's left:

```bash
grep -rn "next-steps/orchestrator" .
```

Current anchors:

- `scripts/playground.mjs` (inside `up()` — wire migrate + seed + target arg)
- `scripts/playground.mjs` (inside `seed()` — replace stub with real seed)
- `infra/docker/compose.yaml` (top of `services:` — add web + profiles)
