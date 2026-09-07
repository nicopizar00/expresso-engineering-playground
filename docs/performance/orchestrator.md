# Performance Orchestrator

Design of the repo's native performance engineering layer. Canonical home
for the rules that govern `scripts/pg/perf.py`,
`infra/docker/compose.performance.yaml`, and the k6 scenario library under
`tests/performance/k6/`.

## Goals

1. Run k6 reproducibly against the local BFF with **one command** from a
   fresh checkout: `./dev perf:smoke`.
2. Keep orchestration logic in **Python**, alongside the rest of the local
   developer CLI.
3. Keep the runtime in **Docker** so the host needs no k6 install.
4. Keep the perf stack isolated from the main Compose lifecycle.
5. Produce diffable summary artifacts per scenario.
6. Stay small. Add only what the next concrete need requires.

## Non-goals

- A general-purpose load-testing platform.
- Cross-repo / multi-service orchestration.
- Cloud runners, distributed k6, custom queueing.
- CI gating by default. CI runs are added per-scenario with owner sign-off.

## Architecture

```mermaid
flowchart LR
  Dev["./dev perf:&lt;scenario&gt;<br/>pnpm pg:perf:&lt;scenario&gt;<br/>task perf:&lt;scenario&gt;"] --> Py["python3 -m pg<br/>scripts/pg/perf.py or campaign.py"]
  Py --> Runner["pg.k6runner.run_k6()<br/>(built on punch's _stream primitive)"]
  Runner --> Compose["docker compose<br/>-f infra/docker/compose.performance.yaml<br/>run --rm k6"]
  Build["infra/docker/k6.Dockerfile<br/>esbuild: .ts scenarios + vendor/punch/<br/>report helper -&gt; dist/"] -.->|built into image, not mounted| Compose
  Compose --> K6[("grafana/k6:0.54.0<br/>container")]
  K6 -->|writes| Reports["tests/performance/k6/reports/<br/>&lt;scenario&gt;-report.html /<br/>&lt;scenario&gt;-summary.json"]
  K6 -. OTLP .-> OTEL["otel-collector<br/>(when k6-otel + obs profile)"]
```

All three user-facing entry points (`./dev`, `pnpm pg:*`, `task`) converge on
`python3 -m pg`. The Python orchestrator owns argument parsing, BFF
liveness hinting, container spawning, and report path resolution, all via
`k6runner.run_k6()` (see "Layout" below). Scenario sources are compiled into
the `k6` image at `docker compose ... build` time (esbuild, inside
`infra/docker/k6.Dockerfile`) rather than mounted live — only `reports/` is
a live volume mount.

## Layout

```
scripts/pg/
  perf.py                    # smoke / checkout_flow / read_heavy / open_report / clean
  k6runner.py                # shared run_k6() Docker-invocation helper, built on
                              # punch's subprocess-streaming primitive — perf.py
                              # and campaign.py both call this instead of each
                              # owning their own inline docker-compose invocation
  campaign.py                # campaign preflight/build_k6_options + run_k6() call
  cli.py                     # perf:* entry registration
vendor/punch/                # pinned submodule — shared k6/report helpers +
                              # Python subprocess-streaming primitive (Task 3)
infra/docker/
  compose.performance.yaml   # k6 + k6-otel services (separate file)
  k6.Dockerfile              # builds this repo's own TS scenarios with esbuild,
                              # copying in vendor/punch's shared report helper
tests/performance/k6/
  package.json, tsconfig.json  # esbuild + @types/k6 build tooling
  support/report.ts          # re-exports vendor/punch/src/tests/support/report.ts
  config/
    env.ts                   # url() — single BASE_URL knob
    thresholds.ts            # named threshold sets
  data/
    products.json            # static fixtures
  scenarios/
    smoke/smoke.ts
    checkout-flow/checkout-flow.ts
    read-heavy/read-heavy.ts
    campaign/
      campaign.ts            # generated options; exec targets from adapters
      catalog-browse.ts
      order-lookup.ts
      purchase.ts
      report-event.ts        # fire-and-forget workflow-traffic emitter
    load/load.js              # pre-existing, unwired scaffold placeholder with
    stress/stress.js          # broken imports — not migrated by this layer's
                              # TS conversion; see tests/performance/k6/README.md
                              # "Known gap"
  campaigns/
    morning-rush.json        # example campaign descriptor
  reports/                   # gitignored except .gitkeep
docs/performance/
  orchestrator.md            # this file
  validation.md              # evidence rules
```

`k6runner.py`'s `run_k6()` is the single Docker-invocation primitive: it
resolves `BASE_URL`, warns if the BFF isn't listening, builds the `docker
compose run` command, and streams it through punch's `_stream()`. `perf.py`
(smoke/checkout-flow/read-heavy) and `campaign.py` both call it rather than
each maintaining its own inline invocation logic — there is no longer a
per-file `_run_scenario` helper.

## Invariants

These are load-bearing. Changes that break them require owner sign-off.

1. **k6 runs in Docker.** No host install of k6 is required to execute
   `./dev perf:*`. Host-installed k6 is an optional escape hatch
   documented in the k6 README, never a default code path.
2. **Python owns orchestration.** `dev` is a bash trampoline; new
   orchestration logic lives in `scripts/pg/` and stays stdlib-only.
3. **Compose file stays separate.** `compose.performance.yaml` does not
   mutate the main stack. Perf runs do not bring up the main `core`,
   `web`, or `viz` profile.
4. **`BASE_URL` is the single target knob.** Scenarios read it via
   `config/env.ts`; the orchestrator (`k6runner.default_base_url()`)
   resolves the default (`http://host.docker.internal:${BFF_PORT}`); CLI
   overrides win.
