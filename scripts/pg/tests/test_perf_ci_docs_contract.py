from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]


class PerformanceCiAndDocumentationContractTests(unittest.TestCase):
    def test_python_ci_installs_pinned_punch_dependencies(self) -> None:
        """Removing Punch's requirements from Python CI would break YAML loading."""
        ci = yaml.safe_load(
            (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        )
        steps = ci["jobs"]["python"]["steps"]

        self.assertIn(
            {
                "name": "Install Python dependencies",
                "run": 'python -m pip install --quiet "ruff==0.7.4" -r vendor/punch/requirements.txt',
            },
            steps,
        )

    def test_performance_ci_builds_then_selects_the_smoke_workflow(self) -> None:
        """Bypassing ./dev would duplicate the repository YAML execution contract."""
        ci = yaml.safe_load(
            (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        )
        steps = ci["jobs"]["perf-smoke"]["steps"]

        def step_index(expected: dict[str, object]) -> int:
            return steps.index(expected)

        setup_python = step_index(
            {"uses": "actions/setup-python@v5", "with": {"python-version": "3.11"}}
        )
        install_punch = step_index(
            {
                "name": "Install Punch dependencies",
                "run": "python -m pip install --quiet -r vendor/punch/requirements.txt",
            }
        )
        start_bff = step_index(next(step for step in steps if step.get("name") == "Start BFF stack"))
        build_k6 = step_index(
            {
                "name": "Build k6 image",
                "run": "docker compose -f infra/docker/compose.performance.yaml build k6",
            }
        )
        run_workflow = step_index(
            {
                "name": "Run k6 smoke workflow",
                "env": {"BASE_URL": "http://host.docker.internal:3001"},
                "run": "./dev perf:smoke",
            }
        )

        self.assertLess(setup_python, install_punch)
        self.assertLess(install_punch, start_bff)
        self.assertLess(start_bff, build_k6)
        self.assertLess(build_k6, run_workflow)
        self.assertEqual(sum(step.get("run") == "./dev perf:smoke" for step in steps), 1)
        self.assertFalse(
            any(
                "docker compose" in step.get("run", "")
                and " run " in f" {step.get('run', '')} "
                for step in steps
            )
        )
        self.assertFalse(any("--confirm-output-data" in step.get("run", "") for step in steps))

    def test_dev_help_explains_the_performance_only_python_dependency(self) -> None:
        """A fresh user needs the Punch installation command before a perf command."""
        result = subprocess.run(
            [sys.executable, "-m", "pg", "--help"],
            cwd=REPO_ROOT / "scripts",
            check=True,
            capture_output=True,
            text=True,
        )

        self.assertIn("vendor/punch/requirements.txt", result.stdout)
        self.assertIn("--confirm-output-data", result.stdout)

    def test_current_guidance_describes_yaml_owned_execution_and_csv_safety(self) -> None:
        """Current guides must not revive private runner or no-pip guidance."""
        documents = {
            path: (REPO_ROOT / path).read_text(encoding="utf-8")
            for path in (
                "README.md",
                "CLAUDE.md",
                "dev",
                "docs/cli-reference.md",
                "docs/architecture/orchestrator-python.md",
                "docs/performance/orchestrator.md",
                "tests/performance/k6/README.md",
                "docs/ai/claude-code-operating-protocol.md",
                "docs/specs/punch-submodule-integration.md",
            )
        }

        for path in ("README.md", "CLAUDE.md", "dev", "docs/cli-reference.md"):
            with self.subTest(path=path):
                self.assertIn("vendor/punch/requirements.txt", documents[path])

        for path in (
            "docs/architecture/orchestrator-python.md",
            "docs/performance/orchestrator.md",
            "tests/performance/k6/README.md",
        ):
            with self.subTest(path=path):
                self.assertIn("[CSV]", documents[path])
                self.assertIn("outputs.csv", documents[path])
                self.assertIn("atomic", documents[path])
                self.assertIn("seven", documents[path])

        self.assertNotIn(
            "only way to run `pnpm pg:perf:checkout-flow`", documents["README.md"]
        )
        for path in ("docs/performance/orchestrator.md", "tests/performance/k6/README.md"):
            with self.subTest(path=path):
                self.assertIn("not current-run evidence", documents[path])
                self.assertIn("execution result", documents[path])
                self.assertIn("evidence record", documents[path])

        self.assertIn("BASE_URL", documents["tests/performance/k6/README.md"])
        self.assertIn("perf:open-report", documents["tests/performance/k6/README.md"])
        self.assertIn("perf:clean", documents["tests/performance/k6/README.md"])
        self.assertIn("supersedes INT-002", documents["docs/specs/punch-submodule-integration.md"])
        self.assertIn("CI smoke workflow", documents["docs/ai/claude-code-operating-protocol.md"])
        self.assertNotIn("punch's _stream primitive", documents["docs/performance/orchestrator.md"])
