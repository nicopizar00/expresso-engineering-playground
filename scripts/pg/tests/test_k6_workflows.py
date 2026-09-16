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

        expected_names = {"smoke", "purchase-flow"}
        self.assertEqual(len(workflow_paths), 2)
        self.assertEqual({path.stem for path in workflow_paths}, expected_names)
        self.assertEqual({workflow.k6_script for workflow in workflows}, expected_scripts)
        self.assertEqual(len({workflow.name for workflow in workflows}), len(workflows))
        for path, workflow in zip(workflow_paths, workflows):
            with self.subTest(workflow=path.stem):
                document = yaml.safe_load(path.read_text(encoding="utf-8"))
                self.assertEqual(workflow.name, path.stem)
                self.assertEqual(
                    document["spec"]["compose"],
                    {"file": "infra/docker/compose.performance.yaml", "service": "k6"},
                )
                self.assertEqual(workflow.working_directory, REPO_ROOT)
                self.assertEqual(
                    workflow.compose_file,
                    REPO_ROOT / "infra" / "docker" / "compose.performance.yaml",
                )
                self.assertEqual(workflow.compose_service, "k6")
                self.assertNotIn("outputs", document["spec"])
                if workflow.name == "purchase-flow":
                    self.assertEqual(
                        document["spec"]["environment"],
                        {"forward": ["BASE_URL", "VUS", "DURATION"]},
                    )
                else:
                    self.assertEqual(document["spec"]["environment"], {"forward": ["BASE_URL"]})
