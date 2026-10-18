# Performance form simplification design

## Status

Direction approved in conversation on 2026-10-17. The written details await
review before implementation planning.

## Problem

The GitHub performance forms expose the planner's internal step model instead
of the operator's test intent. `perf-chain.yml` asks for one recipe, four load
choices, and four custom-config paths. A two-step recipe leaves four visible
inputs unused, and no current recipe reaches the fourth step. `perf-run.yml`
also requires a separate custom-config path whenever its load choice is
`Custom config`.

Punch already resolves a chain from the last step backward. An automatic
producer is sized for the first later workflow that reads its data, while a
terminal automatic step uses its workflow default. The GitHub form therefore
does not need a load choice for every step. The operator needs to choose the
workflow recipe and the load applied to its terminal target.

The current recipe selector remains valuable. `scripts/pg/perf_forms.py`
derives recipes from declared dataset links and retains only paths that the
planner accepts. Independent workflow dropdowns would allow incompatible
orders. GitHub defines each `choice` input as one static, single-select string
in the workflow file; it provides no dependent-choice contract. See
[workflow dispatch inputs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs).

## Goals

- Each user-facing GitHub performance form has two inputs.
- A chain operator chooses one valid recipe and one target profile.
- Every step before the target uses automatic producer sizing.
- Built-in presets and committed custom configs appear in one generated
  profile list.
- The runtime re-derives and validates every submitted choice before Docker
  starts.
- Local CLI and versioned spec users retain per-step load control.
- Planning, execution, evidence collection, and runner behavior stay
  unchanged after form normalization.

## Non-goals

- Combining `perf-run.yml` and `perf-chain.yml` into one user-facing workflow.
- Adding dependent dropdowns, a GitHub App, or another external interface.
- Applying the selected profile independently to every chain step.
- Adding an advanced per-step GitHub form.
- Changing k6 configs, thresholds, browser limits, dataset contracts, or
  producer-sizing formulas.
- Reducing stack startup, image build, or scenario execution time.
- Changing the `perf:chain --spec` document format.

## User interface

### Single workflow

`perf-run.yml` contains two inputs:

```text
Workflow [ http-purchase        v ]
Profile  [ 1 journey            v ]
```

The workflow list remains the catalog-derived set whose required dataset list
is empty. The default profile remains `1 journey`.

### Chain

`perf-chain.yml` contains two inputs:

```text
Recipe         [ http-cart -> http-orders -> http-orders-status v ]
Target profile [ 5 journeys                                      v ]
```

`Recipe` replaces `Sequence` as the field name. Recipe option values remain
the ordered workflow IDs joined by `->`. This preserves direct catalog
traceability and keeps the submitted value useful in run names and evidence.
The default target profile is `5 journeys`, which matches the current default
configuration of every terminal workflow in the catalog.

The chain form does not expose `Auto`. Automatic sizing is an internal rule
for every step before the target. The selected profile always applies to the
last workflow in the recipe.

### Profiles

The generated profile list contains the four built-in presets followed by
committed custom configs:

```text
1 journey
5 journeys
1 user for 5 minutes
5 users for 5 minutes
Custom: custom/status-regression.json
```

Built-in labels keep their current mappings:

| Profile label           | Spec load                                     |
| ----------------------- | --------------------------------------------- |
| `1 journey`             | `{"mode": "preset", "value": "1-iteration"}`  |
| `5 journeys`            | `{"mode": "preset", "value": "5-iterations"}` |
| `1 user for 5 minutes`  | `{"mode": "preset", "value": "1-vu-5m"}`      |
| `5 users for 5 minutes` | `{"mode": "preset", "value": "5-vu-5m"}`      |

`scripts/pg/perf_forms.py` discovers custom profiles beneath
`tests/performance/k6/options/custom/`, recursively selects `.json` files,
sorts their repository-relative option paths, and renders each as
`Custom: <path>`. The label maps to a custom spec load whose `path` is the
part after `Custom: `.

