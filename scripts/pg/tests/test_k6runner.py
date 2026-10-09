from __future__ import annotations

import os
import subprocess
import sys
import unittest
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.k6runner import run_k6  # noqa: E402
from pg import cli, perf  # noqa: E402
from pg.paths import REPO_ROOT  # noqa: E402
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
        rc = run_k6("http-purchase", extra_env={"IGNORED_SECRET": "no"})
        self.assertEqual(rc, 0)
        args = self.fake_docker_args()
        self.assertEqual(args.count("run"), 2)
        self.assertIn("compose.performance.yaml", " ".join(args))
        self.assertIn("/scripts/scenarios/http-purchase/http-purchase.js", args)
        self.assertNotIn("IGNORED_SECRET=no", args)

    def test_run_k6_passes_the_workflow_config_by_default(self) -> None:
        self.assertEqual(run_k6("http-purchase"), 0)
        args = self.fake_docker_args()
        preset = REPO_ROOT / "tests/performance/k6/options/5-iterations.json"
        self.assertIn(f"{preset}:/punch/k6-config.json:ro", args)
        self.assertEqual(args[-2:], ["--config", "/punch/k6-config.json"])

    def test_run_k6_config_accepts_a_preset_name_or_a_path(self) -> None:
        preset = REPO_ROOT / "tests/performance/k6/options/1-iteration.json"
        custom = self.root / "custom.json"
        custom.write_text('{"iterations": 2}', encoding="utf-8")
        for value, path in (("1-iteration", preset), (str(custom), custom.resolve())):
            with self.subTest(value=value):
                self.assertEqual(run_k6("http-purchase", ["--config", value]), 0)
                self.assertIn(f"{path}:/punch/k6-config.json:ro", self.fake_docker_args())

    def test_run_k6_rejects_an_unknown_config_before_docker(self) -> None:
        with patch("sys.stdout", StringIO()):
            self.assertEqual(run_k6("http-purchase", ["--config", "no-such-preset"]), 1)
        self.assertFalse(self.fake_args_path.exists())

    def test_unknown_workflow_name_fails_before_docker(self) -> None:
        self.assertEqual(run_k6("missing"), 1)
        self.assertFalse(self.fake_args_path.exists())

    @patch("pg.k6runner.execute_workflow")
    def test_run_k6_forwards_produce_and_data(self, execute_mock) -> None:
        execute_mock.return_value = ExecutionResult("http-cart", (), 0, True, None)
        with patch("pg.k6runner.confirm_docker_run", return_value=True):
            self.assertEqual(run_k6("http-cart", ["--produce", "carts"]), 0)
        kwargs = execute_mock.call_args.kwargs
        self.assertEqual(kwargs["produce"], ("carts",))
        self.assertEqual(kwargs["data_overrides"], {})
        self.assertEqual(kwargs["producers_of"]("carts"), ("browser-cart", "http-cart"))

    def test_run_k6_rejects_undeclared_produce_before_docker(self) -> None:
        with patch("pg.k6runner.execute_workflow") as execute_mock:
            self.assertEqual(run_k6("http-orders-status", ["--produce", "carts"]), 1)
        execute_mock.assert_not_called()
        self.assertFalse(self.fake_args_path.exists())

    @patch("pg.k6runner.confirm_docker_run", return_value=True)
    def test_http_orders_missing_carts_fails_before_docker_and_names_producers(self, _confirm) -> None:
        out, err = StringIO(), StringIO()
        with patch("sys.stdin", StringIO()), patch("sys.stdout", out), patch("sys.stderr", err), \
             patch("punch.execution._has_data_rows", return_value=False):
            rc = run_k6("http-orders", [])
        self.assertEqual(rc, 1)
        self.assertFalse(self.fake_args_path.exists())
        self.assertIn(
            "browser-cart, http-cart (--produce carts)", out.getvalue() + err.getvalue()
        )

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
                    workflow_name="http-purchase",
                    command=(),
                    child_exit_code=child_exit_code,
                    passed=False,
                    failure="workflow output validation failed",
                )
                self.assertEqual(run_k6("http-purchase"), 1)

    def test_child_exit_code_is_propagated(self) -> None:
        with patch.dict(os.environ, {"FAKE_EXIT_CODE": "23"}):
            self.assertEqual(run_k6("http-purchase"), 23)



class WorkflowRegistryTests(unittest.TestCase):
    def test_registry_matches_the_workflow_directory(self) -> None:
        from pg.paths import PERF_WORKFLOWS_DIR
        from pg.workflows import WORKFLOWS

        self.assertEqual(
            set(WORKFLOWS), {p.stem for p in PERF_WORKFLOWS_DIR.glob("*.yaml")}
        )

    def test_browser_workflows_default_to_the_web_port(self) -> None:
        from pg.paths import BFF_PORT, WEB_PORT
        from pg.workflows import WORKFLOWS

        for name, port in WORKFLOWS.items():
            with self.subTest(name=name):
                self.assertEqual(port, WEB_PORT if name.startswith("browser-") else BFF_PORT)

    def test_registry_imports_without_punch_or_yaml(self) -> None:
        """./dev --help must work before Punch's requirements are installed."""
        code = (
            "import sys; sys.modules['yaml'] = None; sys.modules['punch'] = None; "
            "sys.path.insert(0, 'scripts'); import pg.workflows, pg.cli"
        )
        result = subprocess.run(
            [sys.executable, "-c", code], cwd=REPO_ROOT, capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    @patch("pg.perf.run_k6", return_value=0)
    def test_perf_run_passes_args_and_port(self, run_k6_mock) -> None:
        from pg.workflows import WORKFLOWS

        for name, port in WORKFLOWS.items():
            with self.subTest(name=name):
                run_k6_mock.reset_mock()
                self.assertEqual(perf.run(name, ["--produce", "carts"]), 0)
                run_k6_mock.assert_called_once_with(
                    name, ["--produce", "carts"], default_port=port
                )

    @patch("pg.perf.run", return_value=0)
    def test_cli_exposes_exactly_one_perf_command_per_workflow(self, run_mock) -> None:
        from pg.workflows import WORKFLOWS

        perf_commands = {
            c for c in cli.COMMANDS
            if c.startswith("perf:") and c not in ("perf:open-report", "perf:clean")
        }
        self.assertEqual(perf_commands, {f"perf:{name}" for name in WORKFLOWS})
        for name in WORKFLOWS:
            run_mock.reset_mock()
            self.assertEqual(cli.COMMANDS[f"perf:{name}"](["--produce", "carts"]), 0)
            run_mock.assert_called_once_with(name, ["--produce", "carts"])


if __name__ == "__main__":
    unittest.main()
