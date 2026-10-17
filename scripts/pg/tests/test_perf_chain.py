from __future__ import annotations

import dataclasses
import json
import os
import sys
import unittest
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import perf_chain  # noqa: E402
from pg.paths import PERF_OPTIONS_DIR, PERF_WORKFLOWS_DIR, REPO_ROOT  # noqa: E402
from pg.perf_chain import (  # noqa: E402
    MAX_BROWSER_VUS,
    RUNNER_WARNING,
    parse_steps,
    peak_vus,
    plan_chain,
    render_summary,
    run_chain,
    shapes,
)
from pg.perf_spec import CUSTOM, PRESET, StepRequest, spec_document  # noqa: E402
from punch.catalog import load_catalog  # noqa: E402
from punch.execution import DatasetResult, ExecutionResult  # noqa: E402
from punch.workflow import SummaryOutput  # noqa: E402

CATALOG = load_catalog(PERF_WORKFLOWS_DIR)


def plan(*items: str):
    return plan_chain(parse_steps(items), CATALOG)


class PlanTests(unittest.TestCase):
    def test_a_step_defaults_to_auto(self) -> None:
        self.assertEqual(
            parse_steps(["http-cart", "http-orders:5-vu-5m"]),
            [StepRequest("http-cart"), StepRequest("http-orders", PRESET, "5-vu-5m")],
        )

    def test_auto_sizes_a_writer_for_the_step_that_reads_its_data(self) -> None:
        result = plan("http-cart", "http-orders:5-vu-5m")
        self.assertEqual(result.errors, [])
        cart, orders = result.steps
        self.assertEqual((cart.sizing.iterations, cart.sizing.vus), (1569, 7))
        self.assertEqual(cart.sized_for, 2)
        self.assertEqual(cart.produce, ["carts"])
        self.assertEqual(orders.reads, {"carts": 1})
        self.assertEqual(orders.produce, [])
        self.assertEqual(orders.run_args(), ["--config", "5-vu-5m"])

    def test_sizing_resolves_from_the_last_step_back(self) -> None:
        result = plan("http-cart", "http-orders", "http-orders-status:1-iteration")
        self.assertEqual(result.errors, [])
        cart, orders, status = result.steps
        # status reads 1 row; orders adds its 15% margin; cart sizes for that.
        self.assertEqual(orders.sizing.iterations, 2)
        self.assertEqual(cart.sizing.iterations, 3)
        self.assertEqual(cart.sizing.rows_needed, 2)
        self.assertEqual(orders.produce, ["orders"])
        self.assertEqual(status.reads, {"orders": 2})

    def test_auto_without_a_reader_keeps_the_workflow_config(self) -> None:
        [purchase] = plan("http-purchase").steps
        self.assertIsNone(purchase.sizing)
        self.assertEqual(purchase.config_path, CATALOG.workflows["http-purchase"].k6_config)
        self.assertEqual(purchase.run_args(), [])

    def test_a_reader_without_an_earlier_writer_is_rejected_naming_producers(self) -> None:
        result = plan("http-orders", "http-cart")
        self.assertEqual(
            result.errors,
            [
                "step 1 http-orders reads carts; no earlier step writes it. "
                "Put browser-cart or http-cart before step 1"
            ],
        )

    def test_a_gap_is_rejected_and_trailing_empty_steps_are_dropped(self) -> None:
        gap = plan("http-cart", "none", "http-orders")
        self.assertIn(
            "step 2 is empty but step 3 is set; fill steps from step 1 without gaps", gap.errors
        )
        trailing = plan("http-purchase", "none", "none:5-vu-5m", "none")
        self.assertEqual(trailing.errors, [])
        self.assertEqual([step.name for step in trailing.steps], ["http-purchase"])
        self.assertEqual(trailing.warnings, ["step 3 is empty; its shape 5-vu-5m is ignored"])

    def test_an_empty_chain_unknown_workflow_or_unknown_shape_is_rejected(self) -> None:
        self.assertEqual(plan("none").errors, ["no workflow selected; step 1 needs one"])
        self.assertRegex(plan("http-carts").errors[0], r"^step 1: unknown workflow 'http-carts'")
        self.assertRegex(
            plan("http-cart:9-vu-1h").errors[0], r"^step 1 http-cart: unknown shape '9-vu-1h'"
        )

    def test_a_browser_step_runs_the_browser_preset_and_rejects_duration_shapes(self) -> None:
        [cart] = plan("browser-cart:1-iteration").steps
        self.assertEqual(cart.config_path, PERF_OPTIONS_DIR / "1-iteration-browser.json")
        self.assertEqual(cart.run_args(), ["--config", "1-iteration-browser"])
        self.assertEqual(
            plan("browser-cart:5-vu-5m").errors,
            [
                "step 1 browser-cart: a browser workflow has no 5-vu-5m preset; "
                "use auto or one of: 1-iteration, 5-iterations"
            ],
        )

    def test_a_sized_browser_step_keeps_the_browser_options(self) -> None:
        cart, _orders = plan("browser-cart", "http-orders:1-vu-5m").steps
        self.assertLessEqual(cart.sizing.vus, MAX_BROWSER_VUS)
        [scenario] = cart.config["scenarios"].values()
        self.assertEqual(scenario["options"], {"browser": {"type": "chromium"}})
        self.assertEqual(scenario["executor"], "shared-iterations")

    def test_a_sized_browser_step_over_the_cap_is_rejected(self) -> None:
        result = plan("browser-purchase", "http-orders-status:5-vu-5m")
        self.assertEqual(len(result.errors), 1)
        self.assertIn("it needs 81 browser VUs; the cap is 4", result.errors[0])
        self.assertIn("Pick a smaller shape for step 2", result.errors[0])

    def test_the_latest_writer_wins_and_only_read_data_is_produced(self) -> None:
        result = plan("http-cart", "browser-cart", "http-orders", "http-orders")
        first, second, third, fourth = result.steps
        self.assertEqual(first.produce, [])
        self.assertIsNone(first.sizing)
        self.assertEqual(second.produce, ["carts"])
        self.assertEqual(second.sized_for, 3)
        self.assertEqual((third.reads, fourth.reads), ({"carts": 2}, {"carts": 2}))
        self.assertEqual(result.warnings, ["steps 3 and 4 read carts from step 2; its rows are reused"])

    def test_an_optional_dataset_comes_from_the_chain_or_the_built_in_default(self) -> None:
        [login] = plan("http-auth-login").steps
        self.assertEqual(login.defaults, ["owned-orders"])
        self.assertEqual(login.run_args(), ["--data", "owned-orders=default"])

        registered, login, _hot = plan(
            "http-purchase-registered", "http-auth-login", "http-me-hot-status:1-iteration"
        ).steps
        self.assertEqual(login.reads, {"owned-orders": 1})
        self.assertEqual(login.defaults, [])
        self.assertEqual(registered.produce, ["owned-orders"])
        self.assertEqual(registered.sized_for, 2)
        self.assertEqual(login.produce, ["auth-tokens"])

    def test_shapes_are_auto_plus_the_non_browser_presets(self) -> None:
        presets = {path.stem for path in PERF_OPTIONS_DIR.glob("*.json")}
        self.assertEqual(shapes()[0], "auto")
        self.assertEqual(
            set(shapes()[1:]), {stem for stem in presets if not stem.endswith("-browser")}
        )


