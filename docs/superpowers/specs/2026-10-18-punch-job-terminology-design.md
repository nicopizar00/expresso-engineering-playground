# Punch job terminology design

## Status

Direction approved in conversation on 2026-10-18: approach A (full
vocabulary), the naming map, the clean-break contracts, and the two-commit
delivery. The written details await review before implementation planning.

## Decision

Punch's YAML unit is renamed from "workflow" to **Punch job**. An ordered
sequence of Punch jobs, which Expresso calls a chain, a recipe, or a sequence
today, becomes a **Punch workflow**. A **step** is a job's position in a
workflow. Both repositories change in one coordinated delivery with no
aliases; Punch keeps `apiVersion: punch/v1`.

After the rename the layers read in one direction: a GitHub workflow runs a
job, that job runs one Punch workflow, and the Punch workflow runs its Punch
jobs in order. On Kubernetes, each Punch job is an Argo `WorkflowTemplate`.

## Problem

"Workflow" names five different things across Expresso and `vendor/punch`:

| Sense                         | Owner           | Example                                                            | After this change |
| ----------------------------- | --------------- | ------------------------------------------------------------------ | ----------------- |
| GitHub workflow               | GitHub          | `.github/workflows/perf-run.yml`, `workflow_dispatch`              | Unchanged         |
| Argo workflow                 | Argo            | `kind: WorkflowTemplate` in `infra/k8s/perf/punch/`                | Unchanged         |
| Business workflow             | Expresso domain | `use-cases/catalog.schema.json` ("domain.workflow-name"), ADR 0002 | Unchanged         |
| Punch workflow, one YAML unit | Punch           | `kind: K6Workflow`, `tests/performance/k6/workflows/*.yaml`        | Punch job         |
| Chain, recipe, sequence       | Expresso        | `./dev perf:chain`, the `recipe` input of `perf-chain.yml`         | Punch workflow    |

The overlap is worst where the senses meet. A GitHub workflow runs a job that
runs Punch workflows, and on Kubernetes an Argo `WorkflowTemplate` passes a
`workflow` parameter that means a Punch workflow
(`infra/k8s/perf/punch/workflows/http-cart.yaml`, line 22). A reader has to
infer the sense from context on almost every line.

A grep at Expresso `29e1e10` and Punch `3e7141f` found these lines in the
Punch sense, excluding GitHub and Argo uses and dated history documents:

| Repository     | Code | Tests | Schema and config | Docs | Total |
| -------------- | ---- | ----- | ----------------- | ---- | ----- |
| Expresso       | 214  | 172   | 87                | 383  | ~856  |
| `vendor/punch` | 337  | 310   | 14                | 203  | ~864  |

Expresso also has up to 362 lines that say "chain" (214), "sequence" (110),
or "recipe" (38); some of those use another sense and stay.

## Goals

- Each concept has one name in both repositories: Punch job, Punch workflow,
  step.
- Every place a user can meet an old name fails with a message that names the
  replacement: the job `kind`, `spec.json` version 1, and `./dev perf:chain`.
- Punch keeps `apiVersion: punch/v1`.
- Planning, sizing, execution, evidence content, the forms' choices, and
  their validation behave exactly as before.

## Non-goals

- Moving the Punch workflow (planner, sizing, spec, evidence) from Expresso's
  `scripts/pg` into Punch. Expresso keeps ownership; a move is a separate
  decision.
- Renaming GitHub's terms, Argo's terms, or business workflows
  (`use-cases/`, Expresso ADR 0002, the retired `workflow-traffic` feature).
- Aliases, a deprecation window, or readers for old file formats.
- Rewriting dated records: `docs/superpowers/`, `docs/specs/`, Expresso
  `docs/adr/`, Punch `docs/decisions/` 0001 to 0006, and past Punch
  `CHANGELOG.md` entries. They keep the old vocabulary.
- Changing job names (`http-cart` and the rest), profile labels, load modes,
  or spec semantics.

