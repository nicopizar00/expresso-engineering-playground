from __future__ import annotations

import json
import os
import sys
import unittest
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import cli, perf_dispatch  # noqa: E402
from pg.paths import PERF_JOBS_DIR  # noqa: E402
from pg.perf_dispatch import INPUTS, env_name, normalize  # noqa: E402
from pg.perf_spec import PRESET, StepRequest, spec_document  # noqa: E402
from pg.perf_workflow import (  # noqa: E402
    RUNNER_WARNING,
    StepRecord,
    parse_steps,
    plan_workflow,
    write_evidence,
)
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_JOBS_DIR)
PRESETS_OFFERED = "use one of: 1 journey, 5 journeys, 1 user for 5 minutes, 5 users for 5 minutes"
STATUS_WORKFLOW = "http-cart -> http-orders -> http-orders-status"
STATUS_WORKLOAD = "Custom: custom/status-regression.json"


def request(kind: str, selection: str, workload: str, sizing: str = "true") -> dict:
    return {"kind": kind, "selection": selection, "workload": workload, "sizing": sizing}


def environ(values: dict, **extra: str) -> dict:
    env = {env_name(name): value for name, value in values.items()}
    env.update(
        GITHUB_EVENT_NAME="workflow_dispatch",
        GITHUB_REF="refs/heads/main",
        GITHUB_SHA="abc123",
        GITHUB_ACTOR="octo",
        GITHUB_RUN_ID="42",
        GITHUB_RUN_ATTEMPT="1",
        PERF_RUNNER_LABEL="ubuntu-latest",
        SECRET_TOKEN="do-not-copy",
    )
    env.update(extra)
    return env