STATUS_REGRESSION = "custom/status-regression.json"


class LoadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.options = Path(self.temporary_directory.name)
        (self.options / "custom").mkdir()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def custom(self, name: str, config) -> str:
        path = self.options / "custom" / name
        path.write_text(config if isinstance(config, str) else json.dumps(config), encoding="utf-8")
        return f"custom/{name}"

    def test_a_custom_reader_config_sizes_the_earlier_auto_producers(self) -> None:
        result = plan_chain(
            [
                StepRequest("http-cart"),
                StepRequest("http-orders"),
                StepRequest("http-orders-status", CUSTOM, STATUS_REGRESSION),
            ],
            CATALOG,
        )
        self.assertEqual(result.errors, [])
        cart, orders, status = result.steps
        # 2 VUs x 10 per-VU iterations = 20 rows; +15% margin = 23; cart: 23 x 1.15 -> 27.
        self.assertEqual((orders.sizing.iterations, orders.sized_for), (23, 3))
        self.assertEqual(cart.sizing.iterations, 27)
        self.assertEqual(status.shape, CUSTOM)
        self.assertEqual(status.shape_label(), f"custom: {STATUS_REGRESSION}")
        self.assertEqual(
            status.run_args(),
            ["--config", str((PERF_OPTIONS_DIR / STATUS_REGRESSION).resolve())],
        )
        self.assertEqual(result.requested, ["http-cart", "http-orders", "http-orders-status"])

    def test_an_unsafe_or_invalid_custom_config_is_a_plan_error(self) -> None:
        escape = plan_chain([StepRequest("http-cart", CUSTOM, "../x.json")], CATALOG, self.options)
        self.assertEqual(
            escape.errors, ["step 1 http-cart: custom config '../x.json' must not contain '..'"]
        )
        broken = self.custom("broken.json", "{nope")
        invalid = plan_chain([StepRequest("http-cart", CUSTOM, broken)], CATALOG, self.options)
        self.assertRegex(invalid.errors[0], r"^step 1 http-cart: could not read k6 config ")
        array = self.custom("array.json", [])
        not_object = plan_chain([StepRequest("http-cart", CUSTOM, array)], CATALOG, self.options)
        self.assertRegex(not_object.errors[0], r"must be a JSON object$")

    def test_a_custom_browser_config_over_the_cap_is_rejected(self) -> None:
        big = self.custom("big.json", {"scenarios": {"default": {
            "executor": "shared-iterations", "vus": 6, "iterations": 6,
            "options": {"browser": {"type": "chromium"}},
        }}})
        result = plan_chain([StepRequest("browser-cart", CUSTOM, big)], CATALOG, self.options)
        self.assertEqual(
            result.errors,
            [f"step 1 browser-cart: custom: {big} runs up to 6 browser VUs; "
             f"the cap is {MAX_BROWSER_VUS}"],
        )

    def test_a_ramping_custom_browser_config_over_the_cap_is_rejected_with_its_peak(self) -> None:
        ramping = self.custom("ramp.json", {"scenarios": {"default": {
            "executor": "ramping-vus", "startVUs": 1,
            "stages": [{"duration": "30s", "target": 3}, {"duration": "30s", "target": 8}],
        }}})
        shortcut = self.custom("stages.json", {"stages": [{"duration": "1m", "target": 5}]})
        for path, peak in ((ramping, 8), (shortcut, 5)):
            with self.subTest(path=path):
                result = plan_chain(
                    [StepRequest("browser-purchase", CUSTOM, path)], CATALOG, self.options
                )
                self.assertEqual(len(result.errors), 1)
                self.assertIn(f"runs up to {peak} browser VUs; the cap is 4", result.errors[0])

    def test_a_browser_config_whose_peak_cannot_be_calculated_is_rejected(self) -> None:
        odd = self.custom(
            "odd.json", {"scenarios": {"default": {"executor": "externally-controlled"}}}
        )
        result = plan_chain([StepRequest("browser-cart", CUSTOM, odd)], CATALOG, self.options)
        self.assertEqual(len(result.errors), 1)
        self.assertIn("cannot tell how many browser VUs", result.errors[0])
        self.assertIn('uses executor "externally-controlled"', result.errors[0])

    def test_a_protocol_step_is_never_checked_against_the_browser_cap(self) -> None:
        big = self.custom("big-http.json", {"vus": 50, "duration": "1m"})
        self.assertEqual(
            plan_chain([StepRequest("http-purchase", CUSTOM, big)], CATALOG, self.options).errors,
            [],
        )

    def test_an_unknown_preset_from_a_spec_is_rejected_like_an_unknown_shape(self) -> None:
        result = plan_chain([StepRequest("http-cart", PRESET, "auto")], CATALOG)
        self.assertRegex(result.errors[0], r"^step 1 http-cart: unknown shape 'auto'")