Custom profile discovery determines availability in the form. The existing
path validator and planner remain authoritative for path containment, file
existence, JSON structure, browser configuration, and peak VUs. A stale or
invalid custom profile is rejected before Docker starts.

## Normalization contract

The reusable `_perf-execute.yml` workflow accepts three string inputs:

| Input       | Meaning                                    |
| ----------- | ------------------------------------------ |
| `kind`      | `single` or `chain`                        |
| `selection` | Standalone workflow ID or recipe label     |
| `profile`   | Built-in or generated custom profile label |

The calling forms provide fixed `kind` values. `perf-run.yml` passes its
workflow as `selection`; `perf-chain.yml` passes its recipe. Both pass their
profile choice unchanged.

The reusable job passes these values through environment variables as data:
`PERF_KIND`, `PERF_SELECTION`, and `PERF_PROFILE`. Form values never appear
inside generated shell commands.

`scripts/pg/perf_dispatch.py` normalizes the three values as follows:

1. Re-derive standalone workflows, valid recipes, and profiles from the
   checked-out commit.
2. Resolve `selection` to one workflow for `single` or an ordered workflow
   list for `chain`.
3. Resolve `profile` to a preset or custom `StepRequest` load.
4. Create automatic `StepRequest` values for every selected workflow.
5. Replace the last request's load with the resolved profile.
6. Write the existing version 1 `spec.json` document.

For example, this form request:

```text
kind: chain
selection: http-cart -> http-orders -> http-orders-status
profile: Custom: custom/status-regression.json
```

produces:

```json
{
  "version": 1,
  "steps": [
    { "workflow": "http-cart", "load": { "mode": "auto" } },
    { "workflow": "http-orders", "load": { "mode": "auto" } },
    {
      "workflow": "http-orders-status",
      "load": { "mode": "custom", "path": "custom/status-regression.json" }
    }
  ]
}
```

The planner then sizes `http-orders` for `http-orders-status` and sizes
`http-cart` for the resolved `http-orders` configuration. The execution job
plans and runs the same immutable spec as it does today.

## Preserved contracts

The change stops at the GitHub form boundary. These contracts remain:

- `scripts/pg/perf_spec.py` version 1, including per-step `auto`, `preset`,
  and `custom` loads.
- `./dev perf:chain <workflow>[:<shape>] ...` and
  `./dev perf:chain --spec <path>` for advanced per-step control.
- Catalog-derived workflow and recipe validation.
- Reverse producer sizing and browser VU validation in
  `scripts/pg/perf_chain.py`.
- One reusable execution job that plans before Docker, starts the required
  stack, rebuilds the required k6 images, runs the spec, uploads evidence,
  publishes the summary, and tears down.
- The dispatch, chain, summary, and artifact evidence formats, except that
  `request.json` records three received form values instead of ten reusable
  workflow inputs.

The reusable workflow is internal and referenced by relative path from the
two user-facing workflows. Its input contract may change with both callers in
the same commit.

## Validation and failure behavior

The dispatcher rejects these requests before stack startup:

- an unknown or stale standalone workflow;
- an unknown or stale recipe;
- an unknown or stale profile;
- a custom profile whose path or JSON is invalid;
- a profile incompatible with a browser workflow;
- a target load that requires an automatic browser producer to exceed the
  current VU cap;
- any recipe that no longer plans against the checked-out catalog.

The static form cannot hide a duration profile for a browser workflow or a
profile that makes an upstream browser producer exceed its cap. The planner
keeps authority over those compatibility checks and reports the failing step
and resolved profile.

## Code and documentation changes