class NormalizeTests(unittest.TestCase):
    def test_the_four_inputs_travel_as_upper_snake_case_env(self) -> None:
        self.assertEqual(INPUTS, ("kind", "selection", "workload", "sizing"))
        self.assertEqual(
            [env_name(name) for name in INPUTS],
            ["PERF_KIND", "PERF_SELECTION", "PERF_WORKLOAD", "PERF_SIZING"],
        )

    def test_a_single_run_gives_its_only_step_the_workload(self) -> None:
        steps, errors = normalize(request("job", "http-purchase", "1 journey"), CATALOG)
        self.assertEqual(errors, [])
        self.assertEqual(
            spec_document(steps)["steps"],
            [{"job": "http-purchase", "load": {"mode": "preset", "value": "1-iteration"}}],
        )

    def test_a_two_step_workflow_gives_the_workload_to_the_last_step_only(self) -> None:
        steps, errors = normalize(
            request("workflow", "http-cart -> http-orders", "5 users for 5 minutes"), CATALOG
        )
        self.assertEqual(errors, [])
        self.assertEqual(
            spec_document(steps)["steps"],
            [
                {"job": "http-cart", "load": {"mode": "auto"}},
                {"job": "http-orders", "load": {"mode": "preset", "value": "5-vu-5m"}},
            ],
        )

    def test_data_sizing_plans_the_same_steps_as_a_local_workflow(self) -> None:
        cases = {
            "http-cart -> http-orders": ["http-cart", "http-orders:5-iterations"],
            STATUS_WORKFLOW: ["http-cart", "http-orders", "http-orders-status:5-iterations"],
        }
        for selection, local in cases.items():
            with self.subTest(selection=selection):
                steps, errors = normalize(request("workflow", selection, "5 journeys"), CATALOG)
                self.assertEqual(errors, [])
                self.assertEqual(steps, parse_steps(local))
        # Each earlier step is sized for the step after it; only the last runs the workload.
        plan = plan_workflow(parse_steps(cases[STATUS_WORKFLOW]), CATALOG)
        self.assertEqual(
            [step.shape_label() for step in plan.steps],
            [
                "auto: sized for step 2 (7 iterations, 1 VU)",
                "auto: sized for step 3 (6 iterations, 1 VU)",
                "5 journeys (5-iterations)",
            ],
        )

    def test_without_data_sizing_every_step_runs_the_workload(self) -> None:
        steps, errors = normalize(
            request("workflow", STATUS_WORKFLOW, "5 journeys", sizing="false"), CATALOG
        )
        self.assertEqual(errors, [])
        load = {"mode": "preset", "value": "5-iterations"}
        self.assertEqual(
            spec_document(steps)["steps"],
            [
                {"job": "http-cart", "load": load},
                {"job": "http-orders", "load": load},
                {"job": "http-orders-status", "load": load},
            ],
        )
        result = plan_workflow(steps, CATALOG)
        self.assertEqual(result.errors, [])
        self.assertEqual([step.sizing for step in result.steps], [None, None, None])
        # Unsized writers still write the datasets their readers read.
        self.assertEqual([step.produce for step in result.steps], [["carts"], ["orders"], []])

    def test_data_sizing_does_not_change_a_single_job(self) -> None:
        for sizing in ("true", "false"):
            with self.subTest(sizing=sizing):
                steps, errors = normalize(
                    request("job", "http-purchase", "1 journey", sizing), CATALOG
                )
                self.assertEqual(errors, [])
                self.assertEqual(steps, [StepRequest("http-purchase", PRESET, "1-iteration")])

    def test_data_sizing_is_true_or_false(self) -> None:
        for sizing in ("", "yes", "True", "0"):
            with self.subTest(sizing=sizing):
                steps, errors = normalize(
                    request("workflow", "http-cart -> http-orders", "5 journeys", sizing), CATALOG
                )
                self.assertEqual(steps, [])
                self.assertEqual(errors, [f"data sizing {sizing!r} must be true or false"])

    def test_a_three_step_workflow_with_a_custom_workload_writes_two_auto_producers(self) -> None:
        steps, errors = normalize(request("workflow", STATUS_WORKFLOW, STATUS_WORKLOAD), CATALOG)
        self.assertEqual(errors, [])
        self.assertEqual(
            spec_document(steps),
            {
                "version": 2,
                "steps": [
                    {"job": "http-cart", "load": {"mode": "auto"}},
                    {"job": "http-orders", "load": {"mode": "auto"}},
                    {
                        "job": "http-orders-status",
                        "load": {"mode": "custom", "path": "custom/status-regression.json"},
                    },
                ],
            },
        )

    def test_a_custom_workload_sizes_both_producers_when_planned(self) -> None:
        steps, _ = normalize(request("workflow", STATUS_WORKFLOW, STATUS_WORKLOAD), CATALOG)
        result = plan_workflow(steps, CATALOG)
        self.assertEqual(result.errors, [])
        cart, orders, _status = result.steps
        # 2 VUs x 10 per-VU iterations = 20 rows; +15% margin = 23; cart: 23 x 1.15 -> 27.
        self.assertEqual((orders.sizing.iterations, orders.sized_for), (23, 3))
        self.assertEqual((cart.sizing.iterations, cart.sized_for), (27, 2))

    def test_a_single_run_of_a_consumer_names_its_producers(self) -> None:
        _steps, errors = normalize(request("job", "http-orders", "1 journey"), CATALOG)
        self.assertEqual(
            errors,
            [
                "http-orders reads data an earlier step writes (carts from browser-cart or "
                "http-cart); run it from perf-workflow.yml"
            ],
        )

    def test_an_unknown_or_stale_workflow_is_rejected(self) -> None:
        steps, errors = normalize(
            request("workflow", "http-orders -> http-cart", "5 journeys"), CATALOG
        )
        self.assertEqual(steps, [])
        self.assertEqual(len(errors), 1)
        self.assertRegex(
            errors[0], r"^unknown or stale workflow 'http-orders -> http-cart'; use one of: "
        )

    def test_an_old_label_an_internal_value_or_a_recased_label_is_not_a_workload(self) -> None:
        for label in (
            "Auto (data-size producer; default otherwise)",
            "Custom config",
            "5-vu-5m",
            "1 Journey",
            " 1 journey",
            "",
        ):
            with self.subTest(label=label):
                steps, errors = normalize(request("job", "http-purchase", label), CATALOG)
                self.assertEqual(steps, [])
                self.assertEqual(len(errors), 1)
                self.assertTrue(
                    errors[0].startswith(f"unknown or stale workload {label!r}; {PRESETS_OFFERED}"),
                    errors[0],
                )

    def test_a_custom_label_for_a_file_the_form_does_not_offer_is_not_resolved(self) -> None:
        for label in (
            "Custom: 1-iteration.json",
            "Custom: custom/missing.json",
            "Custom: custom/../1-iteration.json",
            "Custom:custom/status-regression.json",
        ):
            with self.subTest(label=label):
                steps, errors = normalize(request("job", "http-purchase", label), CATALOG)
                self.assertEqual(steps, [])
                self.assertEqual(len(errors), 1)
                self.assertTrue(
                    errors[0].startswith(f"unknown or stale workload {label!r}; {PRESETS_OFFERED}"),
                    errors[0],
                )

    def test_a_listed_custom_workload_that_escapes_through_a_symlink_is_rejected(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = root / "options"
            (options / "custom").mkdir(parents=True)
            (root / "outside.json").write_text("{}", encoding="utf-8")
            os.symlink(root / "outside.json", options / "custom" / "link.json")
            steps, errors = normalize(
                request("job", "http-purchase", "Custom: custom/link.json"), CATALOG, options
            )
        self.assertEqual(steps, [])
        self.assertEqual(
            errors,
            [
                "workload 'Custom: custom/link.json': custom config 'custom/link.json' resolves "
                "outside tests/performance/k6/options/"
            ],
        )

    def test_selection_and_workload_errors_are_reported_together(self) -> None:
        _steps, errors = normalize(request("job", "nope", "nope"), CATALOG)
        self.assertEqual(len(errors), 2)
        self.assertTrue(errors[0].startswith("unknown job 'nope'"), errors[0])
        self.assertTrue(errors[1].startswith("unknown or stale workload 'nope'"), errors[1])

    def test_an_unknown_kind_is_rejected(self) -> None:
        _steps, errors = normalize(request("graph", "http-purchase", "1 journey"), CATALOG)
        self.assertEqual(errors, ["unknown kind 'graph'; use job or workflow"])

    def test_a_workload_the_planner_refuses_passes_normalization_and_fails_the_plan(self) -> None:
        cases = {
            (
                "job",
                "browser-cart",
                STATUS_WORKLOAD,
            ): "step 1 browser-cart: custom: custom/status-regression.json must set "
            "options.browser.type on every scenario",
            (
                "job",
                "browser-cart",
                "5 users for 5 minutes",
            ): "step 1 browser-cart: a browser job has no 5 users for 5 minutes "
            "(5-vu-5m) preset",
            (
                "workflow",
                "browser-purchase -> http-orders-status",
                "5 users for 5 minutes",
            ): "step 1 browser-purchase: sized for step 2 http-orders-status at 5 users for "
            "5 minutes (5-vu-5m), it needs 81 browser VUs; the cap is 4",
        }
        for (kind, selection, workload), message in cases.items():
            with self.subTest(selection=selection, workload=workload):
                steps, errors = normalize(request(kind, selection, workload), CATALOG)
                self.assertEqual(errors, [])
                plan_errors = plan_workflow(steps, CATALOG).errors
                self.assertEqual(len(plan_errors), 1)
                self.assertTrue(plan_errors[0].startswith(message), plan_errors[0])

    def test_without_data_sizing_a_browser_producer_refuses_a_5_minute_workload(self) -> None:
        steps, errors = normalize(
            request(
                "workflow", "browser-cart -> http-orders", "5 users for 5 minutes", sizing="false"
            ),
            CATALOG,
        )
        self.assertEqual(errors, [])
        plan_errors = plan_workflow(steps, CATALOG).errors
        self.assertEqual(len(plan_errors), 1)
        self.assertTrue(
            plan_errors[0].startswith(
                "step 1 browser-cart: a browser job has no 5 users for 5 minutes (5-vu-5m) preset"
            ),
            plan_errors[0],
        )


class DispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.dir = self.root / "dispatch"
        self.workflow = self.root / "workflow"
        self.output = self.root / "github-output"
        self.step_summary = self.root / "step-summary.md"
        self.out = patch("sys.stdout", StringIO())
        self.out.start()
        # dispatch() clears the workflow evidence; keep it off the real reports directory.
        self.workflow_dir = patch("pg.perf_dispatch.WORKFLOW_REPORTS_DIR", self.workflow)
        self.workflow_dir.start()

    def tearDown(self) -> None:
        self.workflow_dir.stop()
        self.out.stop()
        self.temporary_directory.cleanup()

    def read(self, name: str) -> dict:
        return json.loads((self.dir / name).read_text(encoding="utf-8"))

    def dispatch_job(self) -> None:
        values = request("job", "http-purchase", "1 journey")
        self.assertEqual(perf_dispatch.dispatch(environ(values), self.dir), 0)

    def test_a_valid_dispatch_writes_request_spec_record_and_outputs(self) -> None:
        values = request("workflow", "browser-cart -> http-orders", "1 journey")
        # A leftover per-step value is not one of the four inputs and must not be copied.
        env = environ(values, GITHUB_OUTPUT=str(self.output), PERF_LOAD_1="old-form-value")
        code = perf_dispatch.dispatch(env, self.dir)
        self.assertEqual(code, 0)
        self.assertEqual(self.read("request.json"), values)
        self.assertEqual(
            self.read("spec.json"),
            spec_document(
                [StepRequest("browser-cart"), StepRequest("http-orders", PRESET, "1-iteration")]
            ),
        )
        self.assertEqual((self.dir / "spec.json").stat().st_mode & 0o222, 0)
        record = self.read("dispatch.json")
        self.assertEqual(
            set(record),
            {
                "version",
                "event",
                "actor",
                "run",
                "artifact",
                "runner",
                "stage",
                "status",
                "errors",
                "problems",
            },
        )
        self.assertEqual(record["artifact"], "perf-42-1")
        self.assertEqual(
            record["event"],
            {"name": "workflow_dispatch", "ref": "refs/heads/main", "sha": "abc123"},
        )
        self.assertEqual((record["stage"], record["status"]), ("normalize", None))
        self.assertEqual(self.output.read_text(encoding="utf-8"), "browser=true\n")
        for path in self.dir.iterdir():
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("do-not-copy", text)
            self.assertNotIn("old-form-value", text)

    def test_a_rejected_dispatch_writes_no_spec_and_annotates(self) -> None:
        values = request("workflow", "nope", "5 journeys")
        env = environ(values, GITHUB_OUTPUT=str(self.output))
        with patch.dict("os.environ", {"GITHUB_ACTIONS": "true"}):
            self.assertEqual(perf_dispatch.dispatch(env, self.dir), 1)
        self.assertFalse((self.dir / "spec.json").exists())
        self.assertRegex(
            self.read("dispatch.json")["errors"][0], r"^unknown or stale workflow 'nope'"
        )
        self.assertIn(
            "::error title=Punch dispatch::unknown or stale workflow", sys.stdout.getvalue()
        )
        self.assertFalse(self.output.exists())

    def test_a_new_dispatch_never_keeps_an_earlier_spec(self) -> None:
        self.dispatch_job()
        (self.dir / "compose-logs.txt").write_text("old", encoding="utf-8")
        bad = request("job", "http-purchase", "nope")
        self.assertEqual(perf_dispatch.dispatch(environ(bad), self.dir), 1)
        self.assertEqual(
            sorted(p.name for p in self.dir.iterdir()), ["dispatch.json", "request.json"]
        )

    def test_a_new_dispatch_clears_workflow_evidence_from_an_earlier_run(self) -> None:
        write_evidence(plan_workflow(parse_steps(["http-cart"]), CATALOG), None, self.workflow)
        bad = request("job", "http-orders", "1 journey")
        self.assertEqual(
            perf_dispatch.dispatch(environ(bad), self.dir, workflow_dir=self.workflow), 1
        )
        self.assertFalse(self.workflow.exists())
        self.assertEqual(self.finalize("failure"), 0)
        self.assertTrue(self.summary().startswith("## Rejected: `http-orders`"))

    def test_stage_records_how_far_the_job_got(self) -> None:
        self.dispatch_job()
        self.assertEqual(perf_dispatch.stage("stack", self.dir), 0)
        self.assertEqual(self.read("dispatch.json")["stage"], "stack")
        self.assertEqual(perf_dispatch.stage("teleport", self.dir), 1)

    def test_an_unknown_workload_is_rejected_before_docker_and_recorded(self) -> None:
        values = request("workflow", "http-cart -> http-orders", "Custom config")
        self.assertEqual(perf_dispatch.dispatch(environ(values), self.dir), 1)
        self.assertFalse((self.dir / "spec.json").exists())
        self.assertEqual(self.read("request.json"), values)
        self.assertRegex(
            self.read("dispatch.json")["errors"][0], r"^unknown or stale workload 'Custom config'"
        )
        self.assertEqual(self.finalize("failure"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "rejected")
        self.assertTrue(self.summary().startswith("## Rejected: `http-cart -> http-orders`"))
        self.assertIn("unknown or stale workload 'Custom config'", self.summary())

    # --- finalize ---------------------------------------------------------

    def workflow_evidence(self, passed: bool, with_summary: bool = True) -> None:
        plan = plan_workflow(parse_steps(["http-purchase"]), CATALOG)
        summary = self.root / "http-purchase-summary.json"
        if with_summary:
            summary.write_text("{}", encoding="utf-8")
        record = StepRecord(
            plan.steps[0],
            "passed" if passed else "failed",
            exit_code=0 if passed else 99,
            summary=str(summary),
            seconds=1.0,
        )
        write_evidence(plan, [record], self.workflow)

    def finalize(self, job: str) -> int:
        env = environ(request("job", "http-purchase", "1 journey"), PERF_JOB_STATUS=job)
        return perf_dispatch.finalize(env, self.dir, self.workflow)

    def summary(self) -> str:
        return (self.dir / "summary.md").read_text(encoding="utf-8")

    def test_a_rejected_dispatch_finalizes_as_rejected(self) -> None:
        perf_dispatch.dispatch(environ(request("job", "nope", "1 journey")), self.dir)
        self.assertEqual(self.finalize("failure"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "rejected")
        self.assertTrue(self.summary().startswith("## Rejected: `nope`"))
        self.assertIn("unknown job 'nope'", self.summary())
        self.assertIn("> The app and k6 share one GitHub-hosted runner.", self.summary())

    def test_a_passed_workflow_with_evidence_finalizes_as_passed(self) -> None:
        self.dispatch_job()
        self.workflow_evidence(passed=True)
        self.assertEqual(self.finalize("success"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "passed")
        self.assertTrue(self.summary().startswith("## Passed: http-purchase"))
        self.assertIn("\n\nRun:\n\n- Ref: `refs/heads/main` at `abc123`", self.summary())

    def test_a_passed_step_without_a_k6_summary_fails_the_job(self) -> None:
        self.dispatch_job()
        self.workflow_evidence(passed=True, with_summary=False)
        self.assertEqual(self.finalize("success"), 1)
        record = self.read("dispatch.json")
        self.assertEqual(record["status"], "failed")
        self.assertEqual(
            record["problems"],
            ["step 1 http-purchase passed but left no k6 summary in the evidence"],
        )
        self.assertTrue(self.summary().startswith("## Failed: http-purchase"))

    def test_a_cancelled_job_is_recorded_as_cancelled_without_evidence_errors(self) -> None:
        self.dispatch_job()
        perf_dispatch.stage("execute", self.dir)
        self.assertEqual(self.finalize("cancelled"), 0)
        record = self.read("dispatch.json")
        self.assertEqual((record["status"], record["problems"]), ("cancelled", []))
        # No workflow.json yet, so the heading quotes the form's selection.
        self.assertTrue(self.summary().startswith("## Failed: `http-purchase`"))
        self.assertIn("- The run was cancelled.", self.summary())

    def test_a_stack_failure_after_planning_says_where_the_job_stopped(self) -> None:
        self.dispatch_job()
        write_evidence(plan_workflow(parse_steps(["http-purchase"]), CATALOG), None, self.workflow)
        perf_dispatch.stage("stack", self.dir)
        self.assertEqual(self.finalize("failure"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "failed")
        self.assertIn(
            "- The GitHub job stopped at the stack stage before any step ran.", self.summary()
        )
        # The plan's steps never ran: they are not "planned" any more.
        self.assertIn("| none | not run | — |", self.summary())
        self.assertNotIn("planned", self.summary())

    def test_a_job_that_stopped_during_execution_does_not_claim_no_step_ran(self) -> None:
        self.dispatch_job()
        perf_dispatch.stage("execute", self.dir)
        self.assertEqual(self.finalize("failure"), 0)
        self.assertNotIn("before any step ran", self.summary())
        self.assertIn(
            "- The GitHub job stopped during the execute stage before the Punch workflow wrote "
            "its evidence (`workflow.json`); files from steps that ran are under "
            "`workflow/step-<n>-<job>/`.",
            self.summary(),
        )

    def test_a_job_that_failed_before_dispatch_still_gets_a_record(self) -> None:
        # Only what _perf-execute.yml gives the finalize step: no form record exists yet.
        env = {
            "GITHUB_ACTOR": "octo",
            "PERF_JOB_STATUS": "failure",
            "PERF_SELECTION": "http-purchase",
        }
        self.assertEqual(perf_dispatch.finalize(env, self.dir, self.workflow), 0)
        record = self.read("dispatch.json")
        self.assertEqual((record["stage"], record["status"]), ("setup", "failed"))
        self.assertTrue(self.summary().startswith("## Failed: `http-purchase`"))
        self.assertIn(
            "- The GitHub job stopped at the setup stage before any step ran.", self.summary()
        )

    def test_finalize_reads_the_workflow_directory_that_dispatch_clears(self) -> None:
        self.dispatch_job()
        self.workflow_evidence(passed=False)
        env = environ(request("job", "http-purchase", "1 journey"), PERF_JOB_STATUS="failure")
        self.assertEqual(perf_dispatch.finalize(env, self.dir), 0)
        self.assertTrue(self.summary().startswith("## Failed at step 1 http-purchase"))

    # --- publish ----------------------------------------------------------

    def test_publish_appends_the_summary_and_artifact_link(self) -> None:
        self.dispatch_job()
        self.workflow_evidence(passed=True)
        self.finalize("success")
        env = environ(
            {},
            GITHUB_STEP_SUMMARY=str(self.step_summary),
            PERF_ARTIFACT_URL="https://github.com/o/r/actions/runs/42/artifacts/7",
            PERF_ARTIFACT_DIGEST="deadbeef",
        )
        self.assertEqual(perf_dispatch.publish(env, self.dir), 0)
        text = self.step_summary.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("## Passed: http-purchase"))
        self.assertIn(
            "- Artifact: [perf-42-1](https://github.com/o/r/actions/runs/42/artifacts/7), "
            "SHA-256 `deadbeef`",
            text,
        )

    def test_a_passed_run_without_an_uploaded_artifact_is_not_reported_as_passed(self) -> None:
        self.dispatch_job()
        self.workflow_evidence(passed=True)
        self.finalize("success")
        env = environ({}, GITHUB_STEP_SUMMARY=str(self.step_summary))
        self.assertEqual(perf_dispatch.publish(env, self.dir), 1)
        text = self.step_summary.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("## Failed: http-purchase"))
        self.assertIn("- The evidence artifact was not uploaded.", text)
        self.assertNotIn("## Passed", text)

    def test_a_missing_job_summary_still_carries_the_runner_warning(self) -> None:
        env = environ({}, GITHUB_STEP_SUMMARY=str(self.step_summary))
        perf_dispatch.publish(env, self.dir)
        text = self.step_summary.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("## Failed: no job summary was written\n\n"))
        self.assertIn(RUNNER_WARNING, text)

    def test_publish_without_an_artifact_fails(self) -> None:
        env = environ({}, GITHUB_STEP_SUMMARY=str(self.step_summary))
        self.assertEqual(perf_dispatch.publish(env, self.dir), 1)
        self.assertIn("- Artifact: not uploaded", self.step_summary.read_text(encoding="utf-8"))

    def test_the_command_is_registered(self) -> None:
        self.assertIn("perf:dispatch", cli.COMMANDS)


if __name__ == "__main__":
    unittest.main()
