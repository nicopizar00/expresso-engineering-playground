from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path
from unittest import mock

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


class RunBffDevTests(unittest.TestCase):
    def test_rebuilds_dev_image_before_running(self) -> None:
        with mock.patch.object(compose.subprocess, "run") as run:
            run.return_value.returncode = 0
            compose.run_bff_dev(["true"])
        cmd = run.call_args.args[0]
        tail = cmd[cmd.index("run"):]
        self.assertEqual(tail, ["run", "--rm", "--build", "--no-deps", "bff", "true"])


class DevOverrideImageTests(unittest.TestCase):
    # The dev stage must not share the runtime stage's default image tag, or
    # one-off dev runs (seed, migrate) can silently reuse the runtime image.
    def test_bff_and_web_dev_stages_have_own_image_tags(self) -> None:
        text = COMPOSE_DEV_FILE.read_text()
        for service in ("bff", "web"):
            block = re.search(
                rf"^  {service}:\n((?:    .*\n|\n)+)", text, re.MULTILINE
            )
            self.assertIsNotNone(block, service)
            self.assertRegex(block.group(1), rf"image: \S+/{service}:dev")


if __name__ == "__main__":
    unittest.main()
