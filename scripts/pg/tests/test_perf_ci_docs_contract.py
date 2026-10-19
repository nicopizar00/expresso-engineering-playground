from __future__ import annotations

import re
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

    def test_performance_ci_builds_then_runs_the_purchase_job_and_a_workflow(self) -> None:
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
        run_job = step_index(
            {
                "name": "Run k6 purchase job",
                "env": {"BASE_URL": "http://host.docker.internal:3001"},
                "run": "./dev perf:http-purchase --config 1-iteration",
            }
        )

        run_workflow = step_index(
            next(step for step in steps if step.get("name") == "Run k6 workflow")
        )

        self.assertLess(setup_python, install_punch)
        self.assertLess(install_punch, start_bff)
        self.assertLess(start_bff, build_k6)
        self.assertLess(build_k6, run_job)
        writable_reports = step_index(
            next(step for step in steps if step.get("name") == "Let k6 write its reports")
        )
        self.assertEqual(
            steps[writable_reports]["run"], "chmod a+w tests/performance/k6/reports"
        )
        self.assertLess(writable_reports, run_job)
        self.assertLess(run_job, run_workflow)
        self.assertEqual(
            steps[run_workflow]["run"],
            "./dev perf:workflow http-cart http-orders http-orders-status:1-iteration",
        )
        self.assertEqual(
            sum(step.get("run", "").startswith("./dev perf:http-purchase") for step in steps), 1
        )
        self.assertFalse(
            any(
                "docker compose" in step.get("run", "")
                and " run " in f" {step.get('run', '')} "
                for step in steps
            )
        )
        self.assertFalse(any("--produce" in step.get("run", "") for step in steps))

    def test_k6_env_example_does_not_force_a_scenario(self) -> None:
        """An active SCENARIO= line overrides every ./dev perf:* job for
        anyone who sources the file (see compose.performance.yaml)."""
        text = (REPO_ROOT / "tests/performance/k6/.env.example").read_text(encoding="utf-8")
        self.assertNotRegex(text, r"(?m)^SCENARIO=")

    def test_validation_example_quotes_the_real_http_purchase_threshold(self) -> None:
        thresholds = (REPO_ROOT / "tests/performance/k6/config/thresholds.ts").read_text(encoding="utf-8")
        block = thresholds[thresholds.index("export const purchaseFlowThresholds"):]
        p95 = re.search(r'"p\(95\)<(\d+)"', block).group(1)
        doc = (REPO_ROOT / "docs/performance/validation.md").read_text(encoding="utf-8")
        example = re.search(r"http-purchase after change: .*?\(threshold (\d+)ms\)", doc).group(1)
        self.assertEqual(example, p95)

    def test_orchestrator_doc_lists_each_command_once(self) -> None:
        doc = (REPO_ROOT / "docs/performance/orchestrator.md").read_text(encoding="utf-8")
        self.assertNotIn("`./dev perf:http-purchase` / `perf:http-purchase`", doc)

    def test_docs_quote_the_punch_menus_sizing_label(self) -> None:
        menu = (REPO_ROOT / "vendor/punch/src/punch/menu.py").read_text(encoding="utf-8")
        label = re.search(r'"(Size for a target [a-z]+)"', menu).group(1)
        for path in ("docs/performance/orchestrator.md", "tests/performance/k6/README.md"):
            text = (REPO_ROOT / path).read_text(encoding="utf-8")
            quoted = set(re.findall(r"Size for a target [a-z]+", text))
            with self.subTest(path=path):
                self.assertEqual(quoted, {label})

    def test_every_orchestrator_anchor_link_resolves(self) -> None:
        doc = (REPO_ROOT / "docs/performance/orchestrator.md").read_text(encoding="utf-8")
        anchors = {
            re.sub(r"[^\w\- ]", "", heading.strip().lower()).replace(" ", "-")
            for heading in re.findall(r"^#{2,4} (.+)$", doc, re.MULTILINE)
        }
        sources = ["CLAUDE.md", "docs/cli-reference.md", "tests/performance/k6/README.md",
                   ".github/workflows/perf-job.yml", ".github/workflows/perf-workflow.yml",
                   ".github/workflows/_perf-execute.yml"]
        for source in sources:
            text = (REPO_ROOT / source).read_text(encoding="utf-8")
            for anchor in re.findall(r"orchestrator\.md#([\w\-]+)", text):
                with self.subTest(source=source, anchor=anchor):
                    self.assertIn(anchor, anchors)

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
        self.assertIn("--produce", result.stdout)
        self.assertIn("--config", result.stdout)

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
                self.assertIn("[DATA", documents[path])
                self.assertIn("spec.data", documents[path])
                self.assertIn("atomic", documents[path])

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
        self.assertNotIn("punch's _stream primitive", documents["docs/performance/orchestrator.md"])
