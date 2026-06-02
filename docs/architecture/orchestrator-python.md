# Orchestrator — Python `pg` CLI

Single source of truth for local orchestration. Replaces the previous
dual-CLI setup (`./dev` bash + `scripts/playground.mjs` Node).

## Why Python

- One language for the entire orchestrator (was bash + Node + bash shims).
- Stdlib-only: no `pip install` required to use the CLI. Python ≥ 3.9 ships
  with macOS and every recent Ubuntu LTS.
- Subprocess + argparse + urllib gives us everything we need for compose
  shelling, HTTP smoke checks, and SSE frame assertion.
- The `pg hack` namespace (see below) is much easier to grow in Python than
  in bash.

## Layout

```
scripts/pg/
  __main__.py     # entry: `python -m pg`
  cli.py          # dispatch (argparse-shaped, hand-rolled for colon names)
  compose.py      # docker compose wrapper (profiles + extra files)
  env.py          # .env load + auto-bootstrap from .env.example
  paths.py        # repo root, compose paths, port constants
  ansi.py         # color helpers (NO_COLOR + non-TTY aware)
  ports.py        # port-in-use + PID lookup
  http.py         # urllib + http.client helpers (incl. SSE reader)
  doctor.py up.py down.py dev.py smoke.py seed.py
  status.py logs.py open_cmd.py perf.py hack.py
  tests/          # unittest smoke tests
```

## Entry points

- `./dev <cmd>` — bash trampoline; `exec`s `python3 -m pg`.
- `pnpm pg:<cmd>` — same; each script in `package.json` calls `./dev <cmd>`.
- `task <cmd>` — Taskfile wraps `pnpm pg:*`.

All three remain valid; pick whichever fits your muscle memory.

## Command map

| Command                  | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `doctor`                 | Validate Docker / Python / .env state          |
| `up [target] [--fresh]`  | Start core/web/viz/admin/obs/full stack        |
| `down` / `reset`         | Stop (and reset, with explanation)             |
| `restart [target]`       | Stop then up                                   |
| `dev`                    | `docker compose watch` (HMR for bff + web)     |
| `dev:host`               | `turbo run dev` on host (escape hatch)         |
| `smoke`                  | 13 endpoint checks incl. SSE frame assertion   |
| `seed`                   | `prisma db seed`                               |
| `status` / `logs` / `open` | Inspection                                   |
| `perf:smoke` / `perf:checkout-flow` / `perf:read-heavy` | k6 scenarios in Docker |
| `perf:open-report` / `perf:clean` | Manage k6 report artefacts             |
| `hack {exec,env,sql,trace}` | Debugging affordances (see below)            |

## `pg hack`

Daily debugging affordances; replace the muscle-memory `docker compose
exec` / `psql` / `curl` incantations.

### `hack exec <svc> [-- cmd args...]`
Drops you into the right shell (probes for `bash`, falls back to `sh`).
With a `--` separator, runs a one-off command.

```bash
./dev hack exec bff                       # interactive shell
./dev hack exec bff -- node --version     # one-off command
./dev hack exec postgres --shell sh       # force a specific shell
```

### `hack env <svc>`
Three-column table: variable, value as printed by `printenv` inside the
container, value in root `.env`. Differences highlighted; container-only
and `.env`-only counted separately. Use this when the answer to "why is
this env var wrong" isn't obvious.

### `hack sql [--query Q | --file F] [--json]`
One-shot psql against the postgres service. With `--json`, wraps the
query in `json_agg(row_to_json(...))` and pretty-prints. No flags →
interactive psql.

```bash
./dev hack sql --query 'SELECT count(*) FROM "Product";'
./dev hack sql --file scripts/fixtures/extra-seed.sql
./dev hack sql --query 'SELECT "productId", name FROM "Product";' --json
```

### `hack trace <METHOD> <path> [--body JSON]`
Generates a W3C `traceparent` header, calls the BFF with it, polls
Tempo (`obs` profile) for the trace, and pretty-prints the span tree.

```bash
./dev up obs                              # one-time per session
./dev hack trace GET /catalog/products
./dev hack trace POST /checkout --body '{"customerName":"Smoke"}'
```

Refuses to run if Tempo isn't reachable, with a hint to bring the `obs`
profile up.

## Tests

```bash
pnpm pg:test                          # runs unittest under scripts/pg/tests
cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py'
```

CI runs ruff lint + unittest in the `python` job.
