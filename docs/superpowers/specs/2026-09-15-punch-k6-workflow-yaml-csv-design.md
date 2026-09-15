# Punch k6 Workflow YAML and CSV Harvesting Design

## Status

Approved in conversation on 2026-09-15.

## Problem

Punch and its Expresso consumer currently define k6 execution in Python maps
and call helpers with script paths. That makes each caller partly responsible
for execution semantics and prevents a workflow from declaring that its stdout
contains reusable tabular data.

Every executable k6 test needs one normalized YAML workflow definition. Punch
must execute that definition through one explicit `docker compose run`, stream
the process output, and optionally harvest tagged stdout records into a CSV
artifact that later workflows can consume.

## Goals

- Make normalized workflow YAML the source of truth for every executable k6
  test owned by Punch or Expresso.
- Keep k6 execution Docker-first and Python-orchestrated.
- Execute exactly one explicit `docker compose run` per selected workflow.
- Provide reusable Punch logic for workflow loading, validation, execution,
  confirmation, logging, and optional CSV harvesting.
- Require user acknowledgement before a workflow declared to produce CSV data
  is executed.
- Publish CSV output only when the k6 process and CSV contract both succeed.
- Preserve existing named Punch selectors by resolving them to YAML during the
  compatibility window.

## Non-goals

- Parsing k6's human-readable summary into metrics.
- Enabling k6's native `--out csv` sink.
- Defining business meaning, headers, or column types for harvested records.
- Chaining multiple workflow executions in a single workflow definition.
- Building images, starting application dependencies, or cleaning resources as
  part of the workflow run.
- Turning Punch into a general-purpose workflow scheduler.
- Migrating the broken, unwired Expresso `load.js` and `stress.js`
  placeholders into supported tests.

## Ownership and boundaries

Punch owns the normalized workflow schema, YAML loader, validator, subprocess
execution, confirmation policy, raw logs, CSV harvesting, and run evidence.
Each consuming repository owns the workflow YAML and k6 scripts specific to
that repository.

Application adapters may calculate runtime inputs before execution. For
example, Expresso's campaign adapter may continue to build `CAMPAIGN_JSON`.
The adapter must then provide that value to Punch's workflow API instead of
constructing or launching a k6 command itself.

This design intentionally changes Punch's former standard-library-only Python
policy. PyYAML is an owner-approved runtime dependency. Punch must declare the
dependency and provide deterministic installation instructions; it must not
download or install packages implicitly when a workflow is run.

## Normalized workflow contract

The first schema version has one document shape:

```yaml
apiVersion: punch/v1
kind: K6Workflow

metadata:
  name: checkout-flow

spec:
  workingDirectory: ../../../..
  compose:
    file: infra/docker/compose.performance.yaml
    service: k6
  k6:
    script: /scripts/scenarios/checkout-flow/checkout-flow.js
  environment:
    forward:
      - BASE_URL
  outputs:
    csv:
      path: reports/data/checkout-flow.csv
```

`apiVersion`, `kind`, `metadata.name`, `spec.workingDirectory`,
`spec.compose.file`, `spec.compose.service`, and `spec.k6.script` are required.
`spec.environment.forward` and `spec.outputs` are optional. `spec.outputs.csv`,
when present, requires a non-empty `path`.

The loader rejects unknown properties, duplicate YAML keys, YAML aliases and
custom tags, missing values, wrong scalar or collection types, and unsupported
schema versions. Workflow names use a restricted, filesystem-safe identifier
syntax. Environment entries are names only; their values come from the caller
at execution time.

`workingDirectory` is resolved relative to the YAML file. The Compose file and
CSV destination are resolved beneath that directory. Resolution rejects paths
that escape the working directory. The k6 script is an absolute path inside
the container and is never interpreted as a host path.

## Selection and compatibility

The primary interface is:

```text
punch run path/to/workflow.yaml
```

For a compatibility window, a bare selector such as `punch run smoke` resolves
to a bundled Punch workflow YAML. The selector map contains names and YAML
paths only; it contains no Compose settings, script paths, environment rules,
or output behavior. `all` remains suite-level CLI orchestration that selects
the bundled YAML workflows sequentially, with one Compose run per selected
workflow.

Expresso's `./dev perf:*` commands select repository-owned YAML paths. Campaign
preprocessing supplies its generated environment value through the workflow
executor. CI selects the same smoke workflow through Python rather than
constructing a Compose command separately.

Every supported esbuild k6 entry must map to exactly one workflow YAML, and
every workflow YAML must point to a supported build entry. Repository
consistency tests enforce both directions. Unwired placeholder files are not
executable tests and remain outside this mapping.

## Confirmation policy

A workflow without `spec.outputs.csv` executes without a data-output prompt.

When `spec.outputs.csv` is declared, Punch displays the workflow name and the
resolved CSV destination after validation and before spawning Docker Compose.
Interactive execution proceeds only after an affirmative response. A decline
or end-of-input cancels without starting a subprocess.

When stdin is not interactive, execution fails before spawning Docker Compose
unless `--confirm-output-data` is present. The flag applies only to the
selected invocation; it is not persisted. Suite execution applies the same
rule to every CSV-producing member and may use the one invocation-level flag
to acknowledge all destinations printed before the first run.

## Execution model

Workflow execution constructs one command with this shape:

```text
docker compose --project-directory <working-directory> \
  -f <compose-file> run --rm \
  [-e NAME=VALUE ...] <service> k6 run <container-script>
```

