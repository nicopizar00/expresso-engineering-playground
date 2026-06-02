from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.env import load_root_env  # noqa: E402


class EnvLoaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self._restore: dict[str, str | None] = {}

    def tearDown(self) -> None:
        for key, value in self._restore.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self._tmp.cleanup()

    def _expect_cleanup(self, key: str) -> None:
        self._restore[key] = os.environ.get(key)

    def test_bootstrap_copies_example_when_env_missing(self) -> None:
        example = self.tmp / ".env.example"
        env = self.tmp / ".env"
        example.write_text("FOO=bar\nBAZ=qux\n", encoding="utf-8")

        self._expect_cleanup("FOO")
        self._expect_cleanup("BAZ")
        bootstrapped = load_root_env(env, example)

        self.assertTrue(bootstrapped)
        self.assertEqual(env.read_text(encoding="utf-8"), "FOO=bar\nBAZ=qux\n")
        self.assertEqual(os.environ.get("FOO"), "bar")
        self.assertEqual(os.environ.get("BAZ"), "qux")

    def test_existing_env_wins_over_file(self) -> None:
        env = self.tmp / ".env"
        env.write_text("ALREADY_SET=from_file\n", encoding="utf-8")

        self._expect_cleanup("ALREADY_SET")
        os.environ["ALREADY_SET"] = "from_shell"
        bootstrapped = load_root_env(env, self.tmp / "missing.example")
        self.assertFalse(bootstrapped)
        self.assertEqual(os.environ["ALREADY_SET"], "from_shell")

    def test_blank_lines_and_comments_ignored(self) -> None:
        env = self.tmp / ".env"
        env.write_text("# a comment\n\nVALID_KEY=ok\n# trailing\n", encoding="utf-8")

        self._expect_cleanup("VALID_KEY")
        load_root_env(env, self.tmp / "missing")
        self.assertEqual(os.environ.get("VALID_KEY"), "ok")


if __name__ == "__main__":
    unittest.main()