## Naming map

### Punch (`vendor/punch`)

| Today                                                                                         | After                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apiVersion: punch/v1`, `kind: K6Workflow`                                                    | `apiVersion: punch/v1`, `kind: K6Job`                                     |
| `workflows/k6/` (bundled YAML)                                                                | `jobs/k6/`                                                                |
| `docs/workflows/`                                                                             | `docs/jobs/`                                                              |
| `src/punch/workflow.py`: `K6Workflow`, `WorkflowError`, `load_workflow`                       | `src/punch/job.py`: `K6Job`, `JobError`, `load_job`                       |
| `punch.execution.execute_workflow`                                                            | `punch.execution.execute_job`                                             |
| `punch.catalog.WorkflowCatalog`                                                               | `punch.catalog.JobCatalog`                                                |
| `BUNDLED_WORKFLOW_DIR`, `BUNDLED_WORKFLOWS`, `_load_selected_workflows`, `discover_workflows` | `BUNDLED_JOB_DIR`, `BUNDLED_JOBS`, `_load_selected_jobs`, `discover_jobs` |
| `tests/test_workflow.py`, `tests/test_workflow_coverage.py`                                   | `tests/test_job.py`, `tests/test_job_coverage.py`                         |
| Run record `reports/state/punch-run.json` key `"workflow"` (YAML path)                        | `"job"`                                                                   |
| `k8s/punch-k6-run.yaml` input parameter `workflow`                                            | `job`                                                                     |
| CLI help and menu text: "workflow"                                                            | "job"; the verbs `run`, `menu`, `doctor`, `clean` stay                    |

Every other identifier, string, file name, and doc phrase in the Punch sense
follows the same rule.

### Expresso

| Today                                                                                             | After                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `tests/performance/k6/workflows/*.yaml`, `kind: K6Workflow`                                       | `tests/performance/k6/jobs/*.yaml`, `kind: K6Job`                               |
| `scripts/pg/paths.py` `PERF_WORKFLOWS_DIR`                                                        | `PERF_JOBS_DIR`                                                                 |
| `scripts/pg/workflows.py` (`WORKFLOWS`)                                                           | `scripts/pg/jobs.py` (`JOBS`)                                                   |
| `./dev perf:<workflow>`                                                                           | `./dev perf:<job>`; command names stay (`perf:http-cart`)                       |
| `./dev perf:chain`, `scripts/pg/perf_chain.py`, `CHAIN_REPORTS_DIR`                               | `./dev perf:workflow`, `scripts/pg/perf_workflow.py`, `WORKFLOW_REPORTS_DIR`    |
| `tests/performance/k6/reports/chain/chain.json`                                                   | `tests/performance/k6/reports/workflow/workflow.json`                           |
| `perf_spec`: `StepRequest.workflow`; spec version 1, `steps[].workflow`                           | `StepRequest.job`; spec version 2, `steps[].job`                                |
| `perf_forms`: standalone workflows, `recipes()`, `recipe_label`, blocks `workflows` and `recipes` | standalone jobs, `workflows()`, `workflow_label`, blocks `jobs` and `workflows` |
| `perf_dispatch`: kind `single` or `chain`                                                         | kind `job` or `workflow`                                                        |
| `.github/workflows/perf-run.yml` (inputs `workflow`, `profile`)                                   | `.github/workflows/perf-job.yml` (inputs `job`, `profile`)                      |
| `.github/workflows/perf-chain.yml` (inputs `recipe`, `target-profile`)                            | `.github/workflows/perf-workflow.yml` (inputs `workflow`, `target-profile`)     |
| `infra/k8s/perf/punch/workflows/*.yaml`, Argo parameter `workflow`                                | `infra/k8s/perf/punch/jobs/*.yaml`, Argo parameter `job`                        |
| Tests `test_k6_workflows.py`, `test_k8s_workflows.py`, `test_perf_chain.py`                       | `test_k6_jobs.py`, `test_k8s_jobs.py`, `test_perf_workflow.py`                  |
| Summary column "Workflow"; headings "Punch chain", "Punch chain plan"                             | "Job"; "Punch workflow", "Punch workflow plan"                                  |
| CI `perf-smoke`: `./dev perf:chain http-cart http-orders http-orders-status:1-iteration`          | `./dev perf:workflow http-cart http-orders http-orders-status:1-iteration`      |

`k6runner.py`, `k8s_perf.py`, `perf.py`, `cli.py`, `bin/punch`, `./k8s`,
the k6 scenario comments, and the docs follow the same rule.
`test_perf_github_workflows.py` keeps its name: it tests GitHub workflows.

The `perf_forms` block rename swaps names: today's `workflows` block becomes
`jobs`, and today's `recipes` block becomes `workflows`. An implementation
renames `workflows` first, so the two never coexist under one name.

### Unchanged names

- GitHub workflows and jobs, Argo `Workflow` and `WorkflowTemplate`, and the
  Argo template names (one per job, such as `http-cart`).
- Job names, "step", `target-profile`, the profile labels, the load modes,
  and the `PERF_KIND`, `PERF_SELECTION`, and `PERF_PROFILE` variables.
- `request.json`, `dispatch.json`, and `spec.json` field names other than
  `steps[].job`.

### Wording rule for prose and messages

Write "Punch job" at a document's first mention and "job" after it. Use
"Punch workflow" or "workflow" only for an ordered sequence of jobs. Wherever
a GitHub workflow, a GitHub job, or an Argo workflow appears near Punch
terms, qualify it ("GitHub workflow", "GitHub job", "Argo
`WorkflowTemplate`").

## Contracts under the clean break

1. **Job YAML.** `apiVersion: punch/v1`, `kind: K6Job`. The loader rejects
   `kind: K6Workflow` with `kind K6Workflow was renamed to K6Job; change the
kind line`, prefixed with the file path as its other errors are. Any other
   kind keeps today's error.
2. **Punch Python API.** Only the new names exist. Importing `punch.workflow`
   fails with Python's own `ModuleNotFoundError`; no alias module is kept.
   Expresso's imports change in the commit that bumps the pointer.
3. **Punch CLI.** Verbs, flags, and exit codes stay. Help and menu text say
   "job"; `punch menu` defaults to `jobs/k6/`.
4. **Punch run record.** `reports/state/punch-run.json` writes `"job"` (the
   YAML path) instead of `"workflow"`; `"test"` (the name) stays. Neither
   repository reads this file; it confirms that a run happened.
5. **Argo parameter.** `k8s/punch-k6-run.yaml` takes `job` instead of
   `workflow`, and the nine Expresso `WorkflowTemplate`s pass `job`. Argo CD
   syncs both from the pointer-bump commit.
6. **`spec.json`.** Version 2:
   `{"version": 2, "steps": [{"job": "<name>", "load": {...}}]}`, with the
   same `auto`, `preset`, and `custom` loads. Version 1 fails with
   `spec version 1 is no longer read: set "version": 2 and rename each step's
"workflow" to "job"`.
7. **Workflow evidence.** `reports/workflow/workflow.json` replaces
   `reports/chain/chain.json`. Its top-level `"sequence"` becomes `"jobs"`,
   and each step's `"workflow"` becomes `"job"`. Every other field keeps its
   name and meaning.
8. **Dispatch.** `request.json` keeps `kind`, `selection`, and `profile`;
   `kind` takes `job` or `workflow`. An old `single` or `chain` value fails
   like any unknown kind, naming the two accepted values.
9. **`./dev perf:chain`.** Exits 1 with `perf:chain was renamed to
perf:workflow`. No other `./dev` command changes name.
10. **GitHub forms.** `perf-job.yml`: title `Punch performance — job`, inputs
    `job` and `profile`, run name `perf-job: <job> (<profile>) by @<actor>`.
    `perf-workflow.yml`: title `Punch performance — workflow`, inputs
    `workflow` and `target-profile`, run name
    `perf-workflow: <workflow> (<target-profile>) by @<actor>`. The old
    files are deleted; their past runs stay in the Actions history under the
    old names, and API calls to them return 404.

## Delivery

Two commits, in this order:

1. **Punch commit**, pushed to Punch's remote first. It contains the code,
   tests, bundled jobs, `k8s/punch-k6-run.yaml`, and docs; a new
   `CHANGELOG.md` entry; and a new `docs/decisions/0007-job-terminology.md`
   that records the terms. ADR 0005 (`workflow-yaml-runtime`) stays as
   history.
2. **Expresso commit**, which bumps `vendor/punch` to the pushed Punch commit
   and carries every Expresso change: code, tests, the job YAML move, the
   Kubernetes templates, both forms, CI, `CLAUDE.md`, the performance and
   reference docs, `docs/cli-reference.md` (re-pinned), and the next-steps
   docs. It cannot be split: the pointer bump breaks Expresso's imports
   without the edits, and the edits fail without the bump. A pointer to an
   unpushed Punch commit fails CI checkout.

## Verification

The work is complete when all of these pass:

1. Punch's test suite and Expresso's
   (`cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py'`),
   plus `uvx ruff@0.7.4 check scripts/pg`.
2. `./dev perf:forms --check` reports six standalone jobs, nine workflows,
   and the five profiles.
3. `./dev perf:http-purchase --config 1-iteration` and
   `./dev perf:workflow http-cart http-orders http-orders-status:1-iteration`
   pass on Docker, writing `reports/workflow/workflow.json`.
4. The three old-name messages appear exactly as written for a
   `kind: K6Workflow` file, a version 1 `spec.json`, and `./dev perf:chain`.
5. `./k8s verify` passes on minikube with the `job` Argo parameter.
6. CI on the merged commit is green, including `perf-smoke`.
7. A grep over both repositories finds no Punch-sense "workflow" for a
   single YAML unit, no "chain" or "recipe" for a sequence of jobs, and no
   `perf-run.yml` or `perf-chain.yml`, outside the dated records. This
   includes code comments and `TODO(next-steps/...)` anchors.
8. After the merge, one `perf-job` run and one three-step `perf-workflow`
   run pass on GitHub. Their artifacts keep the file layout of the `4329fc9`
   runs, apart from the renamed `reports/workflow/` directory and file.

GitHub runs a form from a branch only when a file with that name exists on
the default branch. `perf-job.yml` and `perf-workflow.yml` are new names, so
check 8 runs after the merge.

## Alternatives rejected

### Keep the command and file names

Rename the schema, API, saved JSON, and docs, but keep `./dev perf:chain`,
`perf-chain.yml`, and `reports/chain/`. Fewer moving parts, but the old word
stays in the most-used command, which is where the confusion starts.

### A deprecation window

Accept both kinds, keep the old Python names as aliases, and read spec
version 1. That protects unknown Punch users, but it doubles the surface and
needs a later change to remove the aliases.

### `apiVersion: punch/v2`

A new API version would mark the break in the header. The owner kept
`punch/v1`: the kind check already rejects every old file with a message
that names the replacement.

### Move the Punch workflow into Punch

Punch would own the sequence document, or the planner and runner too. That
matches the repository boundary, but it is a feature move on top of a rename
and needs its own design.

## Known cost

- "Job" now names both a GitHub job and a Punch job, one inside the other.
  Documents must qualify "GitHub job" wherever both appear.
- The Actions history splits at the file rename, and API callers of
  `perf-run.yml` or `perf-chain.yml` get 404 until they switch.
- About 2,000 lines change across both repositories. Open branches that touch
  the renamed files will conflict.
- The dated records keep the old vocabulary, so a reader of
  `docs/superpowers/` or `docs/specs/` meets "workflow" in the old sense.
