---
name: expresso-docker-compose-review
description: Use to review changes to infra/docker/compose*.yaml and related service wiring (ports, volumes, networks, profiles, host-gateway, OTLP). Enforces the profile contract documented in docs/architecture/containers.md.
---

# Expresso — Docker Compose Review

## When to use

- Any change to `infra/docker/compose.yaml`, `compose.dev.yaml`, or
  `compose.performance.yaml`.
- Any new service, port mapping, volume mount, or `extra_hosts` entry.
- Any change to the `core` / `web` / `viz` / `admin` / `obs` profile
  membership.

## Read first

- `docs/architecture/containers.md` — canonical profile + port table.
- `docs/architecture/observability.md` — OTel topology rules.
- `docs/architecture/web-entry-point.md` — proxy boundaries the web app
  enforces over the internal network.
- `infra/docker/compose.yaml` — base stack with all profiles.
- `infra/docker/compose.dev.yaml` — dev override (watch mode).
- `infra/docker/compose.performance.yaml` — k6 + k6-otel.
- `scripts/pg/compose.py` — how the Python orchestrator chains profile flags.

## Review checklist

### Profile contract
- [ ] Every new service is assigned to exactly one of `core`, `web`, `viz`,
      `admin`, `obs`, or lives in a separate file (`compose.performance.yaml`).
- [ ] `./dev up [target]` and `pnpm pg:up [target]` continue to bring up the
      expected services. If a target changes, the table in `containers.md`
      is updated in the same change.
- [ ] No service silently joins the `default` network when it needs the
      `mini_commerce` external network (OTLP fan-out, k6-otel).

### Ports + addressing
- [ ] No port collision with the published table (`3000`, `3001`, `3002`,
      `3030`, `3200`, `4317`, `4318`, `5432`, `5555`, `9090`).
- [ ] Host ports come from `.env` defaults where applicable (`BFF_PORT`,
      `WEB_PORT`, etc.) and are not hard-coded if a variable exists.
- [ ] `host.docker.internal` mapping uses `extra_hosts` so Linux hosts
      resolve it.

### Volumes
- [ ] Bind mounts use repo-relative paths (`../../tests/...`) consistent with
      the rest of the file.
- [ ] No mounts into `/var/lib/postgresql/data` that would shadow the named
      volume without an ADR.
- [ ] Generated artifacts land in a path that the relevant `.gitignore`
      excludes.

### Boundary hygiene
- [ ] Web app is still the single browser-facing service. New services that
      must be reachable from the browser proxy through `apps/web/`.
- [ ] No service exposes Postgres beyond `:5432` to the host; admin access is
      via Prisma Studio on the `admin` profile.

## Output

- Per-finding diff with the smallest change that resolves it.
- Confirmation that `./dev doctor` and `./dev up [affected target]` still
  work, ideally executed locally before approving.
- A note on whether `docs/architecture/containers.md` needs an update in the
  same commit.

## Don'ts

- Do not approve a new top-level Compose file unless there's a stated reason
  the change can't live in `compose.yaml` + a profile.
- Do not approve `network_mode: host` — it breaks `host.docker.internal`
  contracts.
- Do not introduce build steps that require host tools beyond Docker.
