# k6 scenario library

This folder owns the mini-commerce BFF scenarios, their TypeScript build
entries, repository workflow YAML, and generated HTML/JSON reports. It uses
the pinned Punch submodule for shared report helpers and the generic workflow
runtime; Punch does not own Expresso's HTTP contracts.

## Run a workflow

Start the BFF, initialize Punch, install its pinned dependency, and build the
image separately:

```bash
git submodule update --init --recursive
python3 -m pip install -r vendor/punch/requirements.txt
./dev up
docker compose -f infra/docker/compose.performance.yaml build k6
./dev perf:smoke
```

`./dev perf:*` selects one YAML file in `workflows/`. Punch loads and validates
it, then issues one Compose run. It streams stdout and stderr independently to
the terminal and `reports/logs/`, while each scenario retains its existing
HTML/JSON summary output in `reports/`. Do not substitute a direct Compose
command in normal use; it is a debugging escape hatch, not the owned path.

Set a different target without changing a workflow:

```bash
BASE_URL=https://perf.example.test ./dev perf:smoke
```

## Reports and current-run evidence

The report volume has this stable layout:

```text
reports/
  smoke-report.html / smoke-summary.json       # scenario HTML/JSON output
  logs/k6-smoke.log                            # selected workflow stdout/stderr
```

Inspect or remove those generated files with:

```bash
./dev perf:open-report
./dev perf:clean
```

Existing CSV, HTML, or JSON files are **not current-run evidence**: a file
may predate the selected workflow. Use the Punch execution result and its
matching stdout/stderr log as the current-run evidence record; the result
identifies the selected workflow and reports its exit/pass state and any CSV
record count.

The seven current mappings are:

| TypeScript build entry | YAML workflow |
| --- | --- |
| `scenarios/smoke/smoke.ts` | `workflows/smoke.yaml` |
| `scenarios/checkout-flow/checkout-flow.ts` | `workflows/checkout-flow.yaml` |
| `scenarios/read-heavy/read-heavy.ts` | `workflows/read-heavy.yaml` |
| `scenarios/campaign/campaign.ts` | `workflows/campaign.yaml` |
| `scenarios/campaign/catalog-browse.ts` | `workflows/catalog-browse.yaml` |
| `scenarios/campaign/order-lookup.ts` | `workflows/order-lookup.yaml` |
| `scenarios/campaign/purchase.ts` | `workflows/purchase.yaml` |

`load` and `stress` are old, unwired placeholders; they are neither build
entries nor workflows.

## Optional CSV output

Current workflows do not declare `outputs.csv`. A future workflow can declare
`spec.outputs.csv.path` only when its data output is intentional.

- A candidate record is exactly one stdout line beginning `[CSV]`; Punch strips
  that prefix and parses its payload as strict CSV. Stderr is log-only and is
  never harvested.
- Interactive runs request confirmation before Compose starts. For a
  non-interactive CSV-declared run, pass `--confirm-output-data`. The flag is
  not needed by the current seven workflows.
- Zero valid records, malformed tagged data, process failure, or preflight
  failure fails the workflow. Punch stages valid records beside the target and
  publishes them atomically only after a successful run, preserving any
  previously published file on failure.

## Add a scenario

Add the scenario source, add one TypeScript build entry, then add exactly one
matching `workflows/<name>.yaml`. The workflow supplies the Compose file,
service, container script, permitted environment, and optional `outputs.csv`;
do not put an additional script-path branch in `scripts/pg/perf.py`.

Update the relevant command/docs and run `pnpm pg:test`. Build explicitly and
execute the workflow locally before relying on CI. Keep thresholds named in
`config/thresholds.ts` and retain the existing report shape.

## Host k6 debugging escape hatch

For a local experiment, bundle first and use a host k6 binary against the
compiled output. This bypasses the repository YAML workflow and is therefore
not the supported or CI path:

```bash
cd tests/performance/k6 && npm ci && npm run build
BASE_URL=http://localhost:3001 k6 run dist/smoke/smoke.js
```
