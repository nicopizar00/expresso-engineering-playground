from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import compose  # noqa: E402
from pg.paths import COMPOSE_DEV_FILE, COMPOSE_FILE  # noqa: E402


class ComposeCmdTests(unittest.TestCase):
    def test_base_cmd_includes_main_compose_file(self) -> None:
        cmd = compose.base_cmd()
        self.assertEqual(cmd[0:2], ["docker", "compose"])
        self.assertIn("-f", cmd)
        self.assertIn(str(COMPOSE_FILE), cmd)

    def test_profiles_emitted_before_subcommand(self) -> None:
        cmd = compose.base_cmd(profiles=["web", "viz"])
        first_file_idx = cmd.index("-f")
        profile_indices = [i for i, tok in enumerate(cmd) if tok == "--profile"]
        self.assertTrue(profile_indices)
        for idx in profile_indices:
            self.assertLess(idx, first_file_idx)
        self.assertIn("web", cmd)
        self.assertIn("viz", cmd)

    def test_extra_files_appended_in_order(self) -> None:
        cmd = compose.base_cmd(extra_files=[COMPOSE_DEV_FILE])
        files = [cmd[i + 1] for i, tok in enumerate(cmd) if tok == "-f"]
        self.assertEqual(files, [str(COMPOSE_FILE), str(COMPOSE_DEV_FILE)])


if __name__ == "__main__":
    unittest.main()
