from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.paths import PERF_WORKFLOWS_DIR, REPO_ROOT  # noqa: E402
from punch.workflow import load_workflow  # noqa: E402


class K6WorkflowCoverageTests(unittest.TestCase):
    def test_workflows_cover_every_typescript_build_entry_once(self) -> None:
        package = json.loads(
            (REPO_ROOT / "tests" / "performance" / "k6" / "package.json").read_text(
                encoding="utf-8"
            )
        )
        build_entries = [
            token for token in package["scripts"]["build"].split() if token.endswith(".ts")
        ]
        expected_scripts = {
            "/scripts/scenarios/" + str(Path(entry).relative_to("scenarios").with_suffix(".js"))
            for entry in build_entries
        }
        workflow_paths = sorted(PERF_WORKFLOWS_DIR.glob("*.yaml"))
        workflows = [load_workflow(path) for path in workflow_paths]

        expected_names = {"smoke", "purchase-flow", "purchase-flow-browser"}
        expected_compose_service = {
            "smoke": "k6",
            "purchase-flow": "k6",
            "purchase-flow-browser": "k6-browser",
        }
        expected_environment_forward = {
            "smoke": ["BASE_URL"],
            "purchase-flow": ["BASE_URL", "VUS", "DURATION", "ITERATIONS"],
            "purchase-flow-browser": ["BASE_URL", "VUS", "ITERATIONS"],
        }
        self.assertEqual(len(workflow_paths), 3)
        self.assertEqual({path.stem for path in workflow_paths}, expected_names)
        self.assertEqual({workflow.k6_script for workflow in workflows}, expected_scripts)
        self.assertEqual(len({workflow.name for workflow in workflows}), len(workflows))
        for path, workflow in zip(workflow_paths, workflows):
            with self.subTest(workflow=path.stem):
                document = yaml.safe_load(path.read_text(encoding="utf-8"))
                self.assertEqual(workflow.name, path.stem)
                self.assertEqual(
                    document["spec"]["compose"],
                    {
                        "file": "infra/docker/compose.performance.yaml",
                        "service": expected_compose_service[path.stem],
                    },
                )
                self.assertEqual(workflow.working_directory, REPO_ROOT)
                self.assertEqual(
                    workflow.compose_file,
                    REPO_ROOT / "infra" / "docker" / "compose.performance.yaml",
                )
                self.assertEqual(workflow.compose_service, expected_compose_service[path.stem])
                self.assertNotIn("csv", document["spec"].get("outputs", {}))
                self.assertEqual(
                    document["spec"]["outputs"]["summary"]["path"],
                    f"tests/performance/k6/reports/{path.stem}-summary.json",
                )
                self.assertEqual(
                    workflow.summary_output.path,
                    REPO_ROOT / "tests" / "performance" / "k6" / "reports" / f"{path.stem}-summary.json",
                )
                self.assertEqual(
                    document["spec"]["environment"],
                    {"forward": expected_environment_forward[path.stem]},
                )
