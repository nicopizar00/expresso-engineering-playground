# Running Punch workflows on Expresso

Status: open. Chains run locally and on demand from GitHub Actions (Expresso
`8276cd0`, Punch `3e7141f`). The replacement GitHub Actions design below is
complete and ready for review, but not implemented. Local setup and the start
page still need decisions.

Goal: a person who has never run a Punch workflow on Expresso picks the right
entry point, runs one workflow or a chain, and reads the result, from one
page, without reading code.

## What is built

| Entry point                                                            | Runs                                                                                                        | Stack                                                           | Result                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `./dev perf:<workflow>`                                                | One workflow; `--config`, `--produce`, `--data`                                                             | Local Docker (`./dev up`, `./dev up web` for browser workflows) | Console metrics; `tests/performance/k6/reports/`                               |
| `./dev perf:chain <workflow>[:<shape>] ...`                            | Workflows in order; each step reads what earlier steps wrote; `auto` sizes writers; `--plan` validates only | Local Docker                                                    | `tests/performance/k6/reports/chain/`                                          |
| GitHub Actions, `perf` workflow                                        | The same chain, up to 4 steps picked in a form                                                              | The GitHub runner (app and k6 on one 4-vCPU VM)                 | Job summary table; artifact `perf-chain-<run id>`                              |
| CI `perf-smoke` job                                                    | `http-purchase` once, then `http-cart`, `http-orders`, `http-orders-status` as a chain                      | The GitHub runner                                               | Job pass or fail                                                               |
| Punch's menu and CLI (`python3 -m punch menu`, `punch run --size-for`) | One workflow, interactively or sized for a target                                                           | Local Docker                                                    | `tests/performance/k6/reports/`; run evidence in `vendor/punch/reports/state/` |
| `./dev perf:<workflow> --runtime k8s`                                  | One workflow on Argo Workflows                                                                              | minikube                                                        | S3; see [punch-k8s.md](punch-k8s.md)                                           |

