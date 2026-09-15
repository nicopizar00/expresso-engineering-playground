from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


class PerformanceCiAndDocumentationContractTests(unittest.TestCase):
    def test_python_ci_installs_pinned_punch_dependencies(self) -> None:
        """Removing Punch's requirements from Python CI would break YAML loading."""
        ci = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

        self.assertIn("name: Install Python dependencies", ci)
        self.assertIn(
            'python -m pip install --quiet "ruff==0.7.4" -r vendor/punch/requirements.txt',
            ci,
        )

    def test_performance_ci_builds_then_selects_the_smoke_workflow(self) -> None:
        """Bypassing ./dev would duplicate the repository YAML execution contract."""
        ci = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

        perf_smoke = ci.split("  perf-smoke:\n", 1)[1]
        self.assertIn("uses: actions/setup-python@v5", perf_smoke)
        self.assertIn('python-version: "3.11"', perf_smoke)
        self.assertIn("python -m pip install --quiet -r vendor/punch/requirements.txt", perf_smoke)
        self.assertIn("name: Build k6 image", perf_smoke)
        self.assertIn(
            "docker compose -f infra/docker/compose.performance.yaml build k6", perf_smoke
        )
        self.assertIn("name: Run k6 smoke workflow", perf_smoke)
        self.assertIn("run: ./dev perf:smoke", perf_smoke)
        self.assertLess(perf_smoke.index("name: Build k6 image"), perf_smoke.index("run: ./dev perf:smoke"))
        self.assertNotIn("k6 run /scripts/scenarios/smoke/smoke.js", perf_smoke)
        self.assertNotIn("--confirm-output-data", perf_smoke)

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

        self.assertIn("supersedes INT-002", documents["docs/specs/punch-submodule-integration.md"])
        self.assertIn("CI smoke workflow", documents["docs/ai/claude-code-operating-protocol.md"])
        self.assertNotIn("punch's _stream primitive", documents["docs/performance/orchestrator.md"])
