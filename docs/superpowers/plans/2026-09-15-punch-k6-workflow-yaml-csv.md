# Punch k6 Workflow YAML and CSV Harvesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normalized YAML the execution definition for every supported Punch and Expresso k6 entry, run each selected workflow through one explicit Docker Compose run, and optionally harvest `[CSV]` stdout records into a confirmed, atomic CSV artifact.

**Architecture:** Punch gains a strict PyYAML-backed workflow model and a public execution module. The executor validates and confirms data-producing workflows, performs one `docker compose run`, streams stdout and stderr independently, logs the run, and atomically publishes valid tagged stdout records. Punch's CLI and Expresso's Python adapters become thin workflow selectors; test names may remain compatible, but Compose and k6 details live only in YAML.

**Tech Stack:** Python 3.10+, PyYAML 6.0.3, `unittest`, Docker Compose, k6 TypeScript/esbuild, Git submodules, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-09-15-punch-k6-workflow-yaml-csv-design.md`](../specs/2026-09-15-punch-k6-workflow-yaml-csv-design.md)

## Global Constraints

- Pin `PyYAML==6.0.3`; do not install dependencies implicitly from `punch run`.
- This owner-approved dependency supersedes Punch's former standard-library-only runtime rule; update every current authoritative rule that says otherwise.
- Keep Expresso's own `scripts/pg/` implementation standard-library-only. Its performance commands consume the declared Punch dependency.
- One selected `K6Workflow` produces exactly one explicit `docker compose --project-directory WORKDIR -f FILE run --rm SERVICE k6 run SCRIPT` command. Image build, dependency startup, log collection, and cleanup remain separate commands.
- Only stdout lines beginning exactly with `[CSV]` are eligible for harvesting. Stderr is never harvested.
- `spec.outputs.csv` is optional. No production workflow in this first migration declares CSV; fixture-backed tests prove the optional protocol without changing scenario behavior.
- A declared CSV output requires interactive confirmation or `--confirm-output-data`; zero valid tagged records is a failed workflow.
- Never publish partial current-run CSV data. Preserve any previously published file unless a new successful run atomically replaces it.
- Every supported Punch build entry has one bundled workflow. Every one of Expresso's seven current TypeScript build entries has one repository-owned workflow. The broken, unwired `load.js` and `stress.js` placeholders remain excluded.
- Preserve `punch run smoke|gate|journey|bff-checkout-journey|all`, `--keep-going`, `--collect-logs`, and Expresso's existing `./dev perf:*` commands.
- Preserve external-target behavior: `bff-checkout-journey` requires `TARGET_BASE_URL`; an `all` suite skips it when that value is absent, while direct selection fails before Compose starts.
- Do not change k6 requests, checks, thresholds, options, or existing HTML/JSON report paths.
- English only in committed content; no AI attribution in commits.
- Punch changes are committed inside `vendor/punch` first. Expresso changes then commit the updated submodule gitlink with the consumer integration.

---

### Task 1: Punch dependency and strict workflow model

**Repository:** `vendor/punch`

**Allowed edit paths:**
- `requirements.txt`
- `src/punch/workflow.py`
- `tests/__init__.py`
- `tests/test_workflow.py`

**Read-only context paths:**
- `src/punch/__main__.py`
- `docker-compose.yml`
- `package.json`
- `src/tests/**`

**Forbidden paths:**
- `src/services/**`
- `docker/**`
- `.github/workflows/**`
- Expresso files outside `vendor/punch/**`

**Interfaces:**
- Produces `WorkflowError(ValueError)`.
- Produces immutable `CsvOutput(path: Path)` and `K6Workflow` values.
- Produces `load_workflow(path: Path) -> K6Workflow`.
- `K6Workflow` fields are `source_path`, `name`, `working_directory`, `compose_file`, `compose_service`, `k6_script`, `forward_environment`, `required_environment`, and `csv_output`.

- [ ] **Step 1: Create a Punch feature branch from the pinned submodule commit**

Run from the parent repository:

```bash
git -C vendor/punch switch -c feature/k6-workflow-yaml
```

Expected: Punch reports the new branch and retains the original pinned commit as its parent. If the branch already exists from an earlier execution attempt, switch to it and confirm its HEAD descends from the parent repository's original gitlink before continuing.

- [ ] **Step 2: Declare and install the approved dependency**

Create `requirements.txt`:

```text
PyYAML==6.0.3
```

Run:

```bash
python3 -m pip install -r requirements.txt
```

Expected: PyYAML 6.0.3 installs and `python3 -c "import yaml; print(yaml.__version__)"` prints `6.0.3`.

- [ ] **Step 3: Write workflow-model tests before production code**

Create an empty `tests/__init__.py`, then create `tests/test_workflow.py`. Insert `vendor/punch/src` into `sys.path`, use `TemporaryDirectory`, and add a helper that writes this complete valid document beside an empty `docker-compose.yml`:

```python
VALID_WORKFLOW = """\
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: csv-fixture
spec:
  workingDirectory: .
  compose:
    file: docker-compose.yml
    service: k6
  k6:
    script: /scripts/csv-fixture.js
  environment:
    forward: [BASE_URL, RUN_ID]
    required: [RUN_ID]
  outputs:
    csv:
      path: reports/data/fixture.csv
"""
```

Add tests named:

```python
def test_loads_and_resolves_a_normalized_workflow(self) -> None:
    workflow = load_workflow(self.workflow_path)
    self.assertEqual(workflow.name, "csv-fixture")
    self.assertEqual(workflow.compose_service, "k6")
    self.assertEqual(workflow.k6_script, "/scripts/csv-fixture.js")
    self.assertEqual(workflow.forward_environment, ("BASE_URL", "RUN_ID"))
    self.assertEqual(workflow.required_environment, ("RUN_ID",))
    self.assertEqual(workflow.csv_output.path, self.root / "reports/data/fixture.csv")

def test_rejects_unknown_properties(self) -> None:
    self.assertWorkflowError("unknown field spec.k6.arguments")

def test_rejects_duplicate_yaml_keys(self) -> None:
    self.assertWorkflowError("duplicate YAML key: name")

def test_rejects_aliases_and_anchors(self) -> None:
    self.assertWorkflowError("YAML aliases and anchors are not supported")

def test_rejects_custom_yaml_tags(self) -> None:
    self.assertWorkflowError("could not determine a constructor")

def test_rejects_unsupported_version_and_kind(self) -> None:
    self.assertWorkflowError("apiVersion must be punch/v1")
    self.assertWorkflowError("kind must be K6Workflow")

def test_requires_a_safe_workflow_name(self) -> None:
    self.assertWorkflowError("metadata.name must match")

def test_requires_environment_names_and_required_subset(self) -> None:
    self.assertWorkflowError("environment.required must also appear in environment.forward")

def test_rejects_compose_and_csv_paths_outside_working_directory(self) -> None:
    self.assertWorkflowError("escapes spec.workingDirectory")

def test_requires_workflow_file_beneath_working_directory(self) -> None:
    self.assertWorkflowError("workflow file must be beneath spec.workingDirectory")

def test_requires_an_existing_compose_file(self) -> None:
    self.assertWorkflowError("compose file does not exist")

def test_requires_an_absolute_container_script(self) -> None:
    self.assertWorkflowError("spec.k6.script must be an absolute container path")

def test_allows_workflow_without_environment_or_outputs(self) -> None:
    workflow = load_workflow(self.minimal_path)
    self.assertEqual(workflow.forward_environment, ())
    self.assertEqual(workflow.required_environment, ())
    self.assertIsNone(workflow.csv_output)
```

The test helper must rewrite one field at a time and assert both `WorkflowError` and the shown stable message fragment.

- [ ] **Step 4: Run the model tests and verify RED**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests.test_workflow -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'punch.workflow'`.

- [ ] **Step 5: Implement the immutable model and strict loader**

Create `src/punch/workflow.py` with these public types:

```python
from dataclasses import dataclass
from pathlib import Path


class WorkflowError(ValueError):
    pass


@dataclass(frozen=True)
class CsvOutput:
    path: Path


@dataclass(frozen=True)
class K6Workflow:
    source_path: Path
    name: str
    working_directory: Path
    compose_file: Path
    compose_service: str
    k6_script: str
    forward_environment: tuple[str, ...]
    required_environment: tuple[str, ...]
    csv_output: CsvOutput | None
```

Implement `load_workflow(path)` using a `yaml.SafeLoader` subclass whose mapping constructor rejects duplicate keys. Before constructing, iterate `yaml.parse(text)` and reject any event with a non-null `anchor`; `SafeLoader` remains responsible for rejecting custom tags. Validate exact allowed-key sets at every mapping:

```python
ROOT_KEYS = {"apiVersion", "kind", "metadata", "spec"}
METADATA_KEYS = {"name"}
SPEC_KEYS = {"workingDirectory", "compose", "k6", "environment", "outputs"}
COMPOSE_KEYS = {"file", "service"}
K6_KEYS = {"script"}
ENVIRONMENT_KEYS = {"forward", "required"}
OUTPUT_KEYS = {"csv"}
CSV_KEYS = {"path"}
NAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
ENV_PATTERN = re.compile(r"^[A-Z_][A-Z0-9_]*$")
```

Resolve `workingDirectory` from `path.parent`, require the workflow source itself to remain beneath that resolved directory, then resolve the Compose and CSV paths under it with this containment rule:

```python
def _resolve_beneath(base: Path, raw: str, field: str) -> Path:
    candidate = (base / raw).resolve()
    if candidate != base and base not in candidate.parents:
        raise WorkflowError(f"{field} escapes spec.workingDirectory")
    return candidate
```

Reject empty strings, booleans used as strings, non-list environment fields, repeated environment names, required names absent from `forward`, a missing Compose file, and a k6 script not beginning with `/`. Catch `ModuleNotFoundError` for `yaml` at load time and raise an actionable error containing `python3 -m pip install -r requirements.txt`.

- [ ] **Step 6: Run the model tests and verify GREEN**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests.test_workflow -v
```

Expected: all workflow-model tests pass with no warnings.

- [ ] **Step 7: Commit the model slice inside Punch**

```bash
git add requirements.txt src/punch/workflow.py tests/__init__.py tests/test_workflow.py
git commit -m "feat(workflow): add normalized k6 YAML model"
```

---

### Task 2: Punch execution, confirmation, and CSV harvesting

**Repository:** `vendor/punch`

**Allowed edit paths:**
- `src/punch/execution.py`
- `tests/test_execution.py`
- `tests/fixtures/csv-output.yaml`
- `tests/fixtures/docker-compose.yml`

**Read-only context paths:**
- `src/punch/workflow.py`
- `src/punch/__main__.py`
- `docker-compose.yml`
- `src/tests/**`

**Forbidden paths:**
- `src/services/**`
- `docker/**`
- `.github/**`
- Expresso files outside `vendor/punch/**`

**Interfaces:**
- Consumes `K6Workflow` from Task 1.
- Produces immutable `ExecutionResult(workflow_name, command, child_exit_code, passed, failure, csv_path, csv_record_count)`.
- Produces `build_compose_run_command(workflow, environment) -> list[str]`.
- Produces `confirm_output_data(workflows, *, assume_yes, stdin, stdout) -> bool`.
- Produces `execute_workflow(workflow, *, environment, output_data_confirmed, stdout, stderr, log_path) -> ExecutionResult`.

- [ ] **Step 1: Add a fixture workflow and write execution tests**

Create `tests/fixtures/docker-compose.yml` with `services: {k6: {image: grafana/k6:0.55.0}}` and create `tests/fixtures/csv-output.yaml` pointing at that file, `/scripts/csv-output.js`, and `reports/data/fixture.csv` with `outputs.csv` declared.

Create `tests/test_execution.py`. Its setup creates an executable file named `docker` in a temporary `bin` directory and prepends that directory to `PATH`. The fake records `sys.argv[1:]` in `FAKE_DOCKER_ARGS`, prints lines from `FAKE_STDOUT`, prints `FAKE_STDERR` to stderr, and exits with `FAKE_EXIT_CODE`:

```python
FAKE_DOCKER = """#!/usr/bin/env python3
import os
import sys
from pathlib import Path

Path(os.environ["FAKE_DOCKER_ARGS"]).write_text("\\n".join(sys.argv[1:]), encoding="utf-8")
for line in os.environ.get("FAKE_STDOUT", "").split("|"):
    if line:
        print(line, flush=True)
for line in os.environ.get("FAKE_STDERR", "").split("|"):
    if line:
        print(line, file=sys.stderr, flush=True)
raise SystemExit(int(os.environ.get("FAKE_EXIT_CODE", "0")))
"""


class TtyInput(io.StringIO):
    def isatty(self) -> bool:
        return True
```

Add focused tests:

```python
def test_builds_one_explicit_compose_run_with_allowlisted_environment(self) -> None:
    command = build_compose_run_command(
        self.workflow,
        {"BASE_URL": "http://target", "RUN_ID": "run-7", "SECRET": "ignored"},
    )
    self.assertEqual(command.count("run"), 2)  # compose run and k6 run
    self.assertEqual(command[:4], ["docker", "compose", "--project-directory", str(self.root)])
    self.assertIn("BASE_URL=http://target", command)
    self.assertIn("RUN_ID=run-7", command)
    self.assertNotIn("SECRET=ignored", command)
    self.assertEqual(command[-3:], ["k6", "run", "/scripts/csv-output.js"])

def test_missing_required_environment_fails_before_subprocess(self) -> None:
    result = execute_workflow(self.workflow, environment={}, output_data_confirmed=True)
    self.assertFalse(result.passed)
    self.assertIn("RUN_ID", result.failure)
    self.assertFalse(self.args_path.exists())

def test_csv_workflow_requires_confirmation_before_subprocess(self) -> None:
    result = execute_workflow(self.workflow, environment=self.env, output_data_confirmed=False)
    self.assertFalse(result.passed)
    self.assertIn("confirmation", result.failure)
    self.assertFalse(self.args_path.exists())

def test_interactive_confirmation_names_every_csv_destination(self) -> None:
    output = io.StringIO()
    accepted = confirm_output_data([self.workflow], assume_yes=False, stdin=TtyInput("yes\n"), stdout=output)
    self.assertTrue(accepted)
    self.assertIn("csv-fixture", output.getvalue())
    self.assertIn("fixture.csv", output.getvalue())

def test_noninteractive_confirmation_requires_explicit_flag(self) -> None:
    self.assertFalse(confirm_output_data([self.workflow], assume_yes=False, stdin=io.StringIO("yes\n"), stdout=io.StringIO()))
    self.assertTrue(confirm_output_data([self.workflow], assume_yes=True, stdin=io.StringIO(), stdout=io.StringIO()))

def test_harvests_only_stdout_tagged_records_and_publishes_atomically(self) -> None:
    self.env["FAKE_STDOUT"] = 'ordinary|[CSV] id,name|[CSV] 7,"coffee, dark"'
    self.env["FAKE_STDERR"] = "[CSV] 99,stderr-must-not-be-data"
    result = execute_workflow(self.workflow, environment=self.env, output_data_confirmed=True)
    self.assertTrue(result.passed)
    self.assertEqual(result.csv_record_count, 2)
    self.assertEqual(self.workflow.csv_output.path.read_text(), 'id,name\n7,"coffee, dark"\n')

def test_declared_csv_with_zero_tagged_lines_fails(self) -> None:
    self.env["FAKE_STDOUT"] = "ordinary k6 output"
    result = execute_workflow(self.workflow, environment=self.env, output_data_confirmed=True)
    self.assertFalse(result.passed)
    self.assertIn("no [CSV] stdout records", result.failure)
    self.assertFalse(self.workflow.csv_output.path.exists())

def test_blank_or_invalid_tagged_payload_fails_without_replacing_old_csv(self) -> None:
    self.workflow.csv_output.path.parent.mkdir(parents=True)
    self.workflow.csv_output.path.write_text("previous\n", encoding="utf-8")
    self.env["FAKE_STDOUT"] = "[CSV]"
    result = execute_workflow(self.workflow, environment=self.env, output_data_confirmed=True)
    self.assertFalse(result.passed)
    self.assertEqual(self.workflow.csv_output.path.read_text(), "previous\n")

def test_nonzero_child_exit_is_propagated_and_partial_csv_is_not_published(self) -> None:
    self.env.update(FAKE_STDOUT="[CSV] id,name|[CSV] 1,espresso", FAKE_EXIT_CODE="17")
    result = execute_workflow(self.workflow, environment=self.env, output_data_confirmed=True)
    self.assertEqual(result.child_exit_code, 17)
    self.assertFalse(result.passed)
    self.assertFalse(self.workflow.csv_output.path.exists())

def test_workflow_without_csv_never_prompts_or_harvests(self) -> None:
    result = execute_workflow(self.no_csv_workflow, environment=self.env, output_data_confirmed=False)
    self.assertTrue(result.passed)
    self.assertIsNone(result.csv_path)

def test_streams_stdout_and_stderr_separately_and_logs_both(self) -> None:
    self.env.update(FAKE_STDOUT="stdout-line", FAKE_STDERR="stderr-line")
    stdout = io.StringIO()
    stderr = io.StringIO()
    result = execute_workflow(
        self.no_csv_workflow,
        environment=self.env,
        output_data_confirmed=False,
        stdout=stdout,
        stderr=stderr,
        log_path=self.log_path,
    )
    self.assertTrue(result.passed)
    self.assertIn("stdout-line", stdout.getvalue())
    self.assertNotIn("stderr-line", stdout.getvalue())
    self.assertIn("stderr-line", stderr.getvalue())
    self.assertIn("stdout-line", self.log_path.read_text())
    self.assertIn("stderr-line", self.log_path.read_text())

def test_spawn_error_returns_failure_without_csv(self) -> None:
    self.env["PATH"] = str(self.root / "missing-bin")
    result = execute_workflow(self.workflow, environment=self.env, output_data_confirmed=True)
    self.assertFalse(result.passed)
    self.assertIsNone(result.child_exit_code)
    self.assertIn("could not start Docker Compose", result.failure)
    self.assertFalse(self.workflow.csv_output.path.exists())
```

- [ ] **Step 2: Run the execution tests and verify RED**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests.test_execution -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'punch.execution'`.

- [ ] **Step 3: Implement command construction and confirmation**

Create `src/punch/execution.py` with:

```python
@dataclass(frozen=True)
class ExecutionResult:
    workflow_name: str
    command: tuple[str, ...]
    child_exit_code: int | None
    passed: bool
    failure: str | None
    csv_path: Path | None
    csv_record_count: int


def build_compose_run_command(
    workflow: K6Workflow,
    environment: Mapping[str, str],
) -> list[str]:
    command = [
        "docker", "compose", "--project-directory", str(workflow.working_directory),
        "-f", str(workflow.compose_file), "run", "--rm",
    ]
    for name in workflow.forward_environment:
        if name in environment:
            command.extend(["-e", f"{name}={environment[name]}"])
    command.extend([workflow.compose_service, "k6", "run", workflow.k6_script])
    return command
```

`confirm_output_data` filters to workflows with `csv_output`, prints all workflow-name/destination pairs first, returns `True` immediately when there are none or `assume_yes` is true, rejects non-TTY stdin, and accepts only case-insensitive `y` or `yes` after one prompt.

- [ ] **Step 4: Implement independent streaming and atomic harvesting**

Start the child with the following pipe configuration, then use two daemon reader threads. Each reader places `(stream_name, line)` into a `queue.Queue` and then a `(stream_name, None)` sentinel. The main thread consumes until both sentinels arrive, writes stdout to the supplied stdout stream, stderr to the supplied stderr stream, and writes both to the optional raw log under a lock-free single writer.

```python
proc = subprocess.Popen(
    command,
    cwd=workflow.working_directory,
    env=dict(environment),
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1,
)
```

For declared CSV, inspect stdout with:

```python
CSV_TAG = "[CSV]"


def _csv_payload(line: str) -> str | None:
    record = line.rstrip("\r\n")
    if not record.startswith(CSV_TAG):
        return None
    payload = record[len(CSV_TAG):]
    if payload.startswith(" "):
        payload = payload[1:]
    if not payload:
        raise ValueError("blank [CSV] payload")
    parsed = list(csv.reader([payload], strict=True))
    if len(parsed) != 1:
        raise ValueError("[CSV] payload must contain one record")
    return payload
```

After confirmation and before spawning, create the declared CSV parent with `csv_path.parent.mkdir(parents=True, exist_ok=True)`. Write payloads to a `NamedTemporaryFile(mode="w", encoding="utf-8", newline="", dir=csv_path.parent, delete=False)`. After the child exits, publish with `os.replace(temp_path, csv_path)` only when the child exit is zero, CSV validation has no error, and at least one record exists. Unlink the temporary file in every other path. Preserve an existing destination on failure.

For Punch-owned validation/confirmation/CSV failures without a nonzero child code, return a failed `ExecutionResult` and let callers map it to CLI exit code `1`. Preserve a real nonzero child exit code.

- [ ] **Step 5: Run the execution tests and verify GREEN**

Run:

```bash
PYTHONPATH=src python3 -m unittest tests.test_execution -v
```

Expected: all execution tests pass; the fake argument log contains one `compose` and one Compose `run` token.

- [ ] **Step 6: Commit the executor slice inside Punch**

```bash
git add src/punch/execution.py tests/test_execution.py tests/fixtures/csv-output.yaml tests/fixtures/docker-compose.yml
git commit -m "feat(workflow): harvest optional CSV output"
```

---

### Task 3: Punch bundled workflows and CLI migration

**Repository:** `vendor/punch`

**Allowed edit paths:**
- `src/punch/__main__.py`
- `workflows/k6/*.yaml`
- `tests/test_cli.py`
- `tests/test_workflow_coverage.py`
- `tests/test_legacy_entrypoints.py`
- `bin/test-smoke`
- `bin/test-gate`
- `bin/test-journey`
- `bin/test-suite`
- `package.json`

**Read-only context paths:**
- `src/punch/workflow.py`
- `src/punch/execution.py`
- `package.json`
- `docker-compose.yml`
- `src/tests/**`

**Forbidden paths:**
- `src/services/**`
- `docker/**`
- `.github/**`
- Expresso files outside `vendor/punch/**`

**Interfaces:**
- Consumes Tasks 1-2 APIs.
- Keeps the public CLI selectors `smoke`, `gate`, `journey`, `bff-checkout-journey`, and `all`.
- Adds direct YAML path selection and `--confirm-output-data`.
- Produces run evidence with per-result workflow path, child exit code, failure reason, CSV path, and CSV record count.
- This is an approved cross-layer integration task: implement/review the Python runtime and YAML first, then update the thin legacy/package entrypoints in a separate pass. No k6 TypeScript or Dockerfile changes are authorized.

- [ ] **Step 1: Write failing CLI and coverage tests**

Create `tests/test_cli.py` and use a temporary fake `docker` executable plus temporary replacements for `STATE_DIR` and `LOGS_DIR`. Add tests that call `punch.__main__.main(argv)` directly:

```python
def test_named_selector_resolves_bundled_yaml_and_runs_once(self) -> None:
    rc = main(["run", "smoke"])
    self.assertEqual(rc, 0)
    self.assertEqual(self.compose_run_count(), 1)
    self.assertNotIn("build", self.fake_docker_arguments())

def test_direct_yaml_path_is_accepted(self) -> None:
    rc = main(["run", str(self.workflow_path)])
    self.assertEqual(rc, 0)

def test_csv_path_refuses_noninteractive_run_without_flag(self) -> None:
    rc = main(["run", str(self.csv_workflow_path)])
    self.assertEqual(rc, 1)
    self.assertEqual(self.compose_run_count(), 0)

def test_confirm_output_data_allows_noninteractive_csv_run(self) -> None:
    rc = main(["run", str(self.csv_workflow_path), "--confirm-output-data"])
    self.assertEqual(rc, 0)
    self.assertEqual(self.compose_run_count(), 1)

def test_direct_external_workflow_requires_target_before_run(self) -> None:
    rc = main(["run", "bff-checkout-journey"])
    self.assertEqual(rc, 1)
    self.assertEqual(self.compose_run_count(), 0)

def test_all_skips_external_workflow_without_target(self) -> None:
    rc = main(["run", "all"])
    self.assertEqual(rc, 0)
    self.assertEqual(self.compose_run_count(), 3)

def test_keep_going_and_child_exit_code_behavior_is_preserved(self) -> None:
    self.configure_fake_exit_sequence([0, 9, 0])
    rc = main(["run", "all", "--keep-going"])
    self.assertEqual(rc, 9)
    self.assertEqual(self.compose_run_count(), 3)

def test_evidence_records_workflow_and_csv_fields(self) -> None:
    record = json.loads((self.state_dir / "punch-run.json").read_text())
    self.assertIn("workflow", record["results"][0])
    self.assertIn("csvRecordCount", record["results"][0])
```

Create `tests/test_workflow_coverage.py`. Parse `package.json`'s build command with `shlex.split`, translate `src/tests/<name>.ts` entries to `/scripts/<name>.js`, load every `workflows/k6/*.yaml`, and assert the two script sets are identical and workflow names are unique.

Create `tests/test_legacy_entrypoints.py` and assert `bin/test-smoke`, `bin/test-gate`, `bin/test-journey`, `bin/test-suite`, and the `test:smoke` package script do not contain `docker compose run`; each test wrapper must route execution through `bin/punch run`.

- [ ] **Step 2: Run the CLI tests and verify RED**

Run:

```bash
PYTHONPATH=src python3 -m unittest \
  tests.test_cli tests.test_workflow_coverage tests.test_legacy_entrypoints -v
```

Expected: FAIL because bundled workflow YAML does not exist, the parser still restricts `test` to hard-coded choices, and legacy entrypoints still construct Compose runs directly.

- [ ] **Step 3: Add the four bundled workflow definitions**

Create:

```text
workflows/k6/smoke.yaml
workflows/k6/gate.yaml
workflows/k6/journey.yaml
workflows/k6/bff-checkout-journey.yaml
```

All use `workingDirectory: ../..`, `compose.file: docker-compose.yml`, and `compose.service: k6`. Map scripts as follows:

```text
smoke                 -> /scripts/smoke.js
gate                  -> /scripts/catalog-gate.js
journey               -> /scripts/order-journey.js
bff-checkout-journey  -> /scripts/bff-checkout-journey.js
```

`smoke` forwards `TARGET_BASE_URL`, `CATALOG_URL`, and `ORDERS_URL`. `gate` and `journey` forward `TARGET_BASE_URL`. `bff-checkout-journey` forwards and requires `TARGET_BASE_URL`. Omit `outputs` from all four initial production workflows.

- [ ] **Step 4: Replace hard-coded execution definitions with YAML selection**

In `src/punch/__main__.py`:

- Replace `TESTS` with a selector-to-YAML-filename map only:

```python
BUNDLED_WORKFLOW_DIR = REPO_ROOT / "workflows" / "k6"
BUNDLED_WORKFLOWS = {
    "smoke": BUNDLED_WORKFLOW_DIR / "smoke.yaml",
    "gate": BUNDLED_WORKFLOW_DIR / "gate.yaml",
    "journey": BUNDLED_WORKFLOW_DIR / "journey.yaml",
    "bff-checkout-journey": BUNDLED_WORKFLOW_DIR / "bff-checkout-journey.yaml",
}
```

- Delete `_compose_build`, `_run_one`, and `REQUIRES_ENV`.
- Resolve a selector as a bundled name first and otherwise as a filesystem path; reject a missing path with a concise error.
- Load every selected workflow before confirmation or subprocess execution.
- For `all`, skip a workflow when any YAML-declared required environment value is absent; for a direct selector, let the executor return a pre-spawn failure.
- Call `confirm_output_data` once for the selected runnable sequence before the first subprocess. Pass `args.confirm_output_data` as `assume_yes`.
- Call `execute_workflow` once per runnable workflow with `output_data_confirmed=True`, `os.environ`, and `LOGS_DIR / f"k6-{workflow.name}.log"`.
- Preserve first-nonzero/`--keep-going` behavior, mapping Punch-owned failures to exit code `1` and real child failures to the child code.
- Extend evidence results without recording environment values:

```python
{
    "test": workflow.name,
    "workflow": str(workflow.source_path.relative_to(workflow.working_directory)),
    "exitCode": effective_exit_code,
    "passed": result.passed,
    "failure": result.failure,
    "csvPath": (
        str(result.csv_path.relative_to(workflow.working_directory))
        if result.csv_path else None
    ),
    "csvRecordCount": result.csv_record_count,
}
```

- Change the parser's positional argument from fixed `choices` to `selector`, document that it accepts a bundled name, `all`, or YAML path, and add `--confirm-output-data`.
- Extend `doctor` with a PyYAML version check and a bundled-workflow validation check. Import workflow code lazily so `doctor` can report a missing dependency rather than crash.

- [ ] **Step 5: Route every legacy/package k6 entrypoint through YAML-backed Punch**

Change `package.json`'s `test:smoke` script to `./bin/punch run smoke`.

Change `bin/test-smoke`, `bin/test-gate`, and `bin/test-journey` into thin wrappers that resolve the repository root and execute `bin/punch run smoke|gate|journey`. They must not build or construct a Compose run.

Keep `bin/test-suite` as a lifecycle convenience wrapper: build the images, start the reference application, register a cleanup trap, and call exactly `./bin/punch run all --collect-logs` for test execution. Remove its three direct `docker compose run` lines.

- [ ] **Step 6: Run the complete Punch unit suite and verify GREEN**

Run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py' -v
rg -n "docker compose run" bin package.json
```

Expected: model, executor, CLI, one-to-one coverage, and legacy-entrypoint tests all pass. The search returns only explanatory text or no matches; it finds no executable direct k6 Compose run.

- [ ] **Step 7: Verify CLI discovery without Docker execution**

Run:

```bash
./bin/punch --help
./bin/punch run --help
./bin/punch doctor
```

Expected: help names YAML paths and `--confirm-output-data`; doctor reports Docker, Compose, Python, PyYAML, Compose file, and bundled workflows individually. Docker-dependent doctor checks may fail only when Docker is genuinely unavailable.

- [ ] **Step 8: Commit the CLI migration inside Punch**

```bash
git add src/punch/__main__.py workflows/k6 tests/test_cli.py \
  tests/test_workflow_coverage.py tests/test_legacy_entrypoints.py \
  bin/test-smoke bin/test-gate bin/test-journey bin/test-suite package.json
git commit -m "feat(cli): execute k6 tests from workflow YAML"
```

---

### Task 4: Punch CI, ADR, and authoritative contract documentation

**Repository:** `vendor/punch`

**Allowed edit paths:**
- `.github/workflows/k6.yml`
- `.github/copilot-instructions.md`
- `.github/instructions/python-orchestrator.instructions.md`
- `.github/instructions/artifacts-reporting.instructions.md`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `CONTRIBUTING.md`
- `bin/punch`
- `src/punch/init_scan.py`
- `docs/ai/decisions/0005-workflow-yaml-runtime.md`
- `docs/ai/maintenance-matrix.md`
- `docs/ai/operating-model.md`
- `docs/architecture/punch-boundaries.md`
- `docs/workflows/validation.md`

**Read-only context paths:**
- `requirements.txt`
- `src/punch/**`
- `workflows/k6/**`
- `docker-compose.yml`

**Forbidden paths:**
- `src/services/**`
- `src/tests/**`
- `docker/**`
- Expresso files outside `vendor/punch/**`

**Interfaces:**
- Makes `python3 -m pip install -r requirements.txt` an explicit Punch setup step.
- Makes the unit suite and workflow-backed CLI the CI contract.
- Registers optional CSV and expanded run evidence as public artifacts.

- [ ] **Step 1: Update CI to install and test the workflow engine**

In `.github/workflows/k6.yml`, after checkout and before Docker build, add:

```yaml
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install Punch runtime dependencies
        run: python -m pip install -r requirements.txt

      - name: Run Punch unit tests
        run: PYTHONPATH=src python -m unittest discover -s tests -p 'test_*.py' -v
```

Keep `docker compose build` as a separate CI step and keep `./bin/punch run all` as the execution step. Do not add `--confirm-output-data`, because none of the bundled production workflows declares CSV.

- [ ] **Step 2: Record the dependency and workflow decision**

Create `docs/ai/decisions/0005-workflow-yaml-runtime.md` with status `Accepted`, date `2026-09-15`, and these decisions:

- normalized YAML is the sole k6 execution definition;
- PyYAML 6.0.3 is a declared host runtime dependency;
- dependency installation is explicit and never triggered by `punch run`;
- one workflow equals one Compose run;
- optional `[CSV]` stdout harvesting requires confirmation and atomic publication;
- rejected alternatives are JSON-with-YAML-extension, handwritten YAML parsing, console-summary parsing, and native k6 CSV output.

- [ ] **Step 3: Reconcile the authoritative rules**

Update `.github/copilot-instructions.md`, `.github/instructions/python-orchestrator.instructions.md`, `AGENTS.md`, `CLAUDE.md`, `docs/ai/operating-model.md`, and `docs/architecture/punch-boundaries.md` so they say:

- Docker, Python 3.10+, and the pinned requirements are host prerequisites;
- Punch orchestration is Python plus PyYAML, while all other orchestration logic remains standard-library based;
- interactive prompting is allowed only for YAML-declared CSV output, and CI must use `--confirm-output-data` if such a workflow is selected;
- subprocess stdout and stderr are streamed separately because only stdout can carry `[CSV]` records;
- execution definitions live in `workflows/k6/*.yaml`;
- `punch run` does not build images;
- `src/punch/execution.py` owns launch, logs, confirmation, and data harvesting.

Update the `bin/punch` and `src/punch/init_scan.py` comments that incorrectly describe the entire runtime as standard-library-only. Keep `init_scan.py`'s hand-rendered YAML behavior unchanged.

- [ ] **Step 4: Reconcile public usage and artifact contracts**

Update `README.md`, `CONTRIBUTING.md`, `.github/instructions/artifacts-reporting.instructions.md`, `docs/ai/maintenance-matrix.md`, and `docs/workflows/validation.md` with:

```bash
python3 -m pip install -r requirements.txt
docker compose build
./bin/punch run smoke
./bin/punch run path/to/workflow.yaml
./bin/punch run path/to/csv-workflow.yaml --confirm-output-data
```

Document CSV as workflow-declared, path-configured data; its producer is `src/punch/execution.py`, it is published only on success, and its schema is the ordered tag-stripped stdout records. Document the new evidence fields and make clear that a prior CSV file does not prove the current run succeeded.

- [ ] **Step 5: Run documentation and CI-shape checks**

Run:

```bash
rg -n "stdlib.only|no pip|does not parse output|no interactive prompts|compose build" \
  AGENTS.md CLAUDE.md README.md CONTRIBUTING.md .github/copilot-instructions.md \
  .github/instructions docs/architecture docs/ai/operating-model.md \
  docs/ai/maintenance-matrix.md docs/workflows/validation.md
git diff --check
```

Expected: any remaining match describes a rejected/historical alternative or the still-stdlib portion of the runtime; no current instruction contradicts ADR 0005 or the approved spec. `git diff --check` produces no output.

- [ ] **Step 6: Re-run Punch tests after contract reconciliation**

Run:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py' -v
./bin/punch doctor
```

Expected: all tests pass and doctor recognizes PyYAML 6.0.3 plus all bundled YAML files.

- [ ] **Step 7: Commit Punch's public contract update**

```bash
git add .github/workflows/k6.yml .github/copilot-instructions.md \
  .github/instructions/python-orchestrator.instructions.md \
  .github/instructions/artifacts-reporting.instructions.md \
  AGENTS.md CLAUDE.md README.md CONTRIBUTING.md bin/punch src/punch/init_scan.py \
  docs/ai/decisions/0005-workflow-yaml-runtime.md \
  docs/ai/maintenance-matrix.md docs/ai/operating-model.md \
  docs/architecture/punch-boundaries.md docs/workflows/validation.md
git commit -m "docs(workflow): define YAML execution contract"
```

---

### Task 5: Expresso workflow definitions and Python adapter migration

**Repository:** Expresso parent repository

**Allowed edit paths:**
- `tests/performance/k6/workflows/*.yaml`
- `scripts/pg/paths.py`
- `scripts/pg/k6runner.py`
- `scripts/pg/perf.py`
- `scripts/pg/campaign.py`
- `scripts/pg/cli.py`
- `scripts/pg/tests/test_k6runner.py`
- `scripts/pg/tests/test_k6_workflows.py`
- `scripts/pg/tests/test_campaign.py`
- `vendor/punch` gitlink

**Read-only context paths:**
- `tests/performance/k6/package.json`
- `tests/performance/k6/scenarios/**`
- `infra/docker/compose.performance.yaml`
- `use-cases/catalog.json`
- `vendor/punch/src/punch/**`

**Forbidden paths:**
- `apps/**`
- `packages/**`
- `infra/docker/**`
- `tests/performance/k6/scenarios/**`
- `.github/**`

**Interfaces:**
- Consumes Punch's public `load_workflow`, `confirm_output_data`, and `execute_workflow` APIs.
- Produces `PERF_WORKFLOWS_DIR`.
- Changes `run_k6` to select a YAML workflow name instead of accepting a container script path.
- Preserves campaign preprocessing and passes `RUN_ID`, `CATALOG_VERSION`, and `CAMPAIGN_JSON` as runtime values.

- [ ] **Step 1: Write failing Expresso selection and coverage tests**

Create `scripts/pg/tests/test_k6runner.py`. Use a fake `docker` executable as in Punch's executor tests, call the real `run_k6`, and assert:

```python
def test_run_k6_loads_repository_workflow_and_delegates_one_compose_run(self) -> None:
    rc = run_k6("smoke", extra_env={"IGNORED_SECRET": "no"})
    self.assertEqual(rc, 0)
    args = self.fake_docker_args()
    self.assertEqual(args.count("run"), 2)
    self.assertIn("compose.performance.yaml", " ".join(args))
    self.assertIn("/scripts/scenarios/smoke/smoke.js", args)
    self.assertNotIn("IGNORED_SECRET=no", args)

def test_unknown_workflow_name_fails_before_docker(self) -> None:
    self.assertEqual(run_k6("missing"), 1)
    self.assertFalse(self.fake_args_path.exists())
```

Create `scripts/pg/tests/test_k6_workflows.py`. Parse the seven entry files from `tests/performance/k6/package.json`, translate them through `--outbase=scenarios` to `/scripts/scenarios/<relative>.js`, load all YAML files from `PERF_WORKFLOWS_DIR`, and assert exact set equality plus unique workflow names.

Extend `test_campaign.py` with a patched orchestration-boundary assertion:

```python
@patch("pg.campaign.run_k6", return_value=0)
def test_run_selects_campaign_workflow_and_forwards_generated_values(self, run_k6_mock) -> None:
    rc = run([str(DEFAULT_DESCRIPTOR)])
    self.assertEqual(rc, 0)
    args, kwargs = run_k6_mock.call_args
    self.assertEqual(args[0], "campaign")
    self.assertIn("CAMPAIGN_JSON", kwargs["extra_env"])
```

This mock is limited to the external execution boundary; campaign option generation remains covered with real data.

- [ ] **Step 2: Run Expresso Python tests and verify RED**

Run:

```bash
pnpm pg:test
```

Expected: FAIL because `PERF_WORKFLOWS_DIR` and the YAML files do not exist and `run_k6` still expects a script path.

- [ ] **Step 3: Add seven Expresso-owned workflow definitions**

Create:

```text
tests/performance/k6/workflows/smoke.yaml
tests/performance/k6/workflows/checkout-flow.yaml
tests/performance/k6/workflows/read-heavy.yaml
tests/performance/k6/workflows/campaign.yaml
tests/performance/k6/workflows/catalog-browse.yaml
tests/performance/k6/workflows/order-lookup.yaml
tests/performance/k6/workflows/purchase.yaml
```

Every file uses:

```yaml
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: smoke
spec:
  workingDirectory: ../../../..
  compose:
    file: infra/docker/compose.performance.yaml
    service: k6
  k6:
    script: /scripts/scenarios/smoke/smoke.js
  environment:
    forward: [BASE_URL]
```

Change `metadata.name` and `k6.script` per file. `checkout-flow`, `read-heavy`, `catalog-browse`, `order-lookup`, and `purchase` forward only `BASE_URL`. `campaign` forwards `BASE_URL`, `RUN_ID`, `CATALOG_VERSION`, and `CAMPAIGN_JSON`, and requires `CAMPAIGN_JSON`. Omit `outputs` from every initial file.

- [ ] **Step 4: Replace script-path construction with workflow selection**

In `scripts/pg/paths.py`, add:

```python
PERF_WORKFLOWS_DIR: Path = REPO_ROOT / "tests" / "performance" / "k6" / "workflows"
```

In `scripts/pg/k6runner.py`:

- Remove the private `_stream` import and all Compose command construction.
- Import Punch's public workflow/execution APIs after `pg.paths` initializes `PUNCH_SRC`.
- Change `run_k6` to:

```python
def run_k6(
    workflow_name: str,
    *,
    extra_env: Optional[Dict[str, str]] = None,
    confirm_output_data_flag: bool = False,
) -> int:
```

- Resolve exactly `PERF_WORKFLOWS_DIR / f"{workflow_name}.yaml"`, load it, merge `os.environ`, resolved `BASE_URL`, and `extra_env`, then call `confirm_output_data` with the workflow, flag, and process streams. Call `execute_workflow` with the merged environment, the returned confirmation result, process streams, and `PERF_REPORTS_DIR / "logs" / f"k6-{workflow.name}.log"`.
- Keep the current target/liveness information and success/failure presentation, but print `workflow.k6_script` rather than a caller-supplied script.
- Return `result.child_exit_code` when nonzero; otherwise return `1` for Punch-owned failures and `0` for success.

In `scripts/pg/perf.py`, make `smoke`, `checkout_flow`, and `read_heavy` accept `Sequence[str]`, parse only `--confirm-output-data` with a local `argparse.ArgumentParser`, and call `run_k6("smoke")`, `run_k6("checkout-flow")`, or `run_k6("read-heavy")`.

In `scripts/pg/campaign.py`, parse the optional descriptor and `--confirm-output-data`, retain all preflight/options logic, and replace the script path with `run_k6("campaign", extra_env={"RUN_ID": run_id, "CATALOG_VERSION": str(catalog.get("catalogVersion", "")), "CAMPAIGN_JSON": json.dumps(options)}, confirm_output_data_flag=args.confirm_output_data)`.

In `scripts/pg/cli.py`, pass command arguments through to the three static performance functions rather than discarding them.

- [ ] **Step 5: Run Expresso tests and verify GREEN**

Run:

```bash
pnpm pg:test
```

Expected: all existing and new Python tests pass, including seven-entry YAML coverage and campaign environment forwarding.

- [ ] **Step 6: Confirm k6 sources and Compose remain untouched**

Run:

```bash
git diff -- tests/performance/k6/scenarios infra/docker/compose.performance.yaml
git -C vendor/punch status --short
```

Expected: no scenario or Compose diff; Punch's worktree is clean after its Task 4 commits.

- [ ] **Step 7: Commit the Expresso integration and new Punch gitlink**

```bash
git add vendor/punch tests/performance/k6/workflows scripts/pg/paths.py \
  scripts/pg/k6runner.py scripts/pg/perf.py scripts/pg/campaign.py scripts/pg/cli.py \
  scripts/pg/tests/test_k6runner.py scripts/pg/tests/test_k6_workflows.py \
  scripts/pg/tests/test_campaign.py
git commit -m "feat(perf): run k6 from normalized workflow YAML"
```

---

### Task 6: Expresso CI and current architecture documentation

**Repository:** Expresso parent repository

**Allowed edit paths:**
- `.github/workflows/ci.yml`
- `CLAUDE.md`
- `README.md`
- `dev`
- `scripts/pg/cli.py`
- `docs/ai/claude-code-operating-protocol.md`
- `docs/architecture/orchestrator-python.md`
- `docs/cli-reference.md`
- `docs/performance/orchestrator.md`
- `docs/specs/punch-submodule-integration.md`
- `tests/performance/k6/README.md`

**Read-only context paths:**
- `vendor/punch/requirements.txt`
- `vendor/punch/workflows/k6/**`
- `tests/performance/k6/workflows/**`
- `scripts/pg/**`
- `infra/docker/compose.performance.yaml`

**Forbidden paths:**
- `apps/**`
- `packages/**`
- `tests/performance/k6/scenarios/**`
- `infra/docker/**`
- `vendor/punch/**`

**Interfaces:**
- Makes `vendor/punch/requirements.txt` an explicit prerequisite for performance commands and Python CI.
- Routes the CI performance smoke through `./dev perf:smoke` after a separate image build.
- Documents YAML ownership and the optional CSV protocol.

- [ ] **Step 1: Install Punch dependencies in affected CI jobs**

In `.github/workflows/ci.yml`:

- Change the Python job's install step to install both pinned tools:

```yaml
      - name: Install Python dependencies
        run: python -m pip install --quiet "ruff==0.7.4" -r vendor/punch/requirements.txt
```

- In `perf-smoke`, add `actions/setup-python@v5` with Python 3.11 and install `vendor/punch/requirements.txt`.
- Add a separate image-build step:

```yaml
      - name: Build k6 image
        run: docker compose -f infra/docker/compose.performance.yaml build k6
```

- Replace the hand-built Docker Compose k6 run block with:

```yaml
      - name: Run k6 smoke workflow
        env:
          BASE_URL: http://host.docker.internal:3001
        run: ./dev perf:smoke
```

Do not add `--confirm-output-data` while the smoke YAML has no CSV declaration.

- [ ] **Step 2: Update root onboarding and command documentation**

Update `README.md`, `CLAUDE.md`, `dev`, `scripts/pg/cli.py`, and `docs/cli-reference.md` to name the additional performance prerequisite:

```bash
python3 -m pip install -r vendor/punch/requirements.txt
```

Clarify that core `scripts/pg` remains standard-library-only, while `./dev perf:*` loads Punch's pinned PyYAML dependency. Document `--confirm-output-data` as required only for non-interactive runs of future CSV-declared workflows.

- [ ] **Step 3: Update architecture and scenario-owner documentation**

Update `docs/architecture/orchestrator-python.md`, `docs/performance/orchestrator.md`, `tests/performance/k6/README.md`, and `docs/ai/claude-code-operating-protocol.md` so the architecture is:

```text
./dev perf:* -> repository YAML -> Punch load/validate/confirm ->
one docker compose run -> stdout/stderr log + existing HTML/JSON + optional CSV
```

Document the seven YAML mappings, the exact `[CSV]` prefix contract, optional `outputs.csv`, zero-record failure, stdout-only harvesting, and atomic publication. Replace the old extension instruction that asks maintainers to add script paths to `perf.py`; adding a test now requires adding its build entry and exactly one workflow YAML.

Add a supersession note to `docs/specs/punch-submodule-integration.md` stating that the new design replaces INT-002's private `_stream` import and updates the host dependency boundary, while leaving the historical integration record intact.

- [ ] **Step 4: Run current documentation consistency checks**

Run:

```bash
rg -n "_stream|script_path|stdlib.only|no pip|docker compose.*run.*k6" \
  CLAUDE.md README.md dev scripts/pg/cli.py docs/architecture \
  docs/performance tests/performance/k6/README.md
git diff --check
```

Expected: no current documentation directs a consumer to the private `_stream` API or claims performance commands have no Python dependency. Any direct Compose example is clearly labeled as a debugging escape hatch, not the owned workflow path.

- [ ] **Step 5: Re-run root static and unit gates**

Run:

```bash
pnpm pg:test
pnpm typecheck
pnpm lint
pnpm format
```

Expected: all commands pass with no new warnings.

- [ ] **Step 6: Commit the Expresso CI and documentation update**

```bash
git add .github/workflows/ci.yml CLAUDE.md README.md dev scripts/pg/cli.py \
  docs/ai/claude-code-operating-protocol.md docs/architecture/orchestrator-python.md \
  docs/cli-reference.md docs/performance/orchestrator.md \
  docs/specs/punch-submodule-integration.md tests/performance/k6/README.md
git commit -m "docs(perf): document workflow-based k6 execution"
```

---

### Task 7: Cross-repository verification and completion gate

**Repository:** Both repositories, read-only verification except generated ignored artifacts

**Allowed edit paths:**
- None; return to the owning task if a gate fails.

**Read-only context paths:**
- All changed source, YAML, CI, and documentation files
- `reports/**` and `tests/performance/k6/reports/**` generated evidence

**Forbidden paths:**
- All tracked files

**Interfaces:**
- Proves the approved acceptance criteria end to end.

- [ ] **Step 1: Prepare an isolated verification environment**

Run:

```bash
python3 -m venv /tmp/punch-k6-workflow-venv
source /tmp/punch-k6-workflow-venv/bin/activate
python -m pip install -r vendor/punch/requirements.txt
```

Expected: `python -c "import yaml; print(yaml.__version__)"` prints `6.0.3`.

- [ ] **Step 2: Run both Python unit suites**

Run:

```bash
cd vendor/punch
PYTHONPATH=src python -m unittest discover -s tests -p 'test_*.py' -v
cd ../..
pnpm pg:test
```

Expected: every Punch and Expresso Python test passes, including workflow coverage and CSV failure paths.

- [ ] **Step 3: Run static repository gates**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm format
git diff --check
git -C vendor/punch diff --check
```

Expected: all gates pass and both diff checks print nothing.

- [ ] **Step 4: Prove Punch's official Docker path**

Run from `vendor/punch`:

```bash
docker compose build
docker compose up -d --wait gateway-api
./bin/punch run smoke
./bin/punch run all --collect-logs
python -c "import json; data=json.load(open('reports/state/punch-run.json')); assert data['passed'] is True"
docker compose down --volumes --remove-orphans
```

Expected: each selected workflow performs one Compose run, `all` skips `bff-checkout-journey` without `TARGET_BASE_URL`, and the final evidence is passed.

- [ ] **Step 5: Prove Expresso's official Docker path**

Run from the parent repository:

```bash
docker compose -f infra/docker/compose.performance.yaml build k6
./dev up
./dev perf:smoke
./dev down
```

Expected: the smoke command prints the selected YAML path, issues one explicit Compose run, exits zero, and retains the existing HTML/JSON summary behavior.

- [ ] **Step 6: Verify confirmation and zero-record behavior without a real target**

Run the focused fake-subprocess tests:

```bash
cd vendor/punch
PYTHONPATH=src python -m unittest \
  tests.test_execution.ExecutionTests.test_noninteractive_confirmation_requires_explicit_flag \
  tests.test_execution.ExecutionTests.test_declared_csv_with_zero_tagged_lines_fails \
  tests.test_execution.ExecutionTests.test_harvests_only_stdout_tagged_records_and_publishes_atomically -v
cd ../..
```

Expected: all three pass, proving explicit non-interactive acknowledgement, zero-line failure, stdout-only harvesting, and successful atomic CSV publication.

- [ ] **Step 7: Audit final repository state**

Run:

```bash
git -C vendor/punch status --short
git status --short
git log -3 --oneline
git -C vendor/punch log -4 --oneline
```

Expected: Punch is clean; the parent is clean; the parent gitlink points at the final Punch workflow commit; no generated reports, virtual environments, or secrets are tracked.
