from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.k6runner import run_k6  # noqa: E402


FAKE_DOCKER = """#!/usr/bin/env python3
import os
import sys
from pathlib import Path

Path(os.environ["FAKE_DOCKER_ARGS"]).write_text("\\n".join(sys.argv[1:]), encoding="utf-8")
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
