from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.paths import REPO_ROOT, repo_path  # noqa: E402


class RepoPathTests(unittest.TestCase):
    def test_a_relative_path_is_read_from_the_repository_root(self) -> None:
        self.assertEqual(
            repo_path("tests/performance/k6/reports/dispatch/spec.json"),
            REPO_ROOT / "tests" / "performance" / "k6" / "reports" / "dispatch" / "spec.json",
        )

    def test_an_absolute_path_is_kept(self) -> None:
        self.assertEqual(repo_path("/tmp/spec.json"), Path("/tmp/spec.json"))


if __name__ == "__main__":
    unittest.main()
