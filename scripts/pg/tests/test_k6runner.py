from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.k6runner import run_k6  # noqa: E402
from pg import cli, perf  # noqa: E402
from punch.execution import ExecutionResult  # noqa: E402


FAKE_DOCKER = """#!/usr/bin/env python3
import os
import sys
from pathlib import Path

Path(os.environ["FAKE_DOCKER_ARGS"]).write_text("\\n".join(sys.argv[1:]), encoding="utf-8")
raise SystemExit(int(os.environ.get("FAKE_EXIT_CODE", "0")))
"""


class RunK6Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.bin_path = self.root / "bin"
        self.bin_path.mkdir()
        docker = self.bin_path / "docker"
        docker.write_text(FAKE_DOCKER, encoding="utf-8")
        docker.chmod(0o755)
        self.fake_args_path = self.root / "docker-args.txt"
        self.environment_patch = patch.dict(
            os.environ,
            {
                "PATH": f"{self.bin_path}{os.pathsep}{os.environ['PATH']}",
                "FAKE_DOCKER_ARGS": str(self.fake_args_path),
            },
        )
        self.environment_patch.start()
        self.reports_patch = patch(
            "pg.k6runner.PERF_REPORTS_DIR", self.root / "reports"
        )
        self.reports_patch.start()

    def tearDown(self) -> None:
        self.reports_patch.stop()
        self.environment_patch.stop()
        self.temporary_directory.cleanup()

    def fake_docker_args(self) -> list[str]:
        if not self.fake_args_path.exists():
            return []
        return self.fake_args_path.read_text(encoding="utf-8").splitlines()

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

    @patch("pg.k6runner.confirm_output_data", return_value=True)
    def test_confirmation_flag_is_forwarded_to_punch(self, confirm_output_data_mock) -> None:
        self.assertEqual(run_k6("smoke", confirm_output_data_flag=True), 0)
        workflow = confirm_output_data_mock.call_args.args[0][0]
        self.assertEqual(workflow.name, "smoke")
        self.assertTrue(confirm_output_data_mock.call_args.kwargs["assume_yes"])

    def test_malformed_workflow_fails_before_docker(self) -> None:
        (self.root / "malformed.yaml").write_text("not: a-workflow\n", encoding="utf-8")
        with patch("pg.k6runner.PERF_WORKFLOWS_DIR", self.root):
            self.assertEqual(run_k6("malformed"), 1)
        self.assertFalse(self.fake_args_path.exists())

    @patch("pg.k6runner.execute_workflow")
    def test_punch_owned_failure_without_nonzero_child_exit_returns_one(self, execute_mock) -> None:
        for child_exit_code in (0, None):
            with self.subTest(child_exit_code=child_exit_code):
                execute_mock.return_value = ExecutionResult(
                    workflow_name="smoke",
                    command=(),
                    child_exit_code=child_exit_code,
                    passed=False,
                    failure="workflow output validation failed",
                    csv_path=None,
                    csv_record_count=0,
                )
                self.assertEqual(run_k6("smoke"), 1)

    def test_child_exit_code_is_propagated(self) -> None:
        with patch.dict(os.environ, {"FAKE_EXIT_CODE": "23"}):
            self.assertEqual(run_k6("smoke"), 23)


class PerfAndCliCompatibilityTests(unittest.TestCase):
    @patch("pg.perf.run_k6", return_value=0)
    def test_perf_commands_parse_confirmation_and_select_workflows(self, run_k6_mock) -> None:
        for command, workflow_name in (
            (perf.smoke, "smoke"),
            (perf.purchase_flow, "purchase-flow"),
        ):
            with self.subTest(workflow_name=workflow_name):
                self.assertEqual(command(["--confirm-output-data"]), 0)
                run_k6_mock.assert_called_once_with(
                    workflow_name, confirm_output_data_flag=True
                )
                run_k6_mock.reset_mock()

    def test_cli_forwards_static_perf_arguments(self) -> None:
        with (
            patch.object(perf, "smoke", return_value=0) as smoke_mock,
            patch.object(perf, "purchase_flow", return_value=0) as purchase_flow_mock,
        ):
            self.assertEqual(cli._perf_smoke(["--confirm-output-data"]), 0)
            self.assertEqual(cli._perf_purchase_flow(["--confirm-output-data"]), 0)

        smoke_mock.assert_called_once_with(["--confirm-output-data"])
        purchase_flow_mock.assert_called_once_with(["--confirm-output-data"])