class PeakVusTests(unittest.TestCase):
    def test_peak_vus_per_executor_and_shortcut(self) -> None:
        cases = [
            ({}, 1),
            ({"vus": 3, "duration": "1m"}, 3),
            ({"iterations": 9}, 1),
            ({"vus": 2, "stages": [{"duration": "1m", "target": 6}]}, 6),
            ({"scenarios": {"a": {"executor": "shared-iterations", "vus": 2, "iterations": 4}}}, 2),
            ({"scenarios": {"a": {"executor": "per-vu-iterations", "iterations": 4}}}, 1),
            ({"scenarios": {"a": {"executor": "constant-vus", "vus": 4, "duration": "1m"}}}, 4),
            ({"scenarios": {"a": {
                "executor": "ramping-vus", "stages": [{"duration": "1m", "target": 0}]
            }}}, 1),
            ({"scenarios": {"a": {
                "executor": "constant-arrival-rate", "preAllocatedVUs": 2, "maxVUs": 7
            }}}, 7),
            ({"scenarios": {"a": {"executor": "ramping-arrival-rate", "preAllocatedVUs": 3}}}, 3),
            ({"scenarios": {
                "a": {"executor": "constant-vus", "vus": 2, "duration": "1m"},
                "b": {"executor": "shared-iterations", "vus": 3, "iterations": 3},
            }}, 5),
        ]
        for config, expected in cases:
            with self.subTest(config=config):
                self.assertEqual(peak_vus(config), expected)

    def test_unreadable_vu_counts_raise(self) -> None:
        for config in (
            {"vus": True},
            {"vus": "4"},
            {"scenarios": {}},
            {"scenarios": {"a": "x"}},
            {"scenarios": {"a": {"executor": "ramping-vus"}}},
            {"scenarios": {"a": {"executor": "constant-arrival-rate"}}},
            {"stages": []},
        ):
            with self.subTest(config=config):
                with self.assertRaises(ValueError):
                    peak_vus(config)


