# Punch Job Terminology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Punch's YAML unit from "workflow" to "Punch job", and Expresso's chain, recipe, and sequence vocabulary to "Punch workflow", across `vendor/punch` and Expresso, with a clean break.

**Architecture:** A scratch rename script (Appendix A) applies two ordered token maps while masking spans in another sense (Argo, GitHub, business, generic English). The `job` pass runs first in both repositories; the `workflow` pass runs only in Expresso, only on files that already passed `job`. Behavior changes (three old-name messages, spec version 2, evidence key `jobs`, dispatch kind values) are written by hand after the passes, test first. Punch lands first as one commit; Expresso lands as one commit that bumps the pointer.

**Tech Stack:** Python 3.9+ stdlib (`scripts/pg`), Punch (Python 3.11 in CI, PyYAML, rich, simple-term-menu), Argo Workflows and kustomize manifests, GitHub Actions YAML, Bash (`./k8s`, `k6-run.sh`), Prettier 3, ruff 0.7.4.

**Spec:** [`docs/superpowers/specs/2026-10-18-punch-job-terminology-design.md`](../specs/2026-10-18-punch-job-terminology-design.md)

## Global Constraints

- No AI attribution in commits, PR bodies, or docs (repo `CLAUDE.md` overrides the harness reminder). Committed content is English. Load the `technical-writing` skill before editing Markdown.
- Terms: **Punch job** = one YAML unit; **Punch workflow** = an ordered sequence of Punch jobs; **step** = a job's position in a workflow.
- Punch keeps `apiVersion: punch/v1`; the kind becomes `K6Job`.
- Clean break: no aliases, no deprecation window, no readers for old formats.
- Exact old-name messages: `kind K6Workflow was renamed to K6Job; change the kind line` (Punch loader); `spec version 1 is no longer read: set "version": 2 and rename each step's "workflow" to "job"` (Expresso `perf_spec`); `perf:chain was renamed to perf:workflow` (`./dev`, exit 1).
- Unchanged: GitHub workflows and jobs; Argo `Workflow`, `WorkflowTemplate`, `{{workflow.*}}` expressions, and `kubectl get|patch workflow`; business workflows (`use-cases/`, Expresso ADR 0002, the retired `workflow-traffic` feature); generic English "workflow" for a process (`## Next-steps workflow`, "Full workflow"); job names; "step"; `target-profile` and profile labels; `PERF_KIND`, `PERF_SELECTION`, `PERF_PROFILE`.
- Dated records are never edited: `docs/superpowers/`, Expresso `docs/specs/` and `docs/adr/`, Punch `docs/decisions/` 0001 to 0006, Punch `docs/specs/` (each says `Status: Implemented <date>`), and existing Punch `CHANGELOG.md` bullets.
- Delivery: one Punch commit, pushed first; then one Expresso commit that bumps `vendor/punch` to that pushed SHA and carries every Expresso change. Task commits are squashed into those two before anything is pushed. One exception, ruled here: `docs/cli-reference.md` pins the commit it was reviewed against, and a commit cannot name its own SHA, so its pin line moves in a docs-only follow-up commit (Task 8 Step 3).
- Python stays 3.9-compatible: `from __future__ import annotations`, `typing` generics, no `match`, no same-quote nesting in f-strings.
- Outward actions need the user's explicit OK at that step: any `git push` (either repo), any merge to `main`, any `gh workflow run`, any change to a running cluster beyond local minikube.
- Shell: zsh does not split unquoted variables. Pass file lists with `xargs`, never `$FILES`.
- Scratch: `SCRATCH=/private/tmp/claude-501/-Users-nicolaspizarro-repo-expresso-engineering-playground/<session>/scratchpad` (the session scratchpad). `T=$SCRATCH/rename_terms.py` (Appendix A). `PV=$SCRATCH/punch-venv/bin/python` (a venv with `vendor/punch/requirements.txt`; system Python lacks `rich`).
- Baselines before Task 1: Punch `PYTHONPATH=src $PV -m unittest discover -s tests -p 'test_*.py'` → `Ran 322 tests`, `OK`. Expresso `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py')` → `Ran 254 tests`, `OK`. Lint `uvx ruff@0.7.4 check scripts/pg`.
- Ordering rule: a test whose literals contain an old name (`K6Workflow`, `perf:chain`, a version 1 `"workflow"` key) is written after the rename script has run on its file, and the script never runs on that file again.

## Review Focus

1. **Argo spans renamed by mistake.** `{{workflow.name}}`, `{{workflow.parameters.*}}`, `kubectl get workflow`, and `"kind": "Workflow"` must survive; a renamed one breaks every Kubernetes run silently until `./k8s verify`. Tests: Task 2 (`test_argo_expressions_keep_argos_workflow_variable`), Task 4 (`test_phase_queries_argos_workflow_resource`).
2. **Renamed headings break inbound anchors.** `orchestrator.md#github-actions-perf-run-and-perf-chain` is linked from `CLAUDE.md`, both forms, `cli-reference.md`, and the k6 README; a reader expects every link to land. Test: Task 6 (`test_every_orchestrator_anchor_link_resolves`).
3. **An old job file in a consumer branch.** A file still saying `kind: K6Workflow` must fail with the rename message, not a generic error. Test: Task 1 (`test_the_old_kind_names_its_replacement`).
4. **Old command or spec from muscle memory or a saved artifact.** `./dev perf:chain …` and `./dev perf:workflow --spec <old spec.json>` must name the replacement. Tests: Task 5 (`test_perf_chain_names_its_replacement`, `test_a_version_1_spec_names_the_rename`).
5. **Leftover old vocabulary in prose or comments.** A reader meeting "workflow" for a single job, or "chain"/"recipe" for a sequence, outside the dated records. Test: Task 7 Step 1 (the grep gate, with its allowlist).

---

## File structure

