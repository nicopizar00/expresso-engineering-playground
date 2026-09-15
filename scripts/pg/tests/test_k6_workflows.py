from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

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
        workflows = [load_workflow(path) for path in PERF_WORKFLOWS_DIR.glob("*.yaml")]

        self.assertEqual({workflow.k6_script for workflow in workflows}, expected_scripts)
        self.assertEqual(len({workflow.name for workflow in workflows}), len(workflows))