def _result(name: str, passed: bool, rows: dict | None = None, path: Path = Path("x.csv")):
    return ExecutionResult(
        workflow_name=name,
        command=(),
        child_exit_code=0 if passed else 99,
        passed=passed,
        failure=None if passed else "Docker Compose exited with code 99",
        datasets=tuple(
            DatasetResult(dataset, path, count, passed) for dataset, count in (rows or {}).items()
        ),
    )


class RunTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.reports = Path(self.temporary_directory.name) / "chain"
        self.out = patch("sys.stdout", StringIO())
        self.out.start()

    def tearDown(self) -> None:
        self.out.stop()
        self.temporary_directory.cleanup()

    def evidence(self) -> dict:
        return json.loads((self.reports / "chain.json").read_text(encoding="utf-8"))

    @patch("pg.perf_chain.execute_k6")
    def test_steps_run_in_order_with_their_arguments_and_stop_at_the_first_failure(
        self, execute
    ) -> None:
        execute.side_effect = [
            (0, _result("http-cart", True, {"carts": 3})),
            (99, _result("http-orders", False, {"orders": 0})),
        ]
        chain = plan("http-cart", "http-orders", "http-orders-status:1-iteration")

        self.assertEqual(run_chain(chain, self.reports), 99)

        self.assertEqual([c.args[0] for c in execute.call_args_list], ["http-cart", "http-orders"])
        cart_args = execute.call_args_list[0].args[1]
        sized = self.reports / "step-1-http-cart.k6-config.json"
        self.assertEqual(cart_args, ["--config", str(sized), "--produce", "carts"])
        scenario = json.loads(sized.read_text(encoding="utf-8"))["scenarios"]["default"]
        self.assertEqual((scenario["executor"], scenario["iterations"]), ("shared-iterations", 3))
        self.assertFalse(execute.call_args_list[0].kwargs["interactive"])

        evidence = self.evidence()
        self.assertFalse(evidence["passed"])
        self.assertEqual(
            [step["status"] for step in evidence["steps"]], ["passed", "failed", "skipped"]
        )
        self.assertEqual(evidence["steps"][0]["rows"], {"carts": 3})
        self.assertEqual(evidence["steps"][0]["sizing"]["producedRows"], {"carts": 3})
        summary = (self.reports / "summary.md").read_text(encoding="utf-8")
        self.assertIn(
            "## Failed at step 2 http-orders: http-cart → http-orders → http-orders-status", summary
        )
        self.assertIn("skipped: an earlier step failed", summary)

    @patch("pg.perf_chain.execute_k6")
    def test_fewer_rows_than_the_reader_needs_is_a_warning(self, execute) -> None:
        execute.side_effect = [
            (0, _result("http-cart", True, {"carts": 1})),
            (0, _result("http-orders", True)),
        ]
        self.assertEqual(run_chain(plan("http-cart", "http-orders:5-iterations"), self.reports), 0)
        evidence = self.evidence()
        self.assertTrue(evidence["passed"])
        self.assertIn(
            "step 1 http-cart wrote 1 carts row; step 2 reads 5, so rows repeat",
            evidence["warnings"],
        )

    @patch("pg.perf_chain.execute_k6")
    def test_plan_only_writes_the_summary_and_runs_nothing(self, execute) -> None:
        with patch("pg.perf_chain.CHAIN_REPORTS_DIR", self.reports):
            self.assertEqual(perf_chain.run(["--plan", "http-cart", "http-orders:5-vu-5m"]), 0)
        execute.assert_not_called()
        self.assertIsNone(self.evidence()["passed"])
        self.assertIn(
            "## Planned: http-cart → http-orders",
            (self.reports / "summary.md").read_text(encoding="utf-8"),
        )

    @patch("pg.perf_chain.execute_k6")
    def test_a_rejected_chain_exits_one_and_annotates_github_actions(self, execute) -> None:
        with patch("pg.perf_chain.CHAIN_REPORTS_DIR", self.reports), \
             patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}):
            self.assertEqual(perf_chain.run(["http-orders", "http-cart"]), 1)
        execute.assert_not_called()
        self.assertIn(
            "::error title=Punch chain::step 1 http-orders reads carts", sys.stdout.getvalue()
        )
        self.assertIn(
            "## Rejected: http-orders → http-cart",
            (self.reports / "summary.md").read_text(encoding="utf-8"),
        )


    def summary_writer(self, chain, summaries: dict):
        """Point each step's k6 summary at a temp file the fake k6 run writes."""
        for step in chain.steps:
            path = Path(self.temporary_directory.name) / f"{step.name}-summary.json"
            step.workflow = dataclasses.replace(step.workflow, summary_output=SummaryOutput(path))

        def execute(name, _args, **_kwargs):
            step = next(s for s in chain.steps if s.name == name)
            payload = summaries[name]
            step.workflow.summary_output.path.write_text(json.dumps(payload), encoding="utf-8")
            return (0 if payload["passed"] else 99), _result(name, payload["passed"])

        return execute

    @patch("pg.perf_chain.execute_k6")
    def test_threshold_results_and_emitted_metrics_reach_the_evidence(self, execute) -> None:
        chain = plan("http-purchase")
        execute.side_effect = self.summary_writer(chain, {"http-purchase": {
            "passed": False, "totalRequests": 12, "errorRate": 0, "p90Ms": 1200.4,
            "checkPassRate": 1, "durationMs": 9000,
            "thresholds": [
                {"metric": "http_req_duration", "expression": "p(95)<1000", "ok": False},
                {"metric": "http_req_failed", "expression": "rate<0.01", "ok": True},
            ],
            "emittedMetrics": ["checks", "http_req_duration", "http_req_failed", "http_reqs"],
        }})

        self.assertEqual(run_chain(chain, self.reports), 99)

        [step] = self.evidence()["steps"]
        self.assertEqual(step["thresholds"][0]["expression"], "p(95)<1000")
        self.assertTrue(
            step["summary"].endswith("step-1-http-purchase/http-purchase-summary.json")
        )
        summary = (self.reports / "summary.md").read_text(encoding="utf-8")
        self.assertIn(
            "| 12 | 0.00% | 1200 ms | 100.00% | failed: `http_req_duration` p(95)<1000 |", summary
        )
        self.assertIn("- Step 1 `http-purchase`: `http_req_duration` p(95)<1000 failed", summary)
        self.assertIn("- Step 1 `http-purchase`: `http_req_failed` rate<0.01 held", summary)

    @patch("pg.perf_chain.execute_k6")
    def test_metrics_k6_did_not_emit_read_not_emitted_not_zero(self, execute) -> None:
        chain = plan("browser-cart:1-iteration")
        execute.side_effect = self.summary_writer(chain, {"browser-cart": {
            "passed": True, "totalRequests": 0, "errorRate": 1, "p90Ms": 0,
            "checkPassRate": 1, "durationMs": 3000,
            "thresholds": [{"metric": "checks", "expression": "rate>0.95", "ok": True}],
            "emittedMetrics": ["checks", "iterations"],
        }})
        self.assertEqual(run_chain(chain, self.reports), 0)
        summary = (self.reports / "summary.md").read_text(encoding="utf-8")
        self.assertIn("| not emitted | not emitted | not emitted | 100.00% | held (1) |", summary)

    def test_the_runner_warning_appears_only_when_asked(self) -> None:
        evidence = {
            "outcome": "planned", "sequence": ["http-purchase"], "steps": [],
            "errors": [], "warnings": [],
        }
        self.assertNotIn(RUNNER_WARNING, render_summary(evidence))
        self.assertIn(RUNNER_WARNING, render_summary(evidence, runner_warning=True))
        self.assertTrue(
            render_summary(evidence).endswith(
                "### Details\n\n- No thresholds evaluated and no warnings.\n"
            )
        )

    @patch("pg.perf_chain.execute_k6")
    def test_a_spec_file_plans_the_same_steps_as_positional_arguments(self, execute) -> None:
        spec = Path(self.temporary_directory.name) / "spec.json"
        spec.write_text(
            json.dumps(spec_document(parse_steps(["http-cart", "http-orders:5-vu-5m"]))),
            encoding="utf-8",
        )
        with patch("pg.perf_chain.CHAIN_REPORTS_DIR", self.reports):
            self.assertEqual(perf_chain.run(["--plan", "--spec", str(spec)]), 0)
        execute.assert_not_called()
        steps = self.evidence()["steps"]
        self.assertEqual([s["workflow"] for s in steps], ["http-cart", "http-orders"])
        self.assertEqual(steps[0]["config"], "auto: sized for step 2 (1569 iterations, 7 VUs)")

    @patch("pg.perf_chain.execute_k6")
    def test_an_invalid_spec_is_rejected_with_evidence(self, execute) -> None:
        spec = Path(self.temporary_directory.name) / "spec.json"
        spec.write_text(json.dumps({"version": 9, "steps": []}), encoding="utf-8")
        with patch("pg.perf_chain.CHAIN_REPORTS_DIR", self.reports):
            self.assertEqual(perf_chain.run(["--spec", str(spec)]), 1)
        execute.assert_not_called()
        evidence = self.evidence()
        self.assertEqual(evidence["outcome"], "rejected")
        self.assertRegex(evidence["errors"][0], r"^spec .*spec\.json: spec version must be 1$")

    def test_a_relative_spec_path_is_read_from_the_repository_root(self) -> None:
        self.assertEqual(
            perf_chain._spec_path("tests/performance/k6/reports/dispatch/spec.json"),
            REPO_ROOT / "tests/performance/k6/reports/dispatch/spec.json",
        )
        self.assertEqual(perf_chain._spec_path("/abs/spec.json"), Path("/abs/spec.json"))

    def test_steps_and_spec_are_mutually_exclusive(self) -> None:
        with patch("sys.stderr", StringIO()):
            for args in (["--spec", "x.json", "http-cart"], []):
                with self.subTest(args=args), self.assertRaises(SystemExit) as caught:
                    perf_chain.run(args)
                self.assertEqual(caught.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
