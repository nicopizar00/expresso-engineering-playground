from __future__ import annotations

import os
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


REPO_ROOT = Path(__file__).resolve().parents[3]
PUNCH_BIN = REPO_ROOT / "bin" / "punch"


class PunchWrapperTests(unittest.TestCase):
    def test_builds_k6_image_before_opening_workflow_menu(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            bin_path = root / "bin"
            bin_path.mkdir()
            events_path = root / "events.log"

            for command in ("docker", "python3"):
                executable = bin_path / command
                executable.write_text(
                    "#!/bin/sh\n"
                    f"printf '{command}' >> \"$PUNCH_TEST_EVENTS\"\n"
                    "for arg in \"$@\"; do printf '\\t%s' \"$arg\" >> \"$PUNCH_TEST_EVENTS\"; done\n"
                    "printf '\\n' >> \"$PUNCH_TEST_EVENTS\"\n",
                    encoding="utf-8",
                )
                executable.chmod(0o755)

            environment = {
                **os.environ,
                "PATH": f"{bin_path}{os.pathsep}{os.environ['PATH']}",
                "PUNCH_TEST_EVENTS": str(events_path),
            }
            result = subprocess.run(
                [str(PUNCH_BIN), "--example-option"],
                cwd=REPO_ROOT,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
                stdin=subprocess.DEVNULL,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                events_path.read_text(encoding="utf-8").splitlines(),
                [
                    "docker\tcompose\t-f\t"
                    f"{REPO_ROOT / 'infra/docker/compose.performance.yaml'}\tbuild\tk6",
                    "python3\t-m\tpunch\tmenu\t"
                    f"{REPO_ROOT / 'tests/performance/k6/workflows'}\t--example-option",
                ],
            )


if __name__ == "__main__":
    unittest.main()
