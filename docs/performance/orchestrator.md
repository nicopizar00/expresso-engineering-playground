# Performance Orchestrator

The repository-owned performance layer selects k6 workflows; Punch owns the
generic workflow engine. This is the canonical design for `./dev perf:*`,
`tests/performance/k6/workflows/`, and CI's smoke run.

## Prerequisites and ownership

Core `scripts/pg/` uses only the Python standard library. The performance
commands are the deliberate exception at their dependency boundary: they load
Punch's public YAML API, which requires the pinned dependency installed from
the initialized submodule.

```bash
git submodule update --init --recursive
python3 -m pip install -r vendor/punch/requirements.txt
docker compose -f infra/docker/compose.performance.yaml build k6
```

Expresso owns its BFF-specific TypeScript scenarios, their build entries, and
the seven workflow YAML files. Punch owns YAML loading and validation,
data-output confirmation, Compose command construction, stream handling, and
CSV publication. The adapter in `scripts/pg/k6runner.py` only selects a named
repository workflow and presents its result.

## Execution path

```text
./dev perf:* -> repository YAML -> Punch load/validate/confirm ->
one docker compose run -> stdout/stderr log + existing HTML/JSON + optional CSV
```

For a selected workflow, Punch constructs exactly one explicit `docker compose
--project-directory ... -f ... run --rm k6 k6 run ...` command. Building the
image, starting the BFF, collecting logs, and cleanup are separate operations.
CI therefore builds the `k6` image first, then invokes `./dev perf:smoke`; it
does not recreate the Compose command in workflow YAML.

The baked image contains compiled scenario code. Existing scenario
`handleSummary` behavior continues to write the HTML and JSON reports under
`tests/performance/k6/reports/`; Punch also records the selected run's stdout
and stderr log in `reports/logs/`.

Existing CSV, HTML, or JSON files are **not current-run evidence**: they can
belong to an earlier run. The Punch execution result (selected workflow, child
exit status, pass/failure state, and CSV count when applicable) together with
the matching stdout/stderr log is the current-run evidence record. Inspect
that result and record before treating generated artifacts as evidence.

## Repository workflow mapping

There are seven YAML files, exactly one for every TypeScript k6 build entry.
They all select `infra/docker/compose.performance.yaml`, service `k6`, and
forward `BASE_URL`; the campaign workflow additionally forwards its generated
campaign values and requires `CAMPAIGN_JSON`.

| Build entry | Workflow YAML | Container script |
| --- | --- | --- |
| `scenarios/smoke/smoke.ts` | `workflows/smoke.yaml` | `/scripts/scenarios/smoke/smoke.js` |
| `scenarios/checkout-flow/checkout-flow.ts` | `workflows/checkout-flow.yaml` | `/scripts/scenarios/checkout-flow/checkout-flow.js` |
| `scenarios/read-heavy/read-heavy.ts` | `workflows/read-heavy.yaml` | `/scripts/scenarios/read-heavy/read-heavy.js` |
| `scenarios/campaign/campaign.ts` | `workflows/campaign.yaml` | `/scripts/scenarios/campaign/campaign.js` |
| `scenarios/campaign/catalog-browse.ts` | `workflows/catalog-browse.yaml` | `/scripts/scenarios/campaign/catalog-browse.js` |
| `scenarios/campaign/order-lookup.ts` | `workflows/order-lookup.yaml` | `/scripts/scenarios/campaign/order-lookup.js` |
| `scenarios/campaign/purchase.ts` | `workflows/purchase.yaml` | `/scripts/scenarios/campaign/purchase.js` |

The unwired `load` and `stress` placeholders are not build entries and have no
workflow. Do not add a second workflow for a build entry or add an ad-hoc
script path to `perf.py`.

## Optional CSV output protocol

No current production workflow declares `outputs.csv`. A future workflow may
declare `spec.outputs.csv.path`; that is an explicit data-output contract.

- Only stdout lines beginning exactly with `[CSV]` are candidates. The prefix
  is removed before a strict CSV row is parsed; ordinary stdout and every
  stderr line remain log output, never harvested data.
- Punch asks interactively after validation and before Compose starts. A
  non-interactive run of a CSV-declared workflow must pass
  `--confirm-output-data`; the flag is unnecessary for workflows without
  `outputs.csv`.
- A zero-record run, invalid tagged CSV, a failed child process, or a failed
  preflight is a failed workflow. It must not publish partial data.
- Valid rows are written to a same-directory temporary file and atomically
  replace the destination only after a successful process exit. An existing
  destination remains unchanged on every failure path.

## Extending a scenario

1. Add the TypeScript scenario and one entry to
   `tests/performance/k6/package.json`'s `build` script.
2. Add exactly one matching YAML file in `tests/performance/k6/workflows/`.
   Its name must match the build-entry mapping and its paths must remain within
   the repository working directory.
3. Add the user-facing selector only if a new command is intended, then update
   the command documentation and the workflow-coverage test.
4. Run `pnpm pg:test`, build the image explicitly, and run the selected
   workflow. Capture threshold evidence in the change description.

Thresholds stay named in `tests/performance/k6/config/thresholds.ts`; campaign
thresholds remain generated from the validated campaign descriptor. Direct
Compose commands are debugging escape hatches only, not an alternative
consumer execution path.

## Invariants

1. k6 runs in Docker; no host k6 install is required for `./dev perf:*`.
2. One selected YAML workflow results in one Compose run.
3. `BASE_URL` is the target knob and only declared environment names are
   forwarded.
4. HTML/JSON reports remain stable and optional CSV is confirmed, stdout-only,
   and atomic.
5. No real URLs, secrets, or user data belong in scenarios, fixtures, or logs.

## Related

- [`validation.md`](validation.md) — performance validation evidence rules.
- [`../architecture/orchestrator-python.md`](../architecture/orchestrator-python.md)
  — Python CLI architecture.
- [`../../tests/performance/k6/README.md`](../../tests/performance/k6/README.md)
  — scenario library and usage.