5. **Reports are stable + diffable.** Each scenario's own `handleSummary`
   (using `support/report.ts`'s shared helpers) writes an HTML report and a
   JSON summary at a predictable path (`reports/<scenario>-report.html` /
   `reports/<scenario>-summary.json`). Reports are gitignored except
   `.gitkeep`.
6. **Thresholds are named and shared.** New thresholds live in
   `config/thresholds.ts` as named sets, imported by the scenario.
   Inlining thresholds is a review red flag.
7. **No secrets, no real URLs, no real user data** in scenarios or
   fixtures. The domain is fictional.

## Entry points today

Source is TypeScript; the "Scenario" column below is the compiled path
`docker compose ... build k6`'s esbuild step produces inside the image
(`dist/<name>.js`, baked in at `/scripts/scenarios/<name>.js` — see
`infra/docker/k6.Dockerfile`), which is what `perf.py`/`campaign.py` pass to
`k6runner.run_k6()`. Scenario *source* lives at
`tests/performance/k6/scenarios/<profile>/<name>.ts`.

| Command | Scenario (compiled path) | Summary file |
|---|---|---|
| `./dev perf:smoke` | `smoke/smoke.js` | `smoke-summary.json` |
| `./dev perf:checkout-flow` | `checkout-flow/checkout-flow.js` | `checkout-flow-summary.json` |
| `./dev perf:read-heavy` | `read-heavy/read-heavy.js` | `read-heavy-summary.json` |
| `./dev perf:campaign [descriptor]` | `scenarios/campaign/campaign.js` | `campaign-<runId>-summary.json` |
| `./dev perf:open-report` | — | lists report files |
| `./dev perf:clean` | — | clears `reports/` |

`pnpm pg:perf:*` and `task perf:*` are user-facing equivalents. The
`k6-otel` Compose service is opt-in for runs that need OTLP export to the
collector running under the `obs` profile.

## Extending the orchestrator

Campaign scenarios are a special case: thresholds are generated per-run in
`scripts/pg/campaign.py` rather than named in `config/thresholds.ts`, because
they depend on which use cases a given descriptor selects — there is no static
set to name ahead of time.

Steps for adding a new scenario (e.g. `cart-mutations`):

1. Decide whether the new shape belongs in an existing profile or warrants
   a new directory under `scenarios/`.
2. Create `tests/performance/k6/scenarios/cart-mutations/cart-mutations.ts`.
   - Import `url()` from `config/env.ts`.
   - Import the relevant named threshold set from `config/thresholds.ts`.
     Add a new set if needed; do not inline.
   - Make VUs / duration / ramp explicit and bounded.
   - Add the new entry point to `tests/performance/k6/package.json`'s
     `build` script so esbuild bundles it.
3. Add a `cart_mutations()` function in `scripts/pg/perf.py` reusing
   `k6runner.run_k6(label, scenario_path, summary_filename=...)`.
4. Register `perf:cart-mutations` in `scripts/pg/cli.py`.
5. Add `pg:perf:cart-mutations` to `package.json` scripts and
   `perf:cart-mutations` to `Taskfile.yml` if the user-facing entry points
   are expected.
6. Update `tests/performance/k6/README.md` and this document.
7. Run the orchestrator unit tests: `pnpm pg:test`.
8. Run the new scenario locally: `./dev perf:cart-mutations`. Commit the
   resulting threshold rationale to `config/thresholds.ts`.

Steps for changing a threshold:

1. Justify the change with empirical data from a real run; quote the
   metric and exit code.
2. Edit `config/thresholds.ts`. Keep the change to the named set only.
3. Re-run the affected scenario and capture the summary.
4. Note the rationale in the PR description, not in source comments.

Steps for changing Compose wiring:

1. Edit `compose.performance.yaml`. Keep `k6` and `k6-otel` symmetric.
2. Preserve `extra_hosts: host.docker.internal:host-gateway` for Linux.
3. If joining the `mini_commerce` external network, document the dependency
   on the main stack being up.
4. Update `docs/architecture/containers.md` if the change affects the
   container map.

## What this layer deliberately does not do

- It does not own CI scheduling. CI gating per scenario is a separate,
  per-scenario decision with owner sign-off; the default lives locally.
- It does not export to dashboards by default. The `k6-otel` service is
  opt-in; routing into Grafana / Tempo / Prometheus boards is future work.
- It does not generate synthetic users, browsers, or session state beyond
  the BFF's own contracts. Scenarios target the BFF API surface.
- It does not own assertions about correctness — that belongs to the BFF
  test suite. k6 asserts performance characteristics under load.

## Related

- [`validation.md`](validation.md) — performance validation evidence rules.
- [`../architecture/containers.md`](../architecture/containers.md) —
  container map and profile contract.
- [`../architecture/orchestrator-python.md`](../architecture/orchestrator-python.md) —
  Python `pg` CLI design.
- [`../../tests/performance/k6/README.md`](../../tests/performance/k6/README.md) —
  scenario library overview.
