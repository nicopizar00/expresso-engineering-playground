from __future__ import annotations

import os
import pty
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


REPO_ROOT = Path(__file__).resolve().parents[3]
PUNCH_BIN = REPO_ROOT / "bin" / "punch"


class PunchWrapperTests(unittest.TestCase):
    def run_interactive_wrapper(
        self, answer: str, *, dependency_status: int = 0
    ) -> tuple[int, list[str], str]:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            bin_path = root / "bin"
            bin_path.mkdir()
            events_path = root / "events.log"

            for command in ("docker", "python3"):
                executable = bin_path / command
                dependency_probe = (
                    'if [ "$1" = "-c" ]; then exit "$PUNCH_TEST_DEP_STATUS"; fi\n'
                    if command == "python3"
                    else ""
                )
                executable.write_text(
                    "#!/bin/sh\n"
                    f"{dependency_probe}"
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
                "PUNCH_TEST_DEP_STATUS": str(dependency_status),
            }
            master, slave = pty.openpty()
            try:
                process = subprocess.Popen(
                    [str(PUNCH_BIN)],
                    cwd=REPO_ROOT,
                    env=environment,
                    stdin=slave,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                os.close(slave)
                os.write(master, f"{answer}\n".encode())
                stdout, stderr = process.communicate(timeout=10)
            finally:
                os.close(master)
            events = (
                events_path.read_text(encoding="utf-8").splitlines()
                if events_path.exists()
                else []
            )
            return process.returncode, events, stderr

    def test_noninteractive_wrapper_exits_before_build_or_menu(self) -> None:
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

            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn("requires a terminal", result.stderr)
            self.assertFalse(events_path.exists())

    def test_declining_image_build_still_opens_workflow_menu(self) -> None:
        rc, events, stderr = self.run_interactive_wrapper("n")
        self.assertEqual(rc, 0, stderr)
        self.assertEqual(
            events,
            [
                "python3\t-m\tpunch\tmenu\t"
                f"{REPO_ROOT / 'tests/performance/k6/workflows'}",
            ],
        )

    def test_accepting_image_build_runs_it_before_workflow_menu(self) -> None:
        rc, events, stderr = self.run_interactive_wrapper("y")
        self.assertEqual(rc, 0, stderr)
        self.assertEqual(
            events,
            [
                "docker\tcompose\t-f\t"
                f"{REPO_ROOT / 'infra/docker/compose.performance.yaml'}\tbuild\tk6\tk6-browser",
                "python3\t-m\tpunch\tmenu\t"
                f"{REPO_ROOT / 'tests/performance/k6/workflows'}",
            ],
        )

    def test_missing_menu_dependency_fails_before_build_choice(self) -> None:
        rc, events, stderr = self.run_interactive_wrapper("y", dependency_status=1)
        self.assertEqual(rc, 1)
        self.assertEqual(events, [])
        self.assertIn("python3 -m venv .cache/punch-venv", stderr)
        self.assertIn(
            ".cache/punch-venv/bin/python3 -m pip install -r vendor/punch/requirements.txt",
            stderr,
        )
        self.assertNotIn("Traceback", stderr)


if __name__ == "__main__":
    unittest.main()