The executor never issues `docker compose build`, `up`, or a second `run`.
Image builds and dependency lifecycle remain separate orchestrator phases.
Forwarded environment values are limited to names declared by the workflow;
missing declared values are omitted unless a later schema version introduces
an explicit required-environment contract.

Punch reads stdout and stderr independently to avoid deadlocks. Both streams
remain visible to the user and are written to the raw run log. Only stdout is
eligible for CSV harvesting. The executor preserves stdout record order; no
ordering guarantee is made between stdout and stderr in the displayed or raw
combined log.

## Tagged CSV protocol

A k6 script emits a harvestable record as one stdout line beginning exactly
with `[CSV]`. Punch removes the tag and at most one following ASCII space. The
remaining text is one complete CSV record. Quoted fields may contain commas,
but multiline CSV records are unsupported because stdout is harvested one
line at a time.

Punch validates each payload with Python's strict CSV parser. This schema
version does not require a header, impose a column count, or interpret field
types. Those semantics belong to the producing script and consuming workflow.
Blank payloads and syntactically invalid records fail validation.

When CSV output is not declared, `[CSV]` lines remain ordinary stdout and raw
log content. Punch does not create a CSV artifact and does not fail based on
their presence or absence.

When CSV output is declared, at least one valid tagged stdout line is
mandatory. Zero tagged lines fails the workflow even when k6 exits with zero.

## Artifact publication and failure semantics

Punch collects validated records in a temporary file located beside the final
CSV destination. It publishes the artifact with an atomic replace only after
k6 exits with zero and at least one valid tagged record was collected. Parent
directories may be created after confirmation and before execution.

The workflow fails without publishing partial current-run data when:

- confirmation is absent or declined;
- YAML or path validation fails;
- Docker Compose cannot be started;
- k6 exits nonzero;
- CSV was declared but no tagged stdout records were emitted; or
- any tagged payload is invalid CSV.

Raw logs and Punch run evidence are diagnostic artifacts and may still be
written for a failed execution. Run evidence records the workflow name, YAML
path, exact result status, k6 exit code when available, CSV destination, and
harvested record count. Consumers must use current successful run evidence
rather than infer success from a pre-existing CSV file.

## Components

- `src/punch/workflow.py`: safe YAML loading, normalization, typed immutable
  workflow model, path resolution, and validation errors.
- `src/punch/execution.py`: confirmation, command construction, subprocess
  streaming, raw logs, tagged-record harvesting, atomic CSV publication, and
  structured execution results.
- `src/punch/__main__.py`: CLI parsing, selector compatibility, suite
  sequencing, evidence writing, and exit-code presentation.
- Repository-owned workflow directories: one YAML document for each supported
  k6 entry in Punch and Expresso.
- Expresso `scripts/pg/`: thin selection and runtime-input adapters that call
  the Punch workflow API.

The modules expose explicit Python APIs so consumers do not import a private
streaming helper. Workflow parsing has no subprocess side effects, and command
construction can be tested without Docker.

## Migration and rollback

The migration follows expand, prove, switch, and contract:

1. Add the declared PyYAML dependency, workflow model, validation, executor,
   unit tests, and bundled Punch YAML definitions.
2. Prove named-selector parity while selectors resolve to YAML.
3. Add Expresso-owned YAML definitions and route Python commands and CI through
   the public Punch workflow API.
4. Add bidirectional consistency checks, then remove hard-coded execution
   registries and direct k6 Compose construction.
5. Reconcile architecture, CLI, artifact, and contributor documentation in
   both repositories.

Rollback is a code and configuration revert. There is no persistent schema or
user-data migration. Generated CSV artifacts are disposable outputs. During
the compatibility window, named selectors remain stable even though YAML owns
their execution definition.

## Testing and acceptance

Unit tests use real temporary YAML files and a small fake subprocess executable
instead of Docker. They cover:

- valid normalization and every schema rejection class;
- safe path resolution and traversal rejection;
- exact one-run command construction;
- environment allow-listing;
- interactive accept, decline, and end-of-input;
- non-interactive refusal and `--confirm-output-data` acceptance;
- independent stdout/stderr streaming;
- exact `[CSV]` matching and prefix removal;
- valid quoted CSV, blank payload, invalid CSV, and zero-record behavior;
- nonzero k6 behavior and absence of published partial CSV;
- atomic successful publication and structured run evidence;
- named-selector compatibility; and
- exact one-to-one coverage between supported k6 build entries and workflow
  YAML files in each repository.

A focused Docker smoke test builds the k6 image separately, invokes one YAML
workflow through the official Python CLI, confirms one Compose run, and checks
the expected log/evidence artifacts. A fixture CSV-producing workflow proves
confirmation and harvesting without changing production scenarios solely to
manufacture data.

The change is accepted when:

1. Every supported k6 test in Punch and Expresso has exactly one valid YAML
   workflow definition.
2. All user-facing performance commands and CI k6 execution select YAML.
3. A workflow execution issues exactly one explicit `docker compose run`.
4. CSV-free workflows execute without confirmation or CSV artifacts.
5. CSV-declared workflows require interactive confirmation or the explicit
   non-interactive flag.
6. CSV-declared workflows publish ordered, tag-stripped stdout records only
   after successful k6 completion.
7. A CSV-declared workflow with no tagged stdout lines fails and publishes no
   current-run CSV.
8. Focused unit, repository consistency, and Docker smoke tests pass.