| Area                         | Files                                                                                                                                                                                                                                                                                                                                                                                                                   | Task |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Punch engine                 | `src/punch/workflow.py` → `src/punch/job.py`; `src/punch/{__main__,catalog,data_plan,execution,menu,sizing}.py`; `workflows/k6/` → `jobs/k6/`; `tests/fixtures/*.yaml`                                                                                                                                                                                                                                                  | 1    |
| Punch tests                  | `tests/test_workflow.py` → `tests/test_job.py`; `tests/test_workflow_coverage.py` → `tests/test_job_coverage.py`; every other `tests/test_*.py` except `test_k8s_*.py` and `test_ci_contract.py`                                                                                                                                                                                                                        | 1    |
| Punch Kubernetes             | `k8s/punch-k6-run.yaml`, `k8s/k6-run.sh`, `tests/test_k8s_base.py`, `tests/test_k8s_run_script.py`                                                                                                                                                                                                                                                                                                                      | 2    |
| Punch docs                   | `README.md`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.github/**/*.md`, `.github/workflows/k6.yml`, `docs/architecture/*.md`, `docs/workflows/` → `docs/jobs/`, `k8s/README.md`, `tests/test_ci_contract.py`; create `docs/decisions/0007-job-terminology.md`; `CHANGELOG.md` (one new bullet)                                                                                                                     | 3    |
| Expresso job vocabulary      | `scripts/pg/workflows.py` → `jobs.py`; `scripts/pg/*.py`; `scripts/pg/tests/*.py` (`test_k6_workflows.py` → `test_k6_jobs.py`, `test_k8s_workflows.py` → `test_k8s_jobs.py`); `tests/performance/k6/workflows/` → `jobs/`; `infra/k8s/perf/punch/workflows/` → `jobs/`; `infra/k8s/perf/punch/*.yaml`; `infra/docker/compose.performance.yaml`; `.github/workflows/*.yml`; `bin/punch`; `./k8s`; `vendor/punch` pointer | 4    |
| Expresso workflow vocabulary | `scripts/pg/perf_chain.py` → `perf_workflow.py`; `perf_spec.py`, `perf_forms.py`, `perf_dispatch.py`, `cli.py`; `test_perf_chain.py` → `test_perf_workflow.py`; `perf-run.yml` → `perf-job.yml`; `perf-chain.yml` → `perf-workflow.yml`; `_perf-execute.yml`; `ci.yml`                                                                                                                                                  | 5    |
| Expresso docs                | living `*.md` outside the dated records (list in Task 6)                                                                                                                                                                                                                                                                                                                                                                | 6    |

---

### Task 1: Punch job schema and Python API

**Files:**

- Rename: `vendor/punch/src/punch/workflow.py` → `src/punch/job.py`; `vendor/punch/workflows/` → `jobs/`; `tests/test_workflow.py` → `tests/test_job.py`; `tests/test_workflow_coverage.py` → `tests/test_job_coverage.py`
- Modify: `vendor/punch/src/punch/*.py`, `jobs/k6/*.yaml`, `tests/fixtures/*.yaml`, `tests/test_*.py` except `test_k8s_base.py`, `test_k8s_run_script.py`, `test_ci_contract.py`

**Interfaces:**

- Produces: `punch.job` with `K6Job`, `JobError`, `load_job(path: Path) -> K6Job`, `read_k6_config`, `SummaryOutput`, `data_env_name`; `punch.catalog.JobCatalog` (attribute `jobs: Dict[str, K6Job]`, method `producers_of(dataset)` unchanged); `punch.catalog.load_catalog(dir) -> JobCatalog`; `punch.execution.execute_job(...)` (same signature as `execute_workflow`), `validate_produce`, `ExecutionResult`, `DEFAULT_DATA`; `punch.sizing` unchanged names; `punch.__main__.BUNDLED_JOB_DIR` (`jobs/k6`), `BUNDLED_JOBS`; run record key `"job"`.

- [ ] **Step 1: Prepare scratch tools and confirm the baseline**

Write Appendix A to `$T`. Create the venv if absent and run the baseline:

```bash
python3 -m venv "$SCRATCH/punch-venv" && "$SCRATCH/punch-venv/bin/pip" install -q -r vendor/punch/requirements.txt
git -C vendor/punch status --short   # must print nothing
git -C vendor/punch rev-parse --short HEAD   # 3e7141f
(cd vendor/punch && PYTHONPATH=src $PV -m unittest discover -s tests -p 'test_*.py' 2>&1 | tail -2)
```

Expected: clean tree at `3e7141f`; `Ran 322 tests`, `OK`.

- [ ] **Step 2: Rename the tests first**

```bash
cd vendor/punch
git mv tests/test_workflow.py tests/test_job.py
git mv tests/test_workflow_coverage.py tests/test_job_coverage.py
git ls-files tests | grep -E '\.(py|ya?ml)$' | grep -vE 'test_k8s_|test_ci_contract' | xargs python3 $T job
cd ../..
```

- [ ] **Step 3: Add the old-kind and run-record tests (after the pass)**

In `vendor/punch/tests/test_job.py`, class `LoadJobTests`, add:

```python
    def test_the_old_kind_names_its_replacement(self) -> None:
        self.assertJobError(
            "kind K6Workflow was renamed to K6Job; change the kind line",
            ("kind: K6Job", "kind: K6Workflow"),
        )
```

In `vendor/punch/tests/test_cli.py`, in `test_evidence_records_job_and_dataset_fields`, directly after `self.assertIn("job", result)`, add:

```python
        self.assertNotIn("workflow", result)
```

- [ ] **Step 4: Run the suite to verify it fails**

Run: `(cd vendor/punch && PYTHONPATH=src $PV -m unittest discover -s tests -p 'test_*.py' 2>&1 | grep -E "^(ImportError|ModuleNotFoundError)|^Ran|^FAILED" | head -5)`
Expected: FAILED; import errors naming `punch.job`.

- [ ] **Step 5: Rename the engine and the bundled jobs**

```bash
cd vendor/punch
git mv src/punch/workflow.py src/punch/job.py
git mv workflows jobs
git ls-files src jobs | grep -E '\.(py|ya?ml)$' | xargs python3 $T job
cd ../..
```

- [ ] **Step 6: Write the old-kind message (after the pass)**

In `vendor/punch/src/punch/job.py`, `load_job`, replace:

```python
    if _required(root, "kind", "root") != "K6Job":
        raise JobError("kind must be K6Job")
```

with:

```python
    kind = _required(root, "kind", "root")
    if kind == "K6Workflow":
        raise JobError("kind K6Workflow was renamed to K6Job; change the kind line")
    if kind != "K6Job":
        raise JobError("kind must be K6Job")
```

The loader raises its errors without a path; callers add the job name, as for every sibling error.

- [ ] **Step 7: Run the suite to verify it passes**

Run: `(cd vendor/punch && PYTHONPATH=src $PV -m unittest discover -s tests -p 'test_*.py' 2>&1 | tail -2)`
Expected: `Ran 323 tests`, `OK`.

- [ ] **Step 8: Check the CLI surface**

```bash
(cd vendor/punch && PYTHONPATH=src $PV -m punch run --help | head -8; grep -rn "workflows/k6\|BUNDLED_WORKFLOW" src)
```

Expected: help says "job" ("Run a bundled k6 job, all jobs, or a YAML path."); the grep prints nothing.

- [ ] **Step 9: Commit in Punch**

```bash
git -C vendor/punch add -A src tests jobs workflows
git -C vendor/punch commit -m "refactor(job)!: call the YAML unit a Punch job"
```

---

### Task 2: Punch Kubernetes parameter

**Files:**

- Modify: `vendor/punch/k8s/punch-k6-run.yaml`, `vendor/punch/k8s/k6-run.sh`, `vendor/punch/tests/test_k8s_base.py`, `vendor/punch/tests/test_k8s_run_script.py`

**Interfaces:**

- Consumes: Task 1 names.
- Produces: `punch-k6-run` input parameter `job` (was `workflow`), container env `PUNCH_JOB` (was `PUNCH_WORKFLOW`). Expresso's thin templates pass `job` (Task 4).

- [ ] **Step 1: Rename the Kubernetes tests and add the Argo guard**

```bash
(cd vendor/punch && python3 $T job tests/test_k8s_base.py tests/test_k8s_run_script.py)
```

Then add to class `PunchK6RunTemplateTests` in `vendor/punch/tests/test_k8s_base.py` (the module defines `K8S = Path(__file__).resolve().parents[1] / "k8s"`):

```python
    def test_argo_expressions_keep_argos_workflow_variable(self) -> None:
        text = (K8S / "punch-k6-run.yaml").read_text(encoding="utf-8")
        self.assertEqual(text.count("{{workflow."), 2)
        self.assertIn("{{inputs.parameters.job}}", text)
        self.assertNotIn("{{inputs.parameters.workflow}}", text)
```

- [ ] **Step 2: Run the Kubernetes tests to verify they fail**

Run: `(cd vendor/punch && PYTHONPATH=src $PV -m unittest discover -s tests -p 'test_k8s_*.py' 2>&1 | tail -3)`
Expected: FAILED (the template still declares `workflow`, the script still reads `PUNCH_WORKFLOW`).

- [ ] **Step 3: Rename the runtime**

```bash
(cd vendor/punch && git ls-files k8s | grep -E '\.(ya?ml|sh)$' | xargs python3 $T job)
```

The pass changes only lines 4, 32, 86, 87, 145, 199, 200 of `punch-k6-run.yaml` and lines 10, 53, 61, 75, 88, 89 of `k6-run.sh`; `rbac.yaml`, `kustomization.yaml`, `kustomizeconfig.yaml`, and `examples/` hold only Argo terms and stay unchanged.

- [ ] **Step 4: Run the suite**

Run: `(cd vendor/punch && PYTHONPATH=src $PV -m unittest discover -s tests -p 'test_*.py' 2>&1 | tail -2; git diff --stat k8s)`
Expected: `Ran 324 tests`, `OK`; only `punch-k6-run.yaml` and `k6-run.sh` changed under `k8s/`.

- [ ] **Step 5: Commit in Punch**

```bash
git -C vendor/punch add k8s tests/test_k8s_base.py tests/test_k8s_run_script.py
git -C vendor/punch commit -m "refactor(k8s)!: pass the Punch job as parameter job"
```

---

### Task 3: Punch docs, decision record, and the single Punch commit

**Files:**

- Rename: `vendor/punch/docs/workflows/` → `docs/jobs/`
- Modify: `README.md`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/copilot-instructions.md`, `.github/instructions/*.md`, `.github/workflows/k6.yml`, `docs/architecture/*.md`, `docs/jobs/validation.md`, `k8s/README.md`, `tests/test_ci_contract.py`, `CHANGELOG.md`
- Create: `vendor/punch/docs/decisions/0007-job-terminology.md`

**Interfaces:**

- Consumes: Tasks 1 and 2 (names, parameter `job`, `jobs/k6/`).
- Produces: one Punch commit `PUNCH_SHA` that Task 4 pins.

- [ ] **Step 1: Run the job pass on the living docs and the pinned-phrase test**

```bash
cd vendor/punch
git mv docs/workflows docs/jobs
printf '%s\n' README.md CLAUDE.md AGENTS.md CONTRIBUTING.md .github/PULL_REQUEST_TEMPLATE.md .github/copilot-instructions.md .github/workflows/k6.yml k8s/README.md \
  | cat - <(git ls-files .github/instructions docs/architecture docs/jobs) | xargs python3 $T job --docs
python3 $T job tests/test_ci_contract.py
cd ../..
```

`test_ci_contract.py` now pins "Consumer repositories own job YAML and k6 scripts." in `.github/instructions/punch-architecture.instructions.md` and `docs/architecture/punch-boundaries.md`, which the doc pass changed to match; its `.github/workflows/k6.yml` variable stays `workflow` (masked).

- [ ] **Step 2: Read every changed doc line**

Run: `git -C vendor/punch diff --word-diff -- '*.md' .github/workflows/k6.yml`

For each change, keep it when the old word meant one Punch YAML unit; restore the original when it meant a GitHub workflow, an Argo workflow (a run, a resource, or `workflow parameters`), or a process. Then apply the wording rule from the spec: "Punch job" at a document's first mention, "job" after.

- [ ] **Step 3: Rename the sequence sense by hand**

Punch's own code uses "chain" for the consumer-to-producer picker switch; leave that sense alone. In the docs, find the sequence sense:

Run: `git -C vendor/punch grep -n -iE "chain|sequence of" -- README.md CLAUDE.md AGENTS.md docs/architecture k8s/README.md`

Rewrite each line where "chain" means jobs run in order: "a chain of them" → "a Punch workflow"; "single runs and chains" → "single jobs and workflows"; the table row `| Chain | Punch jobs linked by datasets, …` → `| Punch workflow | Punch jobs linked by datasets, …`; "thin (one Punch job) or chain" → "thin (one Punch job) or workflow". Rename headings consistently with their anchors: `## Chain jobs through datasets` → `## Run a Punch workflow through datasets`, and update `#chain-jobs-through-datasets` links to `#run-a-punch-workflow-through-datasets`.

- [ ] **Step 4: Write ADR 0007**

Create `vendor/punch/docs/decisions/0007-job-terminology.md`:

```markdown
# ADR 0007: Punch jobs and Punch workflows

- Status: Accepted
- Date: 2026-10-18

## Context

"Workflow" named a Punch YAML unit, a GitHub workflow, an Argo Workflow, and a
consumer's ordered sequence of runs. On Kubernetes an Argo `WorkflowTemplate`
passed a `workflow` parameter that meant a Punch YAML unit, so a reader had to
infer the sense on almost every line.

## Decision

The YAML unit is a **Punch job**: `apiVersion: punch/v1`, `kind: K6Job`. The
engine module is `punch.job` (`K6Job`, `JobError`, `load_job`), the catalog is
`JobCatalog`, execution is `execute_job`, bundled jobs live in `jobs/k6/`, the
run record names the YAML in `"job"`, and `punch-k6-run` takes the parameter
`job`. An ordered sequence of Punch jobs is a **Punch workflow**; a **step** is
a job's position in it. Consumers own Punch workflows today.

There are no aliases. A file with `kind: K6Workflow` fails with
`kind K6Workflow was renamed to K6Job; change the kind line`.

## Consequences

- Every consumer changes its job files' `kind` and its imports in one step.
- "Job" also names a GitHub job; documents qualify "GitHub job" wherever both
  appear.
- ADR 0005 and the dated specs keep the old term.
```

- [ ] **Step 5: Add the changelog bullet**

In `vendor/punch/CHANGELOG.md`, under `## [Unreleased]` → `### Changed`, insert as the first bullet:

```markdown
- **Breaking:** the YAML unit is a Punch job: `kind: K6Job` (`apiVersion`
  stays `punch/v1`), `punch.job` (`K6Job`, `JobError`, `load_job`),
  `punch.catalog.JobCatalog`, `punch.execution.execute_job`, bundled jobs in
  `jobs/k6/`, the run record key `"job"`, and the `punch-k6-run` parameter
  `job`. A `kind: K6Workflow` file fails with `kind K6Workflow was renamed to
K6Job; change the kind line`. See ADR 0007.
```

- [ ] **Step 6: Punch grep gate**

```bash
cd vendor/punch
git grep -n -iE "workflow" -- . ':!docs/specs' ':!docs/decisions/000[1-6]*' ':!CHANGELOG.md' \
  | grep -vE "\{\{ *workflow\.|workflowTemplateRef|WorkflowTemplate|[Ww]orkflow[Tt]ask[Rr]esults|workflows\.argoproj|workflow-controller|[Aa]rgo[ _-][Ww]orkflow|\.github/workflows|github-workflows|GitHub (Actions )?[Ww]orkflow|workflow_template|workflow = yaml|workflow\[\"jobs\"\]|\bWorkflows?\b|(get|patch|create|delete|describe) workflow|workflow parameters|K6Workflow was renamed|kind: K6Workflow|ADR 0005|0005-workflow-yaml-runtime"
cd ../..
```

Expected: no output, or only lines you can justify as GitHub, Argo, or generic sense (fix any Punch-sense line and re-run).

- [ ] **Step 7: Run the suite, then squash Punch into one commit**

```bash
(cd vendor/punch && PYTHONPATH=src $PV -m unittest discover -s tests -p 'test_*.py' 2>&1 | tail -2)
git -C vendor/punch add -A
git -C vendor/punch commit -m "docs(job): call the YAML unit a Punch job in the docs; ADR 0007"
git -C vendor/punch reset --soft 3e7141f
git -C vendor/punch commit -F - <<'EOF'
refactor(job)!: call the YAML unit a Punch job

A Punch job is one YAML unit (apiVersion punch/v1, kind K6Job); a Punch
workflow is an ordered sequence of jobs. Renames punch.workflow to
punch.job (K6Job, JobError, load_job), WorkflowCatalog to JobCatalog,
execute_workflow to execute_job, workflows/k6/ to jobs/k6/, the run
record key "workflow" to "job", and the punch-k6-run parameter and env
to job and PUNCH_JOB. A kind K6Workflow file fails with a message that
names K6Job. ADR 0007 records the terms.
EOF
git -C vendor/punch log --oneline -2
```

Expected: `Ran 324 tests`, `OK`; exactly one commit on top of `3e7141f`. Record its short SHA as `PUNCH_SHA`. Do not push yet (Task 8).

---

### Task 4: Expresso pointer bump and job vocabulary in code

**Files:**

- Rename: `scripts/pg/workflows.py` → `scripts/pg/jobs.py`; `scripts/pg/tests/test_k6_workflows.py` → `test_k6_jobs.py`; `scripts/pg/tests/test_k8s_workflows.py` → `test_k8s_jobs.py`; `tests/performance/k6/workflows/` → `tests/performance/k6/jobs/`; `infra/k8s/perf/punch/workflows/` → `infra/k8s/perf/punch/jobs/`
- Modify (script): every tracked non-Markdown file under `scripts/pg`, `tests/performance/k6`, `infra/k8s/perf`, `infra/docker`, `.github/workflows`, `bin`, except `scripts/pg/k8s_perf.py` and `scripts/pg/tests/test_k8s_perf.py`
- Modify (by hand): `scripts/pg/k8s_perf.py`, `scripts/pg/tests/test_k8s_perf.py`, `k8s`
- Modify: `vendor/punch` (gitlink → `PUNCH_SHA`)

**Interfaces:**

- Consumes: Punch `PUNCH_SHA` names (Task 1), parameter `job` (Task 2).
- Produces: `pg.jobs.JOBS: Dict[str, int]`; `pg.paths.PERF_JOBS_DIR`; `pg.k8s_perf.run_job(name, args) -> int`; `catalog.jobs` used everywhere `catalog.workflows` was; perf-run form input `job` and marker block `jobs`; `perf_forms.option_blocks` keys `jobs`, `recipes`, `profiles` (Task 5 renames `recipes`).

- [ ] **Step 1: Rename the tests first**

```bash
git mv scripts/pg/tests/test_k6_workflows.py scripts/pg/tests/test_k6_jobs.py
git mv scripts/pg/tests/test_k8s_workflows.py scripts/pg/tests/test_k8s_jobs.py
git ls-files scripts/pg/tests | grep '\.py$' | grep -v test_k8s_perf.py | xargs python3 $T job
```

In `scripts/pg/tests/test_k8s_perf.py`, change exactly these (the other "workflow" words there are Argo runs and stay):

- `@mock.patch("pg.k8s_perf.run_workflow", return_value=0)` → `@mock.patch("pg.k8s_perf.run_job", return_value=0)`
- `def test_perf_run_routes_k8s_to_argo(self, run_workflow) -> None:` → `(self, run_job)`
- `run_workflow.assert_called_once_with(` → `run_job.assert_called_once_with(`
- `class RunWorkflowGuardTests(` → `class RunJobGuardTests(`
- both `k8s_perf.run_workflow(` calls → `k8s_perf.run_job(`
- `from pg.paths import … PERF_WORKFLOWS_DIR …` (if present) → `PERF_JOBS_DIR`

Add to `scripts/pg/tests/test_k8s_perf.py`:

```python
class ArgoResourceTests(unittest.TestCase):
    @mock.patch("pg.k8s_perf.subprocess.run")
    def test_phase_queries_argos_workflow_resource(self, run) -> None:
        run.return_value = mock.Mock(stdout="Running\n")
        self.assertEqual(k8s_perf._phase("run-1"), "Running")
        args = run.call_args[0][0]
        self.assertIn("workflow", args)
        self.assertNotIn("job", args)
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | grep -E "^(ImportError|ModuleNotFoundError)|^Ran|^FAILED" | head -5)`
Expected: FAILED; import errors for `pg.jobs` and `PERF_JOBS_DIR`.

- [ ] **Step 3: Move the files and run the job pass on code and config**

```bash
git mv scripts/pg/workflows.py scripts/pg/jobs.py
git mv tests/performance/k6/workflows tests/performance/k6/jobs
git mv infra/k8s/perf/punch/workflows infra/k8s/perf/punch/jobs
git ls-files scripts/pg tests/performance/k6 infra/k8s/perf infra/docker .github/workflows bin \
  | grep -vE '\.md$|/tests/|k8s_perf\.py$|\.(png|jpg|ico)$' | xargs python3 $T job
```

Scenario `.ts` files change only in comments; the job YAML files change their `kind` line; the nine thin templates change their header comment and `- { name: job, value: <id> }`.

- [ ] **Step 4: Hand-edit the two Argo-mixed files**

`scripts/pg/k8s_perf.py`, change only these lines (Argo-run lines 156, 164, 196, 197, 215, 239, 267, 279, 286, 317, 333 stay):

| Line | Old                                                                  | New                                                             |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| 6    | `run one workflow by id.`                                            | `run one job by id.`                                            |
| 22   | `PERF_WORKFLOWS_DIR`                                                 | `PERF_JOBS_DIR`                                                 |
| 105  | `info(f"Run a workflow: {bold(`                                      | `info(f"Run a job: {bold(`                                      |
| 116  | `(default: the workflow's).`                                         | `(default: the job's).`                                         |
| 291  | `def run_workflow(name: str, args: Sequence[str]) -> int:`           | `def run_job(name: str, args: Sequence[str]) -> int:`           |
| 292  | `"""Run one repository workflow on Argo Workflows and follow it."""` | `"""Run one repository job on Argo Workflows and follow it."""` |
| 297  | `from punch.workflow import load_workflow`                           | `from punch.job import load_job`                                |
| 299  | `workflow = load_workflow(PERF_WORKFLOWS_DIR / f"{name}.yaml")`      | `job = load_job(PERF_JOBS_DIR / f"{name}.yaml")`                |
| 300  | `produce = validate_produce(workflow, parsed.produce)`               | `produce = validate_produce(job, parsed.produce)`               |
| 302  | `extra_env(workflow.forward_environment, os.environ)`                | `extra_env(job.forward_environment, os.environ)`                |
| 304  | `Could not prepare k8s workflow {name}`                              | `Could not prepare k8s job {name}`                              |

Any further reference to that local `workflow` variable inside `run_job` becomes `job`; `workflow_manifest`, `run_result(workflow)`, and every `punch("get"|"patch", "workflow", …)` stay.

`k8s` (repository root script), change only:

| Line | Old                                                         | New                                                    |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------ |
| 8    | `# workflow runs, the POC verification, and evidence.`      | `# job runs, the POC verification, and evidence.`      |
| 351  | `./k8s run <workflow> [--config PRESET]`                    | `./k8s run <job> [--config PRESET]`                    |
| 373  | `die "no workflow '$id' in namespace punch`                 | `die "no job '$id' in namespace punch`                 |
| 599  | `run <workflow> [opts]     run one workflow and follow it;` | `run <job> [opts]          run one job and follow it;` |

Line 7 (`# Workflows, SeaweedFS…`, the second half of "Argo Workflows") and every `kc -n punch get|patch workflow` stay.

- [ ] **Step 5: Bump the pointer and run everything**

```bash
git -C vendor/punch rev-parse --short HEAD   # PUNCH_SHA from Task 3
(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -2)
uvx ruff@0.7.4 check scripts/pg
./dev perf:forms --check
bash -n k8s && git diff --stat -- infra/k8s
```

Expected: `OK` (254 plus `test_phase_queries_argos_workflow_resource`); ruff clean; `The perf forms match the catalog and custom configs.` with `6 standalone jobs` wording in the next line; `bash -n` silent.

- [ ] **Step 6: Commit**

```bash
git add -A scripts/pg tests/performance/k6 infra/k8s infra/docker .github/workflows bin k8s vendor/punch
git commit -m "refactor(perf): adopt Punch jobs in code and config"
```

---

### Task 5: Punch workflow vocabulary, spec version 2, and the forms

**Files:**

- Rename: `scripts/pg/perf_chain.py` → `perf_workflow.py`; `scripts/pg/tests/test_perf_chain.py` → `test_perf_workflow.py`; `.github/workflows/perf-run.yml` → `perf-job.yml`; `.github/workflows/perf-chain.yml` → `perf-workflow.yml`
- Modify (script, `workflow` pass): every tracked non-Markdown file under `scripts/pg`, `.github/workflows`, `infra/k8s/perf`
- Modify (by hand): `scripts/pg/perf_spec.py`, `perf_workflow.py`, `perf_dispatch.py`, `cli.py`, `perf-job.yml`, `perf-workflow.yml`, `_perf-execute.yml`, and their tests

**Interfaces:**

- Consumes: Task 4 names.
- Produces: `pg.perf_workflow.plan_workflow(entries, catalog, options_dir=PERF_OPTIONS_DIR) -> Plan`, `run_workflow(plan, reports_dir=WORKFLOW_REPORTS_DIR) -> int`, `WORKFLOW_REPORTS_DIR = PERF_REPORTS_DIR / "workflow"`, evidence file `workflow.json` with top-level `"jobs"` and per-step `"job"`; `pg.perf_spec.SPEC_VERSION = 2`; `pg.perf_forms.workflows(catalog, options_dir)`, `workflow_label(path)`, `WORKFLOW_SEPARATOR = " -> "`, blocks `jobs`, `workflows`, `profiles`; `pg.perf_dispatch.KINDS = ("job", "workflow")`; `./dev perf:workflow`.

- [ ] **Step 1: Move the files and run the workflow pass**

```bash
git mv scripts/pg/perf_chain.py scripts/pg/perf_workflow.py
git mv scripts/pg/tests/test_perf_chain.py scripts/pg/tests/test_perf_workflow.py
git mv .github/workflows/perf-run.yml .github/workflows/perf-job.yml
git mv .github/workflows/perf-chain.yml .github/workflows/perf-workflow.yml
git ls-files scripts/pg .github/workflows infra/k8s/perf | grep -vE '\.md$|\.(png|jpg|ico)$' | xargs python3 $T workflow
```

Then rename the evidence key and the remaining `single` kind by hand:

```bash
grep -rln '"sequence"' scripts/pg | xargs sed -i '' 's/"sequence"/"jobs"/g'
sed -i '' 's/"single"/"job"/g; s/_single(/_job(/g; s/use single or workflow/use job or workflow/g' \
  scripts/pg/perf_dispatch.py scripts/pg/tests/test_perf_dispatch.py scripts/pg/tests/test_perf_github_workflows.py
sed -i '' 's/kind: single/kind: job/' .github/workflows/perf-job.yml
grep -rn '"sequence"\|"single"\|_single(' scripts/pg .github/workflows   # must print nothing
```

- [ ] **Step 2: Fix the form titles, run names, and descriptions**

In `.github/workflows/perf-job.yml`: `name: Punch performance — single` → `name: Punch performance — job`; the job display name `name: Punch run` → `name: Punch job`. Check `run-name: "perf-job: ${{ inputs.job }} (${{ inputs.profile }}) by @${{ github.actor }}"` (the pass wrote it).

In `.github/workflows/_perf-execute.yml`: `description: single or workflow` → `description: job or workflow`; `description: The job (single) or workflow label (workflow)` → `description: The job name (job) or workflow label (workflow)`.

In `scripts/pg/tests/test_perf_github_workflows.py`, make the form tests load `perf-job.yml` and `perf-workflow.yml` (the pass rewrote the names) and add:

```python
    def test_the_old_form_files_are_gone(self) -> None:
        for name in ("perf.yml", "perf-run.yml", "perf-chain.yml"):
            with self.subTest(name=name):
                self.assertFalse((WORKFLOWS / name).exists())

    def test_form_titles_and_run_names_use_the_new_terms(self) -> None:
        job, workflow = load("perf-job.yml"), load("perf-workflow.yml")
        self.assertEqual(job["name"], "Punch performance — job")
        self.assertEqual(workflow["name"], "Punch performance — workflow")
        self.assertTrue(job["run-name"].startswith("perf-job: "))
        self.assertTrue(workflow["run-name"].startswith("perf-workflow: "))
        self.assertEqual(job["jobs"]["run"]["with"]["kind"], "job")
        self.assertEqual(workflow["jobs"]["run"]["with"]["kind"], "workflow")
```

- [ ] **Step 3: Write the old-name tests (after the pass)**

In `scripts/pg/tests/test_perf_spec.py`, class `SpecDocumentTests`, add:

```python
    def test_a_version_1_spec_names_the_rename(self) -> None:
        document = {"version": 1, "steps": [{"workflow": "http-cart", "load": {"mode": "auto"}}]}
        with self.assertRaises(SpecError) as caught:
            parse_spec(document)
        self.assertEqual(
            str(caught.exception),
            'spec version 1 is no longer read: set "version": 2 and rename each '
            'step\'s "workflow" to "job"',
        )

    def test_a_version_2_spec_names_each_step_job(self) -> None:
        self.assertEqual(
            spec_document([StepRequest("http-cart")]),
            {"version": 2, "steps": [{"job": "http-cart", "load": {"mode": "auto"}}]},
        )
```

In `scripts/pg/tests/test_perf_workflow.py`, change `from pg import perf_workflow  # noqa: E402` to `from pg import cli, perf_workflow  # noqa: E402` (the module already imports `json`, `StringIO`, `Path`, `TemporaryDirectory`, `patch`, `parse_steps`, `plan_workflow`, `write_evidence`, and defines `CATALOG`), then add:

```python
class RenamedCommandTests(unittest.TestCase):
    def test_perf_chain_names_its_replacement(self) -> None:
        out = StringIO()
        with patch("sys.stdout", out), patch("sys.stderr", out):
            self.assertEqual(cli.main(["perf:chain", "http-cart"]), 1)
        self.assertIn("perf:chain was renamed to perf:workflow", out.getvalue())
        self.assertIn("perf:workflow", cli.COMMANDS)
        self.assertNotIn("perf:chain", cli.COMMANDS)

    def test_workflow_evidence_names_its_jobs(self) -> None:
        with TemporaryDirectory() as temporary:
            write_evidence(plan_workflow(parse_steps(["http-cart"]), CATALOG), None, Path(temporary))
            evidence = json.loads((Path(temporary) / "workflow.json").read_text(encoding="utf-8"))
        self.assertEqual(evidence["jobs"], ["http-cart"])
        self.assertNotIn("sequence", evidence)
        self.assertEqual([step["job"] for step in evidence["steps"]], ["http-cart"])
```

If `write_evidence` writes a file name other than `workflow.json` after the pass, the pass missed it: fix `perf_workflow.py` so the file is `workflow.json` (it was `chain.json`).

- [ ] **Step 4: Run the suite to verify the new tests fail**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | grep -E "^FAIL:|^ERROR:|^Ran|^FAILED")`
Expected: FAILED on exactly `test_a_version_1_spec_names_the_rename`, `test_a_version_2_spec_names_each_step_job`, and `test_perf_chain_names_its_replacement` (and any form-title test whose YAML Step 2 did not yet cover); everything else passes.

- [ ] **Step 5: Implement spec version 2 and the renamed command**

In `scripts/pg/perf_spec.py`: set `SPEC_VERSION = 2`, and in `parse_spec` replace:

```python
    if document.get("version") != SPEC_VERSION:
        raise SpecError(f"spec version must be {SPEC_VERSION}")
```

with:

```python
    version = document.get("version")
    if version == 1:
        raise SpecError(
            'spec version 1 is no longer read: set "version": 2 and rename each '
            'step\'s "workflow" to "job"'
        )
    if version != SPEC_VERSION:
        raise SpecError(f"spec version must be {SPEC_VERSION}")
```

In `scripts/pg/cli.py`: change `from pg.ansi import bold, dim` to `from pg.ansi import bold, dim, fail`; after `COMMANDS`, add:

```python
# Old command names that fail with their replacement instead of the usage text.
RENAMED: Dict[str, str] = {"perf:chain": "perf:workflow"}
```

and in `main`, replace:

```python
    handler = COMMANDS.get(command)
    if not handler:
        _usage()
        return 1
```

with:

```python
    handler = COMMANDS.get(command)
    if not handler:
        if command in RENAMED:
            fail(f"{command} was renamed to {RENAMED[command]}")
            return 1
        _usage()
        return 1
```

- [ ] **Step 6: Regenerate the forms and run everything**

```bash
./dev perf:forms --write && ./dev perf:forms --check
(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -2)
uvx ruff@0.7.4 check scripts/pg
./dev perf:chain http-cart; echo "exit $?"
npx --no-install prettier --check .github/workflows/perf-job.yml .github/workflows/perf-workflow.yml .github/workflows/_perf-execute.yml
```

Expected: forms unchanged by `--write` (the passes already renamed the marker blocks to `jobs` and `workflows`) or rewritten once, then `--check` passes with `6 standalone jobs, 9 workflows.` and the five profiles; suite `OK`; ruff clean; `✗ perf:chain was renamed to perf:workflow` and `exit 1`; Prettier clean.

- [ ] **Step 7: Commit**

```bash
git add -A scripts/pg .github/workflows infra/k8s/perf
git commit -m "refactor(perf)!: call a sequence of Punch jobs a Punch workflow"
```

---

### Task 6: Expresso docs

**Files:**

- Modify: `CLAUDE.md`, `README.md`, `docs/README.md`, `docs/cli-reference.md`, `docs/coverage.md`, `docs/findings.md`, `docs/local-development.md`, `docs/unknowns.md`, `docs/lifecycle/README.md`, `docs/architecture/{orchestrator-python,processes,punch-implementation}.md`, `docs/performance/{orchestrator,k8s-runtime,validation}.md`, `docs/reference/{README,build-and-deploy,configuration,data-and-state,integrations}.md`, `docs/project-state/{current-system,visualizer-domain-certification}.md`, `docs/next-steps/{README,perf-run-ux,punch-k8s,hot-status,sizing-duration-targets,uat-remediation}.md`, `docs/uat/{web-app-uat,walkthrough-uat}.md`, `tests/performance/k6/README.md`, `apps/visualizer-3d/README.md`, `infra/k8s/README.md`
- Test: `scripts/pg/tests/test_perf_ci_docs_contract.py`
- Not touched: `docs/superpowers/`, `docs/specs/`, `docs/adr/`, `use-cases/`, `apps/visualizer-3d/public/`

**Interfaces:**

- Consumes: every name from Tasks 1 to 5.
- Produces: heading `## GitHub Actions (`perf-job`and`perf-workflow`)` in `docs/performance/orchestrator.md`, anchor `#github-actions-perf-job-and-perf-workflow`.

- [ ] **Step 1: Write the anchor test**

Add to `scripts/pg/tests/test_perf_ci_docs_contract.py`:

```python
    def test_every_orchestrator_anchor_link_resolves(self) -> None:
        doc = (REPO_ROOT / "docs/performance/orchestrator.md").read_text(encoding="utf-8")
        anchors = {
            re.sub(r"[^\w\- ]", "", heading.strip().lower()).replace(" ", "-")
            for heading in re.findall(r"^#{2,4} (.+)$", doc, re.MULTILINE)
        }
        sources = ["CLAUDE.md", "docs/cli-reference.md", "tests/performance/k6/README.md",
                   ".github/workflows/perf-job.yml", ".github/workflows/perf-workflow.yml",
                   ".github/workflows/_perf-execute.yml"]
        for source in sources:
            text = (REPO_ROOT / source).read_text(encoding="utf-8")
            for anchor in re.findall(r"orchestrator\.md#([\w\-]+)", text):
                with self.subTest(source=source, anchor=anchor):
                    self.assertIn(anchor, anchors)
```

Add `import re` to the module if absent.

- [ ] **Step 2: Run it to verify it fails**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_perf_ci_docs_contract.py' 2>&1 | grep -E "^FAIL|^Ran|^OK|anchor=")`
Expected: FAIL for `github-actions-perf-job-and-perf-workflow` (the forms link the new anchor; the heading still says `perf-run` and `perf-chain`).

- [ ] **Step 3: Run both passes on the docs**

```bash
printf '%s\n' CLAUDE.md README.md docs/README.md docs/cli-reference.md docs/coverage.md docs/findings.md \
  docs/local-development.md docs/unknowns.md docs/lifecycle/README.md tests/performance/k6/README.md \
  apps/visualizer-3d/README.md infra/k8s/README.md \
  | cat - <(git ls-files docs/architecture docs/performance docs/reference docs/project-state docs/next-steps docs/uat | grep '\.md$') \
  > "$SCRATCH/docs.txt"
xargs python3 $T job --docs < "$SCRATCH/docs.txt"
xargs python3 $T workflow --docs < "$SCRATCH/docs.txt"
```

- [ ] **Step 4: Read every changed line and fix the senses**

Run: `git diff --word-diff -- $(tr '\n' ' ' < "$SCRATCH/docs.txt")` (in zsh: `git diff --word-diff -- ${(f)"$(cat $SCRATCH/docs.txt)"}`).

For each change:

- Keep it when the old word meant one Punch YAML unit (→ job) or a sequence of jobs (→ workflow).
- Restore the original when it meant a GitHub workflow, an Argo run or resource, a business workflow, a process, or a non-sequence "chain" (for example a dependency or tool chain).
- Rewrite "sequence" in the chain sense to "workflow" by hand (the script does not touch "sequence").
- Apply the wording rule: "Punch job" at a document's first mention; qualify "GitHub job" or "GitHub workflow" wherever they appear near Punch terms.
- Dated measurement rows keep their wording where they quote what ran at a pinned commit (for example `perf-run-ux.md`'s 2026-10-17 tables name `perf-run` runs at `a8f7460`); only the surrounding prose changes.

Specific edits the passes cannot make:

- `docs/performance/orchestrator.md`: heading `## GitHub Actions (`perf-run`and`perf-chain`)` → `## GitHub Actions (`perf-job`and`perf-workflow`)`; the form table titles `Punch performance — single`/`— chain` → `— job`/`— workflow`; `request.json` kind values `single`/`chain` → `job`/`workflow`; evidence paths `reports/chain/chain.json` → `reports/workflow/workflow.json` and keys (`"sequence"` → `"jobs"`); spec examples to `"version": 2` and `"job"`.
- `docs/cli-reference.md`: the `perf:chain` rows become `perf:workflow` rows; add one sentence that `perf:chain` exits 1 naming `perf:workflow`; the command count stays 33. Leave the pin line for Task 8.
- `CLAUDE.md`: the `./dev perf:chain …` bullets become `./dev perf:workflow …`; the anchor becomes `#github-actions-perf-job-and-perf-workflow`; `## Next-steps workflow` stays.
- `docs/next-steps/perf-run-ux.md`: the file name stays (it is a topic name, linked from `docs/next-steps/README.md`); its descriptive sections follow the new names.

- [ ] **Step 5: Format and run the doc checks**

```bash
xargs npx --no-install prettier --check < "$SCRATCH/docs.txt" 2>&1 | tail -3
(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -2)
git diff -U0 | grep '^+' | grep -E '—|–| -- ' | grep -v 'Punch performance —'
```

Expected: every file Prettier-clean except `docs/performance/orchestrator.md`, whose only differences stay in the sections it already failed before this work (lines 91 to 156 before the change); suite `OK` including `test_every_orchestrator_anchor_link_resolves`; no new dashes. For any other file that was Prettier-clean before and is not now, run `npx --no-install prettier --write <file>`.

- [ ] **Step 6: Commit**

```bash
git add -A $(tr '\n' ' ' < "$SCRATCH/docs.txt") scripts/pg/tests/test_perf_ci_docs_contract.py
git commit -m "docs(perf): call the YAML unit a Punch job and a sequence a Punch workflow"
```

---

### Task 7: Grep gate and local verification

**Files:** none, unless a check finds a defect (fix it in the owning task's files with a test, and commit).

- [ ] **Step 1: Expresso grep gate**

```bash
git grep -n -iE "workflow|\bchain|recipe|perf-run\b|perf-run\.yml|perf-chain" -- . \
  ':!vendor' ':!docs/superpowers' ':!docs/specs' ':!docs/adr' ':!use-cases' ':!apps/visualizer-3d/public' \
  | grep -vE "\{\{ *workflow\.|workflowTemplateRef|WorkflowTemplate|[Ww]orkflow[Tt]ask[Rr]esults|workflows\.argoproj|workflow-controller|[Aa]rgo[ _-][Ww]orkflow|\.github/workflows|GitHub (Actions )?[Ww]orkflow|workflow_dispatch|workflow_call|test_perf_github_workflows|workflow-traffic|[Nn]ext-steps workflow|[Ff]ull workflow|\bWorkflows?\b|(get|patch|create|delete|describe) workflow|workflow_manifest|run_result\(workflow|\"workflow\", run|perf-run-ux|Punch workflow|perf:workflow|perf_workflow|plan_workflow|run_workflow|WORKFLOW_REPORTS_DIR|reports/workflow|workflow\.json|perf-workflow|_perf_workflow|workflow_label|WORKFLOW_SEPARATOR|workflows\(|\"workflows\"|kind: workflow|inputs\.workflow|perf:chain was renamed|\"perf:chain\"|spec version 1 is no longer read|rename each step"
```

Read every remaining line. Each one must be the new Punch-workflow sense (a sequence of jobs) written with a form the allowlist misses, or one of the protected senses. Fix any line where "workflow" still means one job, or "chain"/"recipe" still means a sequence.

- [ ] **Step 2: Local runs on Docker**

Requires Docker Desktop and no running stack (`docker ps -q` empty).

```bash
./dev up
docker compose -f infra/docker/compose.performance.yaml build k6
chmod a+w tests/performance/k6/reports
./dev perf:http-purchase --config 1-iteration; echo "purchase $?"
./dev perf:workflow http-cart http-orders http-orders-status:1-iteration; echo "workflow $?"
ls tests/performance/k6/reports/workflow/; python3 -c "import json; d=json.load(open('tests/performance/k6/reports/workflow/workflow.json')); print(d['jobs'], [s['job'] for s in d['steps']])"
./dev down
```

Expected: both exit 0; `workflow.json` and `summary.md` exist; prints `['http-cart', 'http-orders', 'http-orders-status']` twice.

- [ ] **Step 3: The three old-name messages**

```bash
printf 'apiVersion: punch/v1\nkind: K6Workflow\nmetadata:\n  name: old\nspec: {}\n' > "$SCRATCH/old.yaml"
(cd vendor/punch && PYTHONPATH=src $PV -c "from punch.job import load_job; load_job('$SCRATCH/old.yaml')" 2>&1 | tail -1)
echo '{"version": 1, "steps": [{"workflow": "http-cart", "load": {"mode": "auto"}}]}' > "$SCRATCH/v1.json"
./dev perf:workflow --spec "$SCRATCH/v1.json" --plan; echo "exit $?"
./dev perf:chain http-cart; echo "exit $?"
```

Expected, in order: `punch.job.JobError: kind K6Workflow was renamed to K6Job; change the kind line`; the spec version 1 message and a non-zero exit; `perf:chain was renamed to perf:workflow` and `exit 1`.

- [ ] **Step 4: Kubernetes on minikube**

Requires minikube. This builds images and takes several minutes.

```bash
./k8s up && ./k8s perf:up && ./k8s verify; echo "verify $?"
```

Expected: `verify 0` (cart → orders → status through S3 with the `job` Argo parameter). Then `./k8s down`.

- [ ] **Step 5: Full gate**

```bash
(cd vendor/punch && PYTHONPATH=src $PV -m unittest discover -s tests -p 'test_*.py' 2>&1 | tail -2)
(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -2)
uvx ruff@0.7.4 check scripts/pg
./dev perf:forms --check
git status --short; git -C vendor/punch status --short
```

Expected: both suites `OK`; ruff clean; forms match; both trees clean.

---

### Task 8: One Expresso commit, review, and release

**Ask the user before each outward action in this task.**

- [ ] **Step 1: Squash the Expresso task commits into one**

The branch holds the spec commit `9c001ab`, the plan commit, and Tasks 4 to 6 (plus any Task 7 fixes). Keep the spec and plan commits; squash the rest:

```bash
PLAN=$(git log --format=%h -1 -- docs/superpowers/plans/2026-10-18-punch-job-terminology.md)
git reset --soft "$PLAN"
git commit -F - <<'EOF'
refactor(perf)!: call the YAML unit a Punch job and a sequence a Punch workflow

Bumps vendor/punch to the Punch job rename (kind K6Job, punch.job,
JobCatalog, parameter job). Job YAML moves to tests/performance/k6/jobs/
and the thin templates to infra/k8s/perf/punch/jobs/. perf:chain becomes
perf:workflow (the old name fails naming the new one), perf_chain.py
becomes perf_workflow.py, evidence moves to reports/workflow/workflow.json
with "jobs" and per-step "job", spec.json becomes version 2 with
steps[].job (version 1 fails naming the rename), and the GitHub forms
become perf-job.yml and perf-workflow.yml with kinds job and workflow.
EOF
git log --oneline -3
```

- [ ] **Step 2: Whole-branch review**

Request a fresh review (superpowers:requesting-code-review) of `main..HEAD` in Expresso and `3e7141f..PUNCH_SHA` in Punch, with the spec, this plan, and the Review Focus list. Fix Critical and Important findings test-first; amend Punch fixes into `PUNCH_SHA` (`git -C vendor/punch commit --amend`), re-bump the pointer, and amend the Expresso commit. Re-run Task 7 Step 5.

- [ ] **Step 3: Re-pin the CLI reference**

A commit cannot name its own SHA. After the squashed commit exists, set `docs/cli-reference.md`'s `> Status: Reviewed against HEAD <sha7>.` and `pinned to commit \`<sha40>\``to that commit, and commit it alone:`docs(cli): pin the CLI reference to the Punch job rename`.

- [ ] **Step 4: With the user's OK, push Punch, then Expresso**

```bash
git -C vendor/punch push origin main
git push -u origin feat/punch-job-terminology
```

Punch first: Expresso CI checks out the submodule SHA and fails if it is not on Punch's remote.

- [ ] **Step 5: With the user's OK, merge and watch CI**

```bash
git switch main && git merge --no-ff feat/punch-job-terminology -m "Merge branch 'feat/punch-job-terminology'"
git push origin main
gh run watch "$(gh run list --workflow ci.yml --branch main --limit 1 --json databaseId -q '.[0].databaseId')"
```

Expected: CI green, including `perf-smoke` running `./dev perf:workflow`. If Argo CD syncs this repository to a running cluster, it picks up the `job` parameter for both the template and the thin templates from the same commit.

- [ ] **Step 6: With the user's OK, verify the forms on GitHub**

```bash
gh workflow run perf-job.yml -f job=http-purchase -f profile="1 journey"
gh workflow run perf-workflow.yml -f workflow="http-cart -> http-orders -> http-orders-status" -f target-profile="Custom: custom/status-regression.json"
```

Watch both, download their artifacts, and confirm: each passes; `dispatch/request.json` has `kind` `job` or `workflow`; `dispatch/spec.json` has `"version": 2` and `"job"` keys; `reports/workflow/workflow.json` exists with `"jobs"`; apart from `chain/` → `workflow/`, the file tree matches the `4329fc9` runs (39091460363, 39091799205).

- [ ] **Step 7: Record and remember**

Add the two runs to `docs/next-steps/perf-run-ux.md`'s measured tables with the merge SHA, commit `docs(next-steps): record the Punch job forms' GitHub verification`, and, with the user's OK, push. Update the project memory files that name workflows, chains, `perf:chain`, or the old forms.

---

## Appendix A: `rename_terms.py`

Save as `$SCRATCH/rename_terms.py`. It is a tool for this change, not committed code.

```python
#!/usr/bin/env python3
"""Rename the Punch vocabulary in the given files.

usage: rename_terms.py job|workflow [--check] [--docs] FILE...

  job       Punch-sense "workflow" (one YAML unit) becomes "job".
  workflow  Expresso's chain and recipe vocabulary becomes "workflow".
            Run it only on files that already passed "job".
  --check   print each line that would change, as path:line: old => new,
            and change nothing.
  --docs    also protect prose forms of Argo's resource: a capitalized
            "Workflow", kubectl verbs on workflows, and "workflow parameters".

Spans in another sense (Argo, GitHub, business workflows) are masked first
and never change. The script is a tool for the rename, not committed code.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Tuple

PROTECT = [
    r"\{\{\s*workflow\.[^}]*\}\}",            # Argo expressions: {{workflow.name}}
    r"workflowTemplateRef",
    r"[Ww]orkflow[Tt]emplates?",
    r"[Ww]orkflow[Tt]ask[Rr]esults",
    r"workflows\.argoproj\.io(?:/[\w-]+)?",
    r"workflow-controller",
    r"[Aa]rgo[ _-][Ww]orkflows?",
    r"built-in Workflow",
    r"[Nn]ext-steps workflow",
    r"[Ff]ull workflow",
    r"argo-workflows",
    r"workflow_template",
    r"workflow\[\"jobs\"\]",
    r"workflow = yaml\.safe_load\(\(REPOSITORY / \"\.github",
    r"kind:\s*Workflow\b",
    r"\"kind\":\s*\"Workflow\"",
    r"\\\"kind\\\":\\\"Workflow\\\"",
    r"\.github/workflows",
    r"github-workflows",
    r"GitHub (?:Actions )?[Ww]orkflows?",
    r"workflow_dispatch",
    r"workflow_call",
    r"test_perf_github_workflows",
    r"workflow-traffic",
    r"domain\.workflow-name",
]

JOB_MAP: List[Tuple[str, str]] = [
    ("K6Workflow", "K6Job"),
    ("WorkflowCatalog", "JobCatalog"),
    ("WorkflowError", "JobError"),
    ("WORKFLOWS", "JOBS"),
    ("WORKFLOW", "JOB"),
    ("Workflows", "Jobs"),
    ("Workflow", "Job"),
    ("workflows", "jobs"),
    ("workflow", "job"),
]

WORKFLOW_MAP: List[Tuple[str, str]] = [
    ("perf-run-and-perf-chain", "perf-job-and-perf-workflow"),
    ("perf-run/perf-chain", "perf-job/perf-workflow"),
    ("perf-chain.yml", "perf-workflow.yml"),
    ("perf-run.yml", "perf-job.yml"),
    ("`perf-run`", "`perf-job`"),
    ("perf-run:", "perf-job:"),
    ("perf-run and", "perf-job and"),
    ("CHAIN_REPORTS_DIR", "WORKFLOW_REPORTS_DIR"),
    ("RECIPE_SEPARATOR", "WORKFLOW_SEPARATOR"),
    ("STATUS_RECIPE", "STATUS_WORKFLOW"),
    ("RECIPES", "WORKFLOWS"),
    ("Recipes", "Workflows"),
    ("recipes", "workflows"),
    ("Recipe", "Workflow"),
    ("recipe", "workflow"),
    ("Chains", "Workflows"),
    ("chains", "workflows"),
    ("Chain", "Workflow"),
    ("chain", "workflow"),
]

DOC_PROTECT = [
    r"\bWorkflows?\b",
    r"(?:get|patch|delete|describe|create) workflows?\b",
    r"workflow parameters",
]

MASK = re.compile("|".join(f"(?:{pattern})" for pattern in PROTECT))
DOC_MASK = re.compile("|".join(f"(?:{pattern})" for pattern in PROTECT + DOC_PROTECT))


def rename_line(line: str, mapping: List[Tuple[str, str]], mask: "re.Pattern[str]" = MASK) -> str:
    kept: List[str] = []

    def hide(match: "re.Match[str]") -> str:
        kept.append(match.group(0))
        return f"\x00{len(kept) - 1}\x00"

    masked = mask.sub(hide, line)
    for old, new in mapping:
        masked = masked.replace(old, new)
    return re.sub(r"\x00(\d+)\x00", lambda m: kept[int(m.group(1))], masked)


def main(argv: List[str]) -> int:
    if not argv or argv[0] not in ("job", "workflow"):
        print(__doc__)
        return 2
    mapping = JOB_MAP if argv[0] == "job" else WORKFLOW_MAP
    check = "--check" in argv[1:]
    mask = DOC_MASK if "--docs" in argv[1:] else MASK
    for raw in [a for a in argv[1:] if a not in ("--check", "--docs")]:
        path = Path(raw)
        text = path.read_text(encoding="utf-8")
        lines = text.split("\n")
        renamed = [rename_line(line, mapping, mask) for line in lines]
        if check:
            for number, (old, new) in enumerate(zip(lines, renamed), start=1):
                if old != new:
                    print(f"{path}:{number}: {old.strip()} => {new.strip()}")
        elif renamed != lines:
            path.write_text("\n".join(renamed), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```