| Area                                             | Change                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `.github/workflows/perf-run.yml`                 | Replace `load` plus `config` with generated `profile`.                                           |
| `.github/workflows/perf-chain.yml`               | Replace `sequence` and eight step fields with `recipe` plus generated `target-profile`.          |
| `.github/workflows/_perf-execute.yml`            | Replace eight load/config inputs with `profile`; pass three form values to the dispatcher.       |
| `scripts/pg/perf_forms.py`                       | Generate valid recipes and one profile list containing built-ins plus committed custom configs.  |
| `scripts/pg/perf_dispatch.py`                    | Resolve one profile and apply it to the terminal `StepRequest`; make earlier requests automatic. |
| `scripts/pg/perf_spec.py`                        | Keep the spec format; separate internal auto mode from user-facing profile labels if needed.     |
| `scripts/pg/tests/test_perf_forms.py`            | Cover deterministic custom-profile discovery, rendering, and label mapping.                      |
| `scripts/pg/tests/test_perf_dispatch.py`         | Cover target-only normalization for single, two-step, and three-step selections.                 |
| `scripts/pg/tests/test_perf_github_workflows.py` | Pin both two-input forms and the three-input reusable contract.                                  |
| `docs/performance/orchestrator.md`               | Describe recipe plus target-profile behavior and the preserved CLI path.                         |
| `docs/next-steps/perf-run-ux.md`                 | Update the descriptive GitHub form and evidence sections after implementation.                   |

Documentation that describes ten received form values or per-step GitHub load
fields must change in the same implementation commit.

## Alternatives rejected

### Independent workflow slots

`Workflow 1` through `Workflow 4` recreate the former `perf.yml` interface.
GitHub's static choices cannot restrict a later field based on an earlier
workflow, so the form would offer invalid orders and gaps. The planner would
reject them after dispatch. Nine current recipes fit comfortably in one
curated selector and fail earlier at choice validation.

### One profile applied to every step

Applying the selected profile to each step would disable producer sizing.
Producers could write too few rows for a consumer, generate unnecessary rows,
or run unsupported duration profiles in Chromium. The target-profile model
keeps the selected load at the operator's target and derives upstream work.

### Current per-step controls

Per-step controls retain every advanced combination in GitHub, but they show
irrelevant fields for shorter recipes and require the operator to understand
the planner's internal steps. The local CLI and versioned spec already own
that advanced interface.

### One combined single-and-chain form

A combined form removes one Actions sidebar entry but creates one list with
both standalone workflows and recipes. Keeping the two forms preserves the
operator's single-run versus data-chain choice without affecting the shared
execution path.

## Verification

Implementation is complete when all of these checks pass:

1. `./dev perf:forms --check` reports six standalone workflows, nine valid
   recipes, and the generated profile list without modifying either form.
2. `perf-run.yml` has exactly `workflow` and `profile` inputs.
3. `perf-chain.yml` has exactly `recipe` and `target-profile` inputs.
4. `_perf-execute.yml` accepts exactly `kind`, `selection`, and `profile` as
   strings.
5. A single `http-purchase` request with `1 journey` writes one preset step.
6. `http-cart -> http-orders` with `5 users for 5 minutes` writes an automatic
   cart producer and a `5-vu-5m` orders target.
7. `http-cart -> http-orders -> http-orders-status` with
   `Custom: custom/status-regression.json` writes two automatic producers and
   one custom target.
8. A custom profile participates in reverse producer sizing during `--plan`.
9. Unknown recipes and profiles are rejected before Docker starts and appear
   in dispatch evidence.
10. Existing browser preset and peak-VU failures remain pre-Docker planner
    failures.
11. The focused form, dispatcher, spec, and planner test suites pass.
12. The existing local per-step CLI and version 1 spec tests pass unchanged.
13. Workflow YAML formatting, Python lint, and documentation contract checks
    pass.
14. One live single run and one live three-step chain preserve the current
    summary and artifact structure, with `request.json` reflecting the new form
    contract.

## Known cost

The default GitHub form no longer supports a different manual profile for an
intermediate step. Operators who need that control use `./dev perf:chain` or a
committed version 1 spec. Adding an advanced GitHub entry point requires a
separate design backed by a demonstrated remote-use case.
