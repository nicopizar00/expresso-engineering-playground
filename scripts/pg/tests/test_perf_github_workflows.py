from __future__ import annotations

import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.paths import PERF_JOBS_DIR, REPO_ROOT  # noqa: E402
from pg.perf_dispatch import INPUTS, env_name  # noqa: E402
from pg.perf_forms import (  # noqa: E402
    FORM_FILES,
    option_blocks,
    profiles,
    render,
    standalone,
    workflow_label,
    workflows,
)
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_JOBS_DIR)
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
EXECUTE = "./.github/workflows/_perf-execute.yml"


def load(name: str) -> dict:
    return yaml.safe_load((WORKFLOWS / name).read_text(encoding="utf-8"))


def expression(name: str) -> str:
    return "${{ " + name + " }}"


class FormTests(unittest.TestCase):
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

    def test_committed_forms_match_the_catalog(self) -> None:
        blocks, _ = option_blocks(CATALOG)
        for path in FORM_FILES:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertEqual(
                    render(text, blocks, path.name), text, "run ./dev perf:forms --write"
                )

    def test_the_job_form_has_a_job_and_a_profile(self) -> None:
        form = load("perf-job.yml")
        # PyYAML reads the bare `on` key as the boolean True.
        self.assertEqual(list(form[True]), ["workflow_dispatch"])
        inputs = form[True]["workflow_dispatch"]["inputs"]
        self.assertEqual(list(inputs), ["job", "profile"])
        self.assertEqual(inputs["job"]["options"], standalone(CATALOG))
        self.assertIn(inputs["job"]["default"], inputs["job"]["options"])
        self.assertEqual(inputs["profile"]["type"], "choice")
        self.assertEqual(inputs["profile"]["options"], profiles())
        self.assertEqual(inputs["profile"]["default"], "1 journey")
        for name in ("github.actor", "inputs.job", "inputs.profile"):
            self.assertIn(name, form["run-name"])
        self.assertEqual(form["permissions"], {"contents": "read"})
        job = form["jobs"]["run"]
        self.assertEqual(job["uses"], EXECUTE)
        self.assertEqual(
            job["with"],
            {
                "kind": "job",
                "selection": expression("inputs.job"),
                "profile": expression("inputs.profile"),
            },
        )

    def test_the_workflow_form_has_a_workflow_and_a_target_profile(self) -> None:
        form = load("perf-workflow.yml")
        self.assertEqual(list(form[True]), ["workflow_dispatch"])
        inputs = form[True]["workflow_dispatch"]["inputs"]
        self.assertEqual(list(inputs), ["workflow", "target-profile"])
        kept, _ = workflows(CATALOG)
        self.assertEqual(inputs["workflow"]["options"], [workflow_label(path) for path in kept])
        self.assertIn(inputs["workflow"]["default"], inputs["workflow"]["options"])
        target = inputs["target-profile"]
        self.assertEqual(target["type"], "choice")
        self.assertEqual(target["options"], profiles())
        self.assertEqual([o for o in target["options"] if o.startswith("Auto")], [])
        self.assertEqual(target["default"], "5 journeys")
        for name in ("github.actor", "inputs.workflow", "inputs.target-profile"):
            self.assertIn(name, form["run-name"])
        self.assertEqual(form["permissions"], {"contents": "read"})
        job = form["jobs"]["run"]
        self.assertEqual(job["uses"], EXECUTE)
        self.assertEqual(
            job["with"],
            {
                "kind": "workflow",
                "selection": expression("inputs.workflow"),
                "profile": expression("inputs.target-profile"),
            },
        )


class ExecuteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workflow = load("_perf-execute.yml")
        self.job = self.workflow["jobs"]["execute"]
        self.steps = self.job["steps"]

    def step(self, name: str) -> dict:
        return next(step for step in self.steps if step.get("name") == name)

    def index(self, name: str) -> int:
        return self.steps.index(self.step(name))

    def test_it_is_callable_only_with_the_three_string_inputs(self) -> None:
        self.assertEqual(list(self.workflow[True]), ["workflow_call"])
        inputs = self.workflow[True]["workflow_call"]["inputs"]
        self.assertEqual(list(inputs), ["kind", "selection", "profile"])
        self.assertEqual(list(inputs), list(INPUTS))
        for name, spec in inputs.items():
            with self.subTest(input=name):
                self.assertEqual(spec["type"], "string")
                self.assertTrue(spec["required"])

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
        self.assertEqual(
            self.steps[1],
            {
                "uses": "actions/setup-python@v5",
                "with": {
                    "python-version": "3.11",
                    "cache": "pip",
                    "cache-dependency-path": "vendor/punch/requirements.txt",
                },
            },
        )

    def test_form_values_reach_the_dispatcher_only_as_environment_data(self) -> None:
        step = self.step("Normalize the form values")
        self.assertEqual(step["run"], "./dev perf:dispatch")
        self.assertEqual(
            step["env"],
            {
                **{env_name(name): expression(f"inputs.{name}") for name in INPUTS},
                "PERF_RUNNER_LABEL": "ubuntu-latest",
            },
        )
        for each in self.steps:
            with self.subTest(step=each.get("name")):
                self.assertNotIn("${{", each.get("run", ""), "inputs must reach run: through env")
                self.assertNotIn("eval", each.get("run", ""))

    def test_the_plan_runs_before_the_stack_and_execution_runs_the_same_spec(self) -> None:
        order = [
            "Normalize the form values",
            "Plan the run",
            "Start the stack",
            "Build the k6 images",
            "Let k6 write its reports",
            "Run the plan",
        ]
        indexes = [self.index(name) for name in order]
        self.assertEqual(indexes, sorted(indexes))
        self.assertIn('./dev perf:workflow --spec "$SPEC" --plan', self.step("Plan the run")["run"])
        self.assertIn(
            './dev perf:workflow --spec "$SPEC"\n', self.step("Run the plan")["run"] + "\n"
        )
        self.assertEqual(self.job["env"]["SPEC"], "tests/performance/k6/reports/dispatch/spec.json")
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
            "Finalize the dispatch record",
            "Upload evidence",
            "Job summary",
            "Tear down the stack",
        ]
        indexes = [self.index(name) for name in order]
        self.assertEqual(indexes, sorted(indexes))
        self.assertEqual(indexes[-1], len(self.steps) - 1)
        for name in order:
            self.assertEqual(self.step(name)["if"], "always()")
        uploads = [s for s in self.steps if s.get("uses", "").startswith("actions/upload-artifact")]
        self.assertEqual(len(uploads), 1)
        self.assertEqual(uploads[0]["uses"], "actions/upload-artifact@v4")
        self.assertEqual(
            uploads[0]["with"],
            {
                "name": "perf-${{ github.run_id }}-${{ github.run_attempt }}",
                "path": "tests/performance/k6/reports/",
                "if-no-files-found": "error",
            },
        )
        # The selection names the run even when the job failed before perf:dispatch.
        self.assertEqual(
            self.step("Finalize the dispatch record")["env"],
            {"PERF_JOB_STATUS": "${{ job.status }}", "PERF_SELECTION": "${{ inputs.selection }}"},
        )
        self.assertEqual(
            self.step("Job summary")["env"],
            {
                "PERF_ARTIFACT_URL": "${{ steps.upload.outputs.artifact-url }}",
                "PERF_ARTIFACT_DIGEST": "${{ steps.upload.outputs.artifact-digest }}",
            },
        )
        self.assertIn("::warning", self.step("Tear down the stack")["run"])


if __name__ == "__main__":
    unittest.main()
