from __future__ import annotations

import json
import sys
import unittest
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import cli, perf_dispatch  # noqa: E402
from pg.paths import PERF_WORKFLOWS_DIR  # noqa: E402
from pg.perf_chain import StepRecord, parse_steps, plan_chain, write_evidence  # noqa: E402
from pg.perf_dispatch import INPUTS, env_name, normalize  # noqa: E402
from pg.perf_spec import CUSTOM, PRESET, StepRequest, spec_document  # noqa: E402
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_WORKFLOWS_DIR)
AUTO_LABEL = "Auto (data-size producer; default otherwise)"


def request(kind: str, selection: str, *slots) -> dict:
    values = {name: "" for name in INPUTS}
    values.update(kind=kind, selection=selection)
    for number, (load, config) in enumerate(slots, start=1):
        values[f"load-{number}"], values[f"config-{number}"] = load, config
    return values


def environ(values: dict, **extra: str) -> dict:
    env = {env_name(name): value for name, value in values.items()}
    env.update(
        GITHUB_EVENT_NAME="workflow_dispatch", GITHUB_REF="refs/heads/main", GITHUB_SHA="abc123",
        GITHUB_ACTOR="octo", GITHUB_RUN_ID="42", GITHUB_RUN_ATTEMPT="1",
        PERF_RUNNER_LABEL="ubuntu-latest", SECRET_TOKEN="do-not-copy",
    )
    env.update(extra)
    return env


class NormalizeTests(unittest.TestCase):
    def test_env_names_are_upper_snake_case(self) -> None:
        self.assertEqual(env_name("load-1"), "PERF_LOAD_1")
        self.assertEqual(len(INPUTS), 10)

    def test_a_single_run_fills_only_the_first_slot(self) -> None:
        steps, errors = normalize(
            request("single", "http-purchase", ("1 journey", ""), ("garbage", "x.txt")), CATALOG
        )
        self.assertEqual(errors, [])
        self.assertEqual(steps, [StepRequest("http-purchase", PRESET, "1-iteration")])

    def test_a_single_run_of_a_consumer_names_its_producers(self) -> None:
        _steps, errors = normalize(request("single", "http-orders", ("1 journey", "")), CATALOG)
        self.assertEqual(
            errors,
            ["http-orders reads data an earlier step writes (carts from browser-cart or "
             "http-cart); run it from perf-chain.yml"],
        )

    def test_a_chain_translates_labels_into_the_spec_contract(self) -> None:
        steps, errors = normalize(
            request(
                "chain", "http-cart -> http-orders -> http-orders-status",
                (AUTO_LABEL, ""), ("5 users for 5 minutes", ""),
                ("Custom config", "custom/status-regression.json"), ("Custom config", ""),
            ),
            CATALOG,
        )
        self.assertEqual(errors, [])  # slot 4 is inactive: its empty custom path is ignored
        self.assertEqual(
            spec_document(steps)["steps"],
            [
                {"workflow": "http-cart", "load": {"mode": "auto"}},
                {"workflow": "http-orders", "load": {"mode": "preset", "value": "5-vu-5m"}},
                {"workflow": "http-orders-status",
                 "load": {"mode": "custom", "path": "custom/status-regression.json"}},
            ],
        )

    def test_an_unknown_or_stale_sequence_is_rejected(self) -> None:
        steps, errors = normalize(
            request("chain", "http-orders -> http-cart", (AUTO_LABEL, "")), CATALOG
        )
        self.assertEqual(steps, [])
        self.assertRegex(
            errors[0], r"^unknown or stale sequence 'http-orders -> http-cart'; use one of: "
        )

    def test_an_internal_load_value_or_a_recased_label_is_rejected_naming_the_labels(self) -> None:
        for label in ("5-vu-5m", "1 Journey", " 1 journey"):
            with self.subTest(label=label):
                _steps, errors = normalize(request("single", "http-purchase", (label, "")), CATALOG)
                self.assertEqual(len(errors), 1)
                self.assertIn(f"unknown load {label!r}", errors[0])
                self.assertIn("1 journey, 5 journeys", errors[0])

    def test_custom_path_rules_apply_to_active_slots(self) -> None:
        cases = {
            ("Custom config", ""): "needs a JSON path relative to",
            ("Custom config", "../workflows/http-cart.yaml"): "must not contain '..'",
            ("1 journey", "custom/status-regression.json"):
                "a custom config path was given with load '1 journey'",
        }
        for slot, message in cases.items():
            with self.subTest(slot=slot):
                _steps, errors = normalize(request("single", "http-purchase", slot), CATALOG)
                self.assertEqual(len(errors), 1)
                self.assertIn(message, errors[0])

    def test_an_unknown_kind_is_rejected(self) -> None:
        _steps, errors = normalize(request("graph", "http-purchase", ("1 journey", "")), CATALOG)
        self.assertEqual(errors, ["unknown kind 'graph'; use single or chain"])

    def test_custom_requests_keep_the_form_path(self) -> None:
        steps, _ = normalize(
            request("single", "http-purchase", ("Custom config", "custom/status-regression.json")),
            CATALOG,
        )
        self.assertEqual(
            steps, [StepRequest("http-purchase", CUSTOM, "custom/status-regression.json")]
        )


class DispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.dir = self.root / "dispatch"
        self.chain = self.root / "chain"
        self.output = self.root / "github-output"
        self.step_summary = self.root / "step-summary.md"
        self.out = patch("sys.stdout", StringIO())
        self.out.start()
        # dispatch() clears the chain evidence; keep it off the real reports directory.
        self.chain_dir = patch("pg.perf_dispatch.CHAIN_REPORTS_DIR", self.chain)
        self.chain_dir.start()

    def tearDown(self) -> None:
        self.chain_dir.stop()
        self.out.stop()
        self.temporary_directory.cleanup()

    def read(self, name: str) -> dict:
        return json.loads((self.dir / name).read_text(encoding="utf-8"))

    def dispatch_single(self) -> None:
        values = request("single", "http-purchase", ("1 journey", ""))
        self.assertEqual(perf_dispatch.dispatch(environ(values), self.dir), 0)

    def test_a_valid_dispatch_writes_request_spec_record_and_outputs(self) -> None:
        values = request(
            "chain", "browser-cart -> http-orders", (AUTO_LABEL, ""), ("1 journey", "")
        )
        code = perf_dispatch.dispatch(environ(values, GITHUB_OUTPUT=str(self.output)), self.dir)
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
            {"version", "event", "actor", "run", "artifact", "runner", "stage", "status",
             "errors", "problems"},
        )
        self.assertEqual(record["artifact"], "perf-42-1")
        self.assertEqual(
            record["event"],
            {"name": "workflow_dispatch", "ref": "refs/heads/main", "sha": "abc123"},
        )
        self.assertEqual((record["stage"], record["status"]), ("normalize", None))
        self.assertEqual(self.output.read_text(encoding="utf-8"), "browser=true\n")
        for path in self.dir.iterdir():
            self.assertNotIn("do-not-copy", path.read_text(encoding="utf-8"))

    def test_a_rejected_dispatch_writes_no_spec_and_annotates(self) -> None:
        values = request("chain", "nope", (AUTO_LABEL, ""))
        env = environ(values, GITHUB_OUTPUT=str(self.output))
        with patch.dict("os.environ", {"GITHUB_ACTIONS": "true"}):
            self.assertEqual(perf_dispatch.dispatch(env, self.dir), 1)
        self.assertFalse((self.dir / "spec.json").exists())
        self.assertRegex(
            self.read("dispatch.json")["errors"][0], r"^unknown or stale sequence 'nope'"
        )
        self.assertIn(
            "::error title=Punch dispatch::unknown or stale sequence", sys.stdout.getvalue()
        )
        self.assertFalse(self.output.exists())

    def test_a_new_dispatch_never_keeps_an_earlier_spec(self) -> None:
        self.dispatch_single()
        (self.dir / "compose-logs.txt").write_text("old", encoding="utf-8")
        bad = request("single", "http-purchase", ("nope", ""))
        self.assertEqual(perf_dispatch.dispatch(environ(bad), self.dir), 1)
        self.assertEqual(
            sorted(p.name for p in self.dir.iterdir()), ["dispatch.json", "request.json"]
        )

    def test_a_new_dispatch_clears_chain_evidence_from_an_earlier_run(self) -> None:
        write_evidence(plan_chain(parse_steps(["http-cart"]), CATALOG), None, self.chain)
        bad = request("single", "http-orders", ("1 journey", ""))
        self.assertEqual(perf_dispatch.dispatch(environ(bad), self.dir, chain_dir=self.chain), 1)
        self.assertFalse(self.chain.exists())
        self.assertEqual(self.finalize("failure"), 0)
        self.assertTrue(self.summary().startswith("## Rejected: `http-orders`"))

    def test_stage_records_how_far_the_job_got(self) -> None:
        self.dispatch_single()
        self.assertEqual(perf_dispatch.stage("stack", self.dir), 0)
        self.assertEqual(self.read("dispatch.json")["stage"], "stack")
        self.assertEqual(perf_dispatch.stage("teleport", self.dir), 1)

    # --- finalize ---------------------------------------------------------

    def chain_evidence(self, passed: bool, with_summary: bool = True) -> None:
        plan = plan_chain(parse_steps(["http-purchase"]), CATALOG)
        summary = self.root / "http-purchase-summary.json"
        if with_summary:
            summary.write_text("{}", encoding="utf-8")
        record = StepRecord(
            plan.steps[0], "passed" if passed else "failed", exit_code=0 if passed else 99,
            summary=str(summary), seconds=1.0,
        )
        write_evidence(plan, [record], self.chain)

    def finalize(self, job: str) -> int:
        env = environ(request("single", "http-purchase", ("1 journey", "")), PERF_JOB_STATUS=job)
        return perf_dispatch.finalize(env, self.dir, self.chain)

    def summary(self) -> str:
        return (self.dir / "summary.md").read_text(encoding="utf-8")

    def test_a_rejected_dispatch_finalizes_as_rejected(self) -> None:
        perf_dispatch.dispatch(environ(request("single", "nope", ("1 journey", ""))), self.dir)
        self.assertEqual(self.finalize("failure"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "rejected")
        self.assertTrue(self.summary().startswith("## Rejected: `nope`"))
        self.assertIn("unknown workflow 'nope'", self.summary())
        self.assertIn("> The app and k6 share one GitHub-hosted runner.", self.summary())

    def test_a_passed_chain_with_evidence_finalizes_as_passed(self) -> None:
        self.dispatch_single()
        self.chain_evidence(passed=True)
        self.assertEqual(self.finalize("success"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "passed")
        self.assertTrue(self.summary().startswith("## Passed: http-purchase"))
        self.assertIn("- Ref: `refs/heads/main` at `abc123`", self.summary())

    def test_a_passed_step_without_a_k6_summary_fails_the_job(self) -> None:
        self.dispatch_single()
        self.chain_evidence(passed=True, with_summary=False)
        self.assertEqual(self.finalize("success"), 1)
        record = self.read("dispatch.json")
        self.assertEqual(record["status"], "failed")
        self.assertEqual(
            record["problems"],
            ["step 1 http-purchase passed but left no k6 summary in the evidence"],
        )
        self.assertTrue(self.summary().startswith("## Failed: http-purchase"))

    def test_a_cancelled_job_is_recorded_as_cancelled_without_evidence_errors(self) -> None:
        self.dispatch_single()
        perf_dispatch.stage("execute", self.dir)
        self.assertEqual(self.finalize("cancelled"), 0)
        record = self.read("dispatch.json")
        self.assertEqual((record["status"], record["problems"]), ("cancelled", []))
        # No chain.json yet, so the heading quotes the form's selection.
        self.assertTrue(self.summary().startswith("## Failed: `http-purchase`"))
        self.assertIn("- The run was cancelled.", self.summary())

    def test_a_stack_failure_after_planning_says_where_the_job_stopped(self) -> None:
        self.dispatch_single()
        write_evidence(plan_chain(parse_steps(["http-purchase"]), CATALOG), None, self.chain)
        perf_dispatch.stage("stack", self.dir)
        self.assertEqual(self.finalize("failure"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "failed")
        self.assertIn("- The job stopped at the stack stage before any step ran.", self.summary())

    def test_a_job_that_failed_before_dispatch_still_gets_a_record(self) -> None:
        self.assertEqual(self.finalize("failure"), 0)
        record = self.read("dispatch.json")
        self.assertEqual((record["stage"], record["status"]), ("setup", "failed"))

    # --- publish ----------------------------------------------------------

    def test_publish_appends_the_summary_and_artifact_link(self) -> None:
        self.dispatch_single()
        self.chain_evidence(passed=True)
        self.finalize("success")
        env = environ(
            {}, GITHUB_STEP_SUMMARY=str(self.step_summary),
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

    def test_publish_without_an_artifact_fails(self) -> None:
        env = environ({}, GITHUB_STEP_SUMMARY=str(self.step_summary))
        self.assertEqual(perf_dispatch.publish(env, self.dir), 1)
        self.assertIn("- Artifact: not uploaded", self.step_summary.read_text(encoding="utf-8"))

    def test_the_command_is_registered(self) -> None:
        self.assertIn("perf:dispatch", cli.COMMANDS)


if __name__ == "__main__":
    unittest.main()