Chain rules and evidence: [`orchestrator.md`](../performance/orchestrator.md#chains-perfchain).

Measured on GitHub on 2026-10-16:

| Chain                                                                        | Job time   | Stack start           | Chain      |
| ---------------------------------------------------------------------------- | ---------- | --------------------- | ---------- |
| `browser-purchase` → `http-orders-status:5-vu-5m` (rejected: 81 browser VUs) | 15 s       | not started           | not run    |
| `browser-cart` → `http-orders:1-iteration`                                   | 3 min 2 s  | 2 min 16 s (with web) | 8 s        |
| `http-cart` → `http-orders:5-vu-5m`                                          | 11 min 9 s | 1 min 52 s            | 8 min 48 s |

## Friction found so far

- **Setup is four manual steps, and the docs disagree.** Submodule, Python
  dependency, `./dev up`, and the k6 image build. `orchestrator.md` installs
  the dependency in a venv; `README.md`, `CLAUDE.md`, and
  `tests/performance/k6/README.md` use a bare `pip install`, which Homebrew
  Python refuses with `externally-managed-environment`.
- **The k6 image bakes the compiled scenarios.** After a scenario change,
  `./dev perf:*` runs the old code until someone rebuilds the image by hand.
- **Picking a workflow needs the README.** Nine names; what each reads,
  writes, and targets lives in README tables. The CLI lists no workflows,
  and the GitHub form shows bare names, so an impossible chain is caught
  only after dispatch.
- **Shapes are terse.** `auto`, `1-iteration`, `5-iterations`, `1-vu-5m`,
  `5-vu-5m`; the form does not say that a browser step gets the `-browser`
  preset or that the 5-minute shapes are refused for browser steps.
- **Sizing has three entry points:** `perf:chain` with `auto`, Punch's menu,
  and `punch run --size-for`. `./dev perf:<workflow>` has none.
- **Single runs read leftover data.** `./dev perf:http-orders` reads whatever
  `data/carts.csv` holds; a chain never does.
- **Results are partial.** The GitHub summary shows requests, error rate,
  p90, and checks per step, not which thresholds held; HTML reports sit
  inside the artifact zip.
- **Every GitHub run is titled `perf`.**
- **Nothing says runner numbers are not capacity.** App and k6 share the
  runner's 4 vCPUs.
- **The browser VU cap (4) is unmeasured.**
- **About 1,300 lines across five docs** (k6 README 348, `orchestrator.md`
  304, `k8s-runtime.md` 439, `cli-reference.md` 131, `validation.md` 106),
  plus Punch's README. No page maps "I want to do X" to "run Y".

## GitHub Actions design

Use two user-facing manual workflows and one internal reusable workflow. This
is the smallest design that keeps the simple case simple, prevents invalid
workflow order in the form, and shares all execution behavior.

| Workflow            | Trigger             | Responsibility                                                                          |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `perf-run.yml`      | `workflow_dispatch` | Select and run one workflow that needs no earlier producer                              |
| `perf-chain.yml`    | `workflow_dispatch` | Select one complete valid producer/consumer recipe and configure each active step       |
| `_perf-execute.yml` | `workflow_call`     | Normalize and validate form values, run them, summarize them, and upload their evidence |

The current user-facing `perf.yml` is replaced by the first two workflows.
The existing CI `perf-smoke` job remains an automatic gate and is not another
manual form. Reusing `_perf-execute.yml` from CI is a separate decision.

This design is only for Compose on a GitHub-hosted runner. Kubernetes, AWS,
schedules, arbitrary graph editing, and capacity testing are out of scope.

### Verified platform constraints

The following constraints were checked against the official documentation on
2026-10-16:

- A `workflow_dispatch` form declares a fixed list of inputs in YAML. A
  `choice` input selects one string; it cannot update another input's options.
  A form may have at most 25 top-level inputs. See
  [workflow dispatch inputs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs).
- The workflow file must exist on the default branch before it appears in the
  Actions UI. The operator can then select the Git ref to run from the Branch
  dropdown. See
  [manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
- A same-repository reusable workflow is called as a job, uses `workflow_call`,
  and resolves at the same commit as its caller when referenced with a relative
  path. See
  [reusing workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).
- Dispatch values are untrusted input. They must be passed to a validator as
  data, not interpolated into a shell program. See
  [script injections](https://docs.github.com/en/actions/concepts/security/script-injections).
- `actions/upload-artifact@v4` produces an artifact URL and SHA-256 digest and
  treats an uploaded artifact as immutable. See the
  [upload-artifact action](https://github.com/actions/upload-artifact/tree/v4/).
- A public-repository `ubuntu-latest` runner currently has 4 vCPUs, 16 GB of
  RAM, and 14 GB of SSD space; private repositories receive a smaller standard
  runner. See
  [GitHub-hosted runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories).
- k6 thresholds, not checks alone, determine a threshold failure and non-zero
  exit. `handleSummary()` can write JSON and HTML outputs. Sources:
  `k6 x docs using-k6/thresholds` and
  `k6 x docs results-output/end-of-test/custom-summary` (k6 docs v2.3.0).

These constraints rule out dependent workflow dropdowns in the native form.
The chain form therefore selects an already valid complete sequence.

### What the forms look like

The single-run form contains three inputs:

```text
Run workflow: Punch performance — single
Use workflow from: [ main                         v ]

Workflow          [ http-purchase                 v ]
Load               [ 1 journey                    v ]
Custom config      [                                ]

                                             [ Run workflow ]
```

The chain form contains nine inputs: one recipe, four load selectors, and four
custom-config paths. Four slots preserve the current chain limit; today's
longest recipe uses three.

```text
Run workflow: Punch performance — chain
Use workflow from: [ main                                      v ]

Sequence           [ http-cart -> http-orders -> http-orders-status v ]
Step 1 load         [ Auto (data-size producer; default otherwise) v ]
Step 1 custom config[                                             ]
Step 2 load         [ 5 users for 5 minutes                     v ]
Step 2 custom config[                                             ]
Step 3 load         [ Custom config                             v ]
Step 3 custom config[ custom/status-regression.json               ]
Step 4 load         [ Auto (unused)                              v ]
Step 4 custom config[                                             ]

                                                  [ Run workflow ]
```

Both forms use `run-name` so the Actions list shows the selected workflow or
sequence and the initiating actor. Human-readable form values are translated
to stable internal values at the form boundary:

| Form label                                     | Internal load value |
| ---------------------------------------------- | ------------------- |
| `Auto (data-size producer; default otherwise)` | `auto`              |
| `1 journey`                                    | `1-iteration`       |
| `5 journeys`                                   | `5-iterations`      |
| `1 user for 5 minutes`                         | `1-vu-5m`           |
| `5 users for 5 minutes`                        | `5-vu-5m`           |
| `Custom config`                                | `custom`            |

`Auto` has one consistent meaning. When the step produces data for a later
step, the planner sizes it for the first compatible reader, resolving from the
end of the chain. Otherwise it uses the workflow's default k6 config. A custom
reader config participates in sizing an earlier automatic producer.

Browser workflows transparently map supported presets to their `-browser`
variant. A duration preset with no browser variant is rejected during
planning. The static form cannot hide incompatible load values after a
workflow is selected, so the description warns about this and the planner is
the authority. After resolving any browser load, including a custom config,
the planner must be able to calculate its peak VUs and reject a value above
the current cap of 4.

Custom configs are committed JSON objects beneath
`tests/performance/k6/options/`; the form path is relative to that directory.
Absolute paths, `..`, non-JSON files, missing files, and paths outside that
directory are rejected. `Custom config` with an empty path, or a path supplied
for another load mode, is also rejected. Values in inactive step slots are
ignored. This keeps a run reproducible from its selected Git ref and avoids
accepting executable or inline JSON from the form.

### Catalog-derived choices

The standalone list contains every catalog workflow whose `requires` list is
empty. An optional dataset does not block a standalone run. The six current
choices are:

- `browser-cart`
- `browser-purchase`
- `http-auth-login`
- `http-cart`
- `http-purchase`
- `http-purchase-registered`

A producer-to-consumer edge exists only when the producer declares the
dataset, names the consumer as a target, and the consumer declares that
dataset as required or optional. Chain recipes are every unique, acyclic path
of two to four workflows starting at a standalone workflow. Every recipe must
also pass the existing chain planner. The nine current choices are:

1. `browser-cart` → `http-orders`
2. `browser-cart` → `http-orders` → `http-orders-status`
3. `http-cart` → `http-orders`
4. `http-cart` → `http-orders` → `http-orders-status`
5. `browser-purchase` → `http-orders-status`
6. `http-purchase` → `http-orders-status`
7. `http-auth-login` → `http-me-hot-status`
8. `http-purchase-registered` → `http-auth-login`
9. `http-purchase-registered` → `http-auth-login` → `http-me-hot-status`

One repository command, `./dev perf:forms --write|--check`, owns this
derivation. Write mode replaces only marked generated option blocks in
`perf-run.yml` and `perf-chain.yml`; check mode fails if those blocks do not
match the catalog. Tests pin the current six and nine choices, reject
duplicates and cycles, enforce the four-step bound, and prove that every
emitted recipe passes `plan_chain`.

The form is convenience, not a security boundary. The normalizer regenerates
the catalog choices at run time and rejects an input not in them. This also
protects CLI or API dispatches that bypass the dropdown.

### Normalized execution contract

Both forms call `_perf-execute.yml` with the same ten inputs: `kind`,
`selection`, and four load/path pairs. The single form fills only the first
pair; the chain form fills all four. A repository command reads those values
from environment variables and translates them into one versioned JSON
document. A single run is exactly the same document with one step:

```json
{
  "version": 1,
  "steps": [
    { "workflow": "http-cart", "load": { "mode": "auto" } },
    {
      "workflow": "http-orders",
      "load": { "mode": "preset", "value": "5-vu-5m" }
    },
    {
      "workflow": "http-orders-status",
      "load": { "mode": "custom", "path": "custom/status-regression.json" }
    }
  ]
}
```

The reusable workflow declares these as typed `workflow_call` strings. Its
first repository command, `./dev perf:dispatch`, writes the attempted inputs
to `request.json`, validates them, and writes valid normalized input to the
immutable `spec.json`. It separately initializes `dispatch.json` with run
metadata and the current stage. The command emits only bounded booleans and
identifiers, such as whether the browser stack is required, through
`GITHUB_OUTPUT`.

Planning and execution consume the same `spec.json` through a stable
`perf:chain --spec <path>` interface. The current positional interface remains
valid for local use. No step constructs a shell command string, calls `eval`,
or expands `${{ inputs.* }}` inside shell source; form inputs reach Python
through environment variables or quoted arguments.

The planner resolves all workflows, dataset links, presets, custom files, and
producer sizing before Docker starts. It then records the fully resolved k6
config and data flow for every step. Execution stops on the first failed step
and marks later steps skipped.

### Reusable workflow contract

`_perf-execute.yml` has one `ubuntu-latest` job. Keeping planning, Compose,
k6, reports, and artifact upload in the same job preserves the local files and
avoids cross-job artifact merging. Its contract is:

- `permissions: contents: read` and `timeout-minutes: 60`.
- Checkout the selected ref with recursive submodules, then use Python 3.11
  with a pip cache based on `vendor/punch/requirements.txt`.
- Create the report directory and dispatch record, normalize the form input,
  and run the complete plan before starting the stack.
- Run `./dev up web` when any step is a browser workflow; otherwise run
  `./dev up`.
- Build `k6`, and also `k6-browser` when required, so the run never executes a
  stale scenario baked into an earlier image.
- Make the reports directory writable by the k6 container and execute the
  exact specification that was planned.
- On stack failure, capture Compose service state and the last 200 log lines.
  On execution failure, preserve the failed step and mark remaining steps
  skipped.
- With `if: always()`, finalize the dispatch record, upload the whole reports
  directory once using `actions/upload-artifact@v4`, append the summary and
  artifact link to `GITHUB_STEP_SUMMARY`, and tear the stack down.

The artifact name is `perf-<run-id>-<attempt>`. `if-no-files-found: error`
turns an evidence regression into a visible failure. The upload action's
`artifact-url` and `artifact-digest` are added to the job summary after the
immutable artifact exists; they cannot be written back into that artifact.
Failures before checkout can only be represented by the GitHub job log. After
report-directory initialization, every normal failure attempts an artifact
upload; cancellation, runner loss, or an artifact-service outage cannot offer
that guarantee.

### Result and evidence contract

The artifact contains:

- `request.json`: the form values received by the reusable workflow;
- `spec.json`: the immutable normalized specification used by both planning
  and execution;
- `dispatch.json`: event ref and commit SHA, actor, execution stage, final
  status, artifact name, and runner label;
- `chain.json` and `summary.md`: the resolved steps, dataset links, generated
  configs, warnings, errors, step status, and timings;
- each step's k6 JSON summary, HTML report, console log, and any generated
  producer config;
- Compose diagnostic output when stack startup fails.

No environment values or secrets are copied into evidence.

The custom k6 JSON summary records every threshold as metric, expression, and
`ok` value in addition to its aggregate `passed` value. The chain summary uses
those results rather than inventing another pass rule. Checks only gate a run
when the scenario defines a threshold for the `checks` metric. Missing metrics
are shown as “not emitted,” not zero.

The job summary starts with `Passed`, `Failed`, or `Rejected`, then shows one
row per step with workflow, resolved load, data flow, duration, request count,
error rate, latency, checks, and threshold gate. A details section lists every
threshold expression and result, warnings, the selected ref and SHA, and a
direct artifact link plus digest.

Every summary includes this warning:

> The app and k6 share one GitHub-hosted runner. Use these results for
> regression evidence, not capacity claims. Compare only runs with the same
> workload, test data, and environment.

### Failure behavior

| Failure                                    | Result                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| Unknown or stale sequence                  | Reject before Docker; annotate the error and upload the attempted specification |
| Missing required producer or invalid order | Reject before Docker; show the missing dataset and compatible producer          |
| Invalid preset or browser load             | Reject before Docker; show the supported choices for that workflow              |
| Invalid or missing custom config           | Reject before Docker; show the path rule or JSON error                          |
| Browser load exceeds the VU cap            | Reject before Docker; identify the resolved config and peak VUs                 |
| Stack or image build fails                 | Fail; attach Compose diagnostics and skip k6                                    |
| k6 exits non-zero or a threshold fails     | Fail that step, skip later steps, retain all completed and failed-step evidence |
| Summary or artifact evidence is missing    | Fail the job instead of reporting an unevidenced success                        |
| Teardown fails after another failure       | Preserve the original result and add a cleanup warning                          |

### Alternatives rejected

- One overloaded form has fewer files but exposes irrelevant step fields for
  single runs and mixes two user intents.
- One workflow per sequence would need 15 user-facing files today and would
  duplicate setup and evidence behavior.
- Independent workflow dropdowns cannot prevent invalid order in GitHub's
  static native form.
- A custom GitHub App or external UI could provide dynamic dependent selects,
  but adds authentication, deployment, and maintenance that nine static
  recipes do not justify.

### Design acceptance conditions

The design is satisfied when:

1. The generated forms contain exactly six standalone workflows and nine
   valid recipes for the current catalog.
2. A one-step run, a two-step producer/consumer run, and each current
   three-step chain can be dispatched without editing YAML.
3. Every active step accepts automatic/data-sized, preset, or committed custom
   configuration, and a custom consumer config sizes an earlier automatic
   producer.
4. An invalid sequence submitted through the API is rejected before Docker,
   even though it never appeared in the UI.
5. Planning and execution consume the same `spec.json`, and that exact file is
   uploaded as evidence.
6. Threshold failures fail the job and appear by expression in the summary.
7. Every normal failure after evidence initialization attempts one immutable
   artifact upload; when upload succeeds, its URL and digest appear in the job
   summary.
8. Runner results are labeled as regression evidence, not capacity results.

## Remaining questions

1. Does the start page live at the top of
   `tests/performance/k6/README.md`, or in a new page organized by task?
2. Does `./dev perf:doctor` check the submodule, Python environment, images,
   and stack, or does each performance command build missing images itself?
3. Which Python environment works for both Homebrew Python and CI? The local
   docs must use that environment consistently.
4. What browser VU count does the runner sustain? Measure it before changing
   the starting cap of 4.

## How to evaluate

Run a fresh-reader walkthrough. Give a person, or a new agent session, only
the docs and these tasks; record each doc opened, each command tried, the
time taken, and where they stopped:

1. Run `http-purchase` once locally and say whether it passed.
2. Run cart → order → status locally, with the orders sized for a 5-minute
   status run.
3. From `perf-run.yml`, run `http-purchase` once and report its threshold
   result.
4. From `perf-chain.yml`, run `http-cart` → `http-orders` at 5 VUs for 5
   minutes and report step 2's p90.

The thread is done when each task works from one page, without reading code
or asking for help.
