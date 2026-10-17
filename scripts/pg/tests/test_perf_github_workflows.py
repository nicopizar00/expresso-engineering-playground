from __future__ import annotations

import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.paths import PERF_WORKFLOWS_DIR, REPO_ROOT  # noqa: E402
from pg.perf_dispatch import INPUTS, env_name  # noqa: E402
from pg.perf_forms import (  # noqa: E402
    FORM_FILES,
    LOAD_LABELS,
    option_blocks,
    recipes,
    render,
    sequence_label,
    standalone,
)
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_WORKFLOWS_DIR)
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
EXECUTE = "./.github/workflows/_perf-execute.yml"
LABELS = [label for label, _ in LOAD_LABELS]
AUTO_LABEL = LABELS[0]


def load(name: str) -> dict:
    return yaml.safe_load((WORKFLOWS / name).read_text(encoding="utf-8"))


def expression(name: str) -> str:
    return "${{ " + name + " }}"


class FormTests(unittest.TestCase):
    def test_the_old_form_is_gone(self) -> None:
        self.assertFalse((WORKFLOWS / "perf.yml").exists())

    def test_committed_forms_match_the_catalog(self) -> None:
        blocks, _ = option_blocks(CATALOG)
        for path in FORM_FILES:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertEqual(
                    render(text, blocks, path.name), text, "run ./dev perf:forms --write"
                )

    def test_the_single_form_offers_standalone_workflows_and_every_load(self) -> None:
        form = load("perf-run.yml")
        # PyYAML reads the bare `on` key as the boolean True.
        self.assertEqual(list(form[True]), ["workflow_dispatch"])
        inputs = form[True]["workflow_dispatch"]["inputs"]
        self.assertEqual(list(inputs), ["workflow", "load", "config"])
        self.assertEqual(inputs["workflow"]["options"], standalone(CATALOG))
        self.assertIn(inputs["workflow"]["default"], inputs["workflow"]["options"])
        self.assertEqual(inputs["load"]["options"], LABELS)
        self.assertEqual(inputs["load"]["default"], "1 journey")
        self.assertEqual(inputs["config"]["type"], "string")
        self.assertIn("github.actor", form["run-name"])
        self.assertIn("inputs.workflow", form["run-name"])
        self.assertEqual(form["permissions"], {"contents": "read"})
        job = form["jobs"]["run"]
        self.assertEqual(job["uses"], EXECUTE)
        self.assertEqual(job["with"], {
            "kind": "single",
            "selection": expression("inputs.workflow"),
            "load-1": expression("inputs.load"),
            "config-1": expression("inputs.config"),
        })

    def test_the_chain_form_offers_recipes_and_four_step_slots(self) -> None:
        form = load("perf-chain.yml")
        self.assertEqual(list(form[True]), ["workflow_dispatch"])
        inputs = form[True]["workflow_dispatch"]["inputs"]
        slots = [f"step{n}-{field}" for n in range(1, 5) for field in ("load", "config")]
        self.assertEqual(list(inputs), ["sequence", *slots])
        kept, _ = recipes(CATALOG)
        self.assertEqual(inputs["sequence"]["options"], [sequence_label(path) for path in kept])
        self.assertIn(inputs["sequence"]["default"], inputs["sequence"]["options"])
        for n in range(1, 5):
            with self.subTest(step=n):
                self.assertEqual(inputs[f"step{n}-load"]["options"], LABELS)
                self.assertEqual(inputs[f"step{n}-load"]["default"], AUTO_LABEL)
                self.assertEqual(inputs[f"step{n}-config"]["type"], "string")
        self.assertIn("github.actor", form["run-name"])
        self.assertIn("inputs.sequence", form["run-name"])
        self.assertEqual(form["permissions"], {"contents": "read"})
        job = form["jobs"]["run"]
        self.assertEqual(job["uses"], EXECUTE)
        expected = {"kind": "chain", "selection": expression("inputs.sequence")}
        for n in range(1, 5):
            expected[f"load-{n}"] = expression(f"inputs.step{n}-load")
            expected[f"config-{n}"] = expression(f"inputs.step{n}-config")
        self.assertEqual(job["with"], expected)


class ExecuteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workflow = load("_perf-execute.yml")
        self.job = self.workflow["jobs"]["execute"]
        self.steps = self.job["steps"]

    def step(self, name: str) -> dict:
        return next(step for step in self.steps if step.get("name") == name)

    def index(self, name: str) -> int:
        return self.steps.index(self.step(name))

    def test_it_is_callable_only_with_the_ten_string_inputs(self) -> None:
        self.assertEqual(list(self.workflow[True]), ["workflow_call"])
        inputs = self.workflow[True]["workflow_call"]["inputs"]
        self.assertEqual(list(inputs), list(INPUTS))
        for name, spec in inputs.items():
            with self.subTest(input=name):
                self.assertEqual(spec["type"], "string")
        self.assertTrue(inputs["kind"]["required"])
        self.assertTrue(inputs["selection"]["required"])

    def test_one_read_only_job_bounded_to_an_hour(self) -> None:
        self.assertEqual(list(self.workflow["jobs"]), ["execute"])
        self.assertEqual(self.workflow["permissions"], {"contents": "read"})
        self.assertEqual(self.job["permissions"], {"contents": "read"})
        self.assertEqual(self.job["timeout-minutes"], 60)
        self.assertEqual(self.job["runs-on"], "ubuntu-latest")
        self.assertEqual(self.workflow["defaults"], {"run": {"shell": "bash"}})

    def test_checkout_and_python_setup(self) -> None:
        self.assertEqual(
            self.steps[0], {"uses": "actions/checkout@v4", "with": {"submodules": "recursive"}}
        )
        self.assertEqual(self.steps[1], {"uses": "actions/setup-python@v5", "with": {
            "python-version": "3.11", "cache": "pip",
            "cache-dependency-path": "vendor/punch/requirements.txt",
        }})

    def test_form_values_reach_the_dispatcher_only_as_environment_data(self) -> None:
        step = self.step("Normalize the form values")
        self.assertEqual(step["run"], "./dev perf:dispatch")
        for name in INPUTS:
            self.assertEqual(step["env"][env_name(name)], expression(f"inputs.{name}"))
        for each in self.steps:
            with self.subTest(step=each.get("name")):
                self.assertNotIn("${{", each.get("run", ""), "inputs must reach run: through env")
                self.assertNotIn("eval", each.get("run", ""))

    def test_the_plan_runs_before_the_stack_and_execution_runs_the_same_spec(self) -> None:
        order = [
            "Normalize the form values", "Plan the run", "Start the stack",
            "Build the k6 images", "Let k6 write its reports", "Run the plan",
        ]
        indexes = [self.index(name) for name in order]
        self.assertEqual(indexes, sorted(indexes))
        self.assertIn('./dev perf:chain --spec "$SPEC" --plan', self.step("Plan the run")["run"])
        self.assertIn(
            './dev perf:chain --spec "$SPEC"\n', self.step("Run the plan")["run"] + "\n"
        )
        self.assertEqual(
            self.job["env"]["SPEC"], "tests/performance/k6/reports/dispatch/spec.json"
        )
        self.assertIn("compose.performance.yaml build", self.step("Build the k6 images")["run"])
        self.assertEqual(
            self.step("Let k6 write its reports")["run"], "chmod a+w tests/performance/k6/reports"
        )

    def test_stack_failure_keeps_compose_diagnostics(self) -> None:
        run = self.step("Start the stack")["run"]
        self.assertIn("logs --tail=200", run)
        # Under pipefail a failed capture would exit before the next one and the error line.
        self.assertIn('"$DISPATCH_DIR/compose-ps.txt" || true', run)
        self.assertIn('"$DISPATCH_DIR/compose-logs.txt" || true', run)

    def test_evidence_steps_always_run_and_upload_once(self) -> None:
        order = [
            "Finalize the dispatch record", "Upload evidence", "Job summary", "Tear down the stack",
        ]
        indexes = [self.index(name) for name in order]
        self.assertEqual(indexes, sorted(indexes))
        self.assertEqual(indexes[-1], len(self.steps) - 1)
        for name in order:
            self.assertEqual(self.step(name)["if"], "always()")
        uploads = [s for s in self.steps if s.get("uses", "").startswith("actions/upload-artifact")]
        self.assertEqual(len(uploads), 1)
        self.assertEqual(uploads[0]["uses"], "actions/upload-artifact@v4")
        self.assertEqual(uploads[0]["with"], {
            "name": "perf-${{ github.run_id }}-${{ github.run_attempt }}",
            "path": "tests/performance/k6/reports/",
            "if-no-files-found": "error",
        })
        # The selection names the run even when the job failed before perf:dispatch.
        self.assertEqual(
            self.step("Finalize the dispatch record")["env"],
            {"PERF_JOB_STATUS": "${{ job.status }}", "PERF_SELECTION": "${{ inputs.selection }}"},
        )
        self.assertEqual(self.step("Job summary")["env"], {
            "PERF_ARTIFACT_URL": "${{ steps.upload.outputs.artifact-url }}",
            "PERF_ARTIFACT_DIGEST": "${{ steps.upload.outputs.artifact-digest }}",
        })
        self.assertIn("::warning", self.step("Tear down the stack")["run"])


if __name__ == "__main__":
    unittest.main()
