# Running Punch workflows on Expresso

Status: open. Chains run locally and on demand from GitHub Actions (Expresso
`8276cd0`, Punch `3e7141f`). The open questions below decide how to make
running a workflow easy for a person.

Goal: a person who has never run a Punch workflow on Expresso picks the right
entry point, runs one workflow or a chain, and reads the result, from one
page, without reading code.

## What is built

| Entry point | Runs | Stack | Result |
| --- | --- | --- | --- |
| `./dev perf:<workflow>` | One workflow; `--config`, `--produce`, `--data` | Local Docker (`./dev up`, `./dev up web` for browser workflows) | Console metrics; `tests/performance/k6/reports/` |
| `./dev perf:chain <workflow>[:<shape>] ...` | Workflows in order; each step reads what earlier steps wrote; `auto` sizes writers; `--plan` validates only | Local Docker | `tests/performance/k6/reports/chain/` |
| GitHub Actions, `perf` workflow | The same chain, up to 4 steps picked in a form | The GitHub runner (app and k6 on one 4-vCPU VM) | Job summary table; artifact `perf-chain-<run id>` |
| CI `perf-smoke` job | `http-purchase` once, then `http-cart`, `http-orders`, `http-orders-status` as a chain | The GitHub runner | Job pass or fail |
| Punch's menu and CLI (`python3 -m punch menu`, `punch run --size-for`) | One workflow, interactively or sized for a target | Local Docker | `tests/performance/k6/reports/`; run evidence in `vendor/punch/reports/state/` |
| `./dev perf:<workflow> --runtime k8s` | One workflow on Argo Workflows | minikube | S3; see [punch-k8s.md](punch-k8s.md) |

Chain rules and evidence: [`orchestrator.md`](../performance/orchestrator.md#chains-perfchain).

Measured on GitHub on 2026-10-16:

| Chain | Job time | Stack start | Chain |
| --- | --- | --- | --- |
| `browser-purchase` → `http-orders-status:5-vu-5m` (rejected: 81 browser VUs) | 15 s | not started | not run |
| `browser-cart` → `http-orders:1-iteration` | 3 min 2 s | 2 min 16 s (with web) | 8 s |
| `http-cart` → `http-orders:5-vu-5m` | 11 min 9 s | 1 min 52 s | 8 min 48 s |

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

## Open questions

Evaluate these first; each answer becomes a doc or CLI change.

1. Who is the first user, and what is their first task: checking a change,
   loading a flow for minutes, or reading someone else's results? The answer
   picks the default entry point and the start page.
2. Where does the start page live: the top of
   `tests/performance/k6/README.md`, or a new page organized by goal? What
   moves out of the README?
3. Should setup be one command, such as a `./dev perf:doctor` that checks
   the submodule, dependency, images, and stack, or should `perf:*` build
   missing images itself? Venv or bare `pip`: pick one and say it everywhere.
4. Should the CLI list workflows (what each does, reads, writes, and which
   shapes fit), with the same text generated into the GitHub form
   descriptions?
5. Should shapes read as plain words ("5 users for 5 minutes")? GitHub
   choice options are the literal values, so a label either renames the CLI
   value or goes in the description.
6. Should the form offer named common chains (cart → order → status) beside
   the four free steps?
7. Should `./dev perf:<workflow>` behave as a chain of one, sized and safe
   from leftover data, so there is one model to learn?
8. What should a result show: threshold pass or fail per metric, a "not
   capacity" note for runner runs, a direct link to the HTML reports?
9. Should each GitHub run be titled with its steps (`run-name`)?
10. What browser VU count does the runner sustain? Measure it and replace
    the cap's starting value.

## How to evaluate

Run a fresh-reader walkthrough. Give a person, or a new agent session, only
the docs and these tasks; record each doc opened, each command tried, the
time taken, and where they stopped:

1. Run `http-purchase` once locally and say whether it passed.
2. Run cart → order → status locally, with the orders sized for a 5-minute
   status run.
3. From GitHub, run `http-cart` → `http-orders` at 5 VUs for 5 minutes and
   report step 2's p90.

The thread is done when each task works from one page, without reading code
or asking for help.
