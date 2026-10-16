# Running Punch workflows on Expresso

Status: open. Chains run locally and on demand from GitHub Actions (Expresso
`8276cd0`, Punch `3e7141f`). The GitHub Actions target below is decided but
not implemented. Local setup and the start page still need decisions.

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

## GitHub Actions target

Two forms will cover the supported use cases without duplicating execution
logic. A third workflow, callable only through `workflow_call`, will own the
shared setup and execution steps.

| Workflow            | User input                                                 | Responsibility                                                                            |
| ------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `perf-run.yml`      | One standalone workflow and one load choice                | Run any catalog workflow that has no required dataset                                     |
| `perf-chain.yml`    | One valid chain recipe and one load choice per active step | Run a producer and consumer pair or a longer chain                                        |
| `_perf-execute.yml` | A normalized chain specification from either form          | Plan, start the required stack, build current images, run, summarize, and upload evidence |

The existing CI `perf-smoke` job remains an automatic gate. It may call
`_perf-execute.yml` after the reusable workflow exists, but it does not become
a third user-facing form.

GitHub declares `workflow_dispatch` choices as fixed YAML options. The form
cannot filter step 2 after a person selects step 1, so `perf-chain.yml` will
offer complete valid sequences instead of one workflow dropdown per step.
The catalog generator will write both forms' options, and a drift test will
fail when the checked-in options differ from the workflow catalog. GitHub's
current input contract is documented in
[Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs)
(checked 2026-10-16).

### Catalog-derived choices

`perf-run.yml` will offer the six workflows that have no required dataset:

- `browser-cart`
- `browser-purchase`
- `http-auth-login`
- `http-cart`
- `http-purchase`
- `http-purchase-registered`

`perf-chain.yml` will offer the nine current producer and consumer sequences:

1. `browser-cart` → `http-orders`
2. `browser-cart` → `http-orders` → `http-orders-status`
3. `http-cart` → `http-orders`
4. `http-cart` → `http-orders` → `http-orders-status`
5. `browser-purchase` → `http-orders-status`
6. `http-purchase` → `http-orders-status`
7. `http-auth-login` → `http-me-hot-status`
8. `http-purchase-registered` → `http-auth-login`
9. `http-purchase-registered` → `http-auth-login` → `http-me-hot-status`

The generator derives these lists from each workflow's required, optional,
and produced datasets. A sequence never appears in the form unless the
planner can connect every required dataset to an earlier producer.

### Per-step load choices

Each active step will accept one of three load modes:

- `auto`: size a producer for the next step that reads its data; otherwise
  use the workflow's default config.
- A named preset: show plain labels such as `5 users for 5 minutes`, then map
  them to the existing preset names before planning.
- `custom config`: read a repository-relative k6 options JSON file from the
  selected Git ref. The planner validates the file before Docker starts.

The chain form has four fixed load slots and four optional custom-config
paths. The selected recipe decides which slots are active; the reusable
workflow ignores the rest. Browser steps map supported presets to their
`-browser` variants, and planning rejects unsupported duration shapes.

A single run enters `_perf-execute.yml` as a chain of one. Both forms
therefore use the same planning, image build, evidence, and failure paths.

### Run output

Each run will use `run-name` to show the selected workflow or chain and its
load choices. The job summary will show the result, threshold status, p90,
checks, request count, and duration for every step. Runner runs will state
that the app and k6 share one GitHub-hosted runner, so the numbers are
regression evidence rather than capacity measurements.

The workflow will always upload the chain plan, JSON summaries, HTML reports,
and logs under one run-specific artifact. The job summary will link to the
run's artifact section.

## Implementation work

1. Generate the six standalone choices and nine chain choices from the
   catalog, then add a test that detects drift in both forms.
2. Extend the chain input model so every step accepts `auto`, a preset, or a
   repository-relative custom config path.
3. Add `_perf-execute.yml`, then make `perf-run.yml` and `perf-chain.yml`
   normalize their inputs into its chain specification.
4. Add threshold results and artifact links to the existing chain summary.
5. Add `run-name` values and the shared-runner capacity warning.
6. Decide where the one-page start guide lives, then test both forms through
   the fresh-reader walkthrough below.

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
