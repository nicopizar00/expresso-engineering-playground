"""./k8s — the bash + kubectl counterpart of ./dev k8s:* and --runtime k8s.

The script re-declares facts the Python orchestrator also owns (images,
cluster size, registry, S3 credentials). These tests keep the two in step
and pin the argument checks that must fail before any cluster call.
"""

from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import k8s, k8s_perf  # noqa: E402
from pg.paths import K8S_DIR, REPO_ROOT  # noqa: E402

SCRIPT = REPO_ROOT / "k8s"
COMMANDS = (
    "up", "perf:up", "argocd:up", "run", "verify", "evidence",
    "s3", "ui", "forward", "status", "down", "help",
)


def _k8s(*args: str) -> subprocess.CompletedProcess[str]:
    # No PATH changes: every case here must fail before kubectl or minikube.
    return subprocess.run(
        ["bash", str(SCRIPT), *args], capture_output=True, text=True, check=False, cwd=REPO_ROOT
    )


def _text() -> str:
    return SCRIPT.read_text(encoding="utf-8")


def _assignment(name: str) -> str:
    match = re.search(rf"^{name}=(\S+)$", _text(), re.MULTILINE)
    assert match, f"{name}= not found in ./k8s"
    return match.group(1).strip('"')


class CliTests(unittest.TestCase):
    def test_script_is_executable_valid_bash(self) -> None:
        self.assertTrue(SCRIPT.stat().st_mode & 0o111)
        self.assertEqual(subprocess.run(["bash", "-n", str(SCRIPT)]).returncode, 0)

    def test_help_lists_every_command(self) -> None:
        result = _k8s("help")
        self.assertEqual(result.returncode, 0, result.stderr)
        for command in COMMANDS:
            self.assertRegex(result.stdout, rf"(?m)^\s+{re.escape(command)}\b")

    def test_unknown_command_fails(self) -> None:
        self.assertEqual(_k8s("nope").returncode, 1)

    def test_run_without_a_job_shows_usage(self) -> None:
        result = _k8s("run")
        self.assertEqual(result.returncode, 1)
        self.assertIn("usage: ./k8s run <job>", result.stderr)

    def test_run_rejects_a_config_path_before_touching_the_cluster(self) -> None:
        result = _k8s("run", "http-purchase", "--config", "tests/performance/k6/options/1-iteration.json")
        self.assertEqual(result.returncode, 1)
        self.assertIn("preset name", result.stderr)

    def test_run_rejects_an_unknown_preset(self) -> None:
        result = _k8s("run", "http-purchase", "--config", "nope")
        self.assertEqual(result.returncode, 1)
        self.assertIn('unknown preset "nope"', result.stderr)

    def test_argocd_up_rejects_an_unsafe_revision(self) -> None:
        result = _k8s("argocd:up", "--revision", "main;rm -rf /")
        self.assertEqual(result.returncode, 1)
        self.assertIn("invalid revision", result.stderr)

    def test_ui_needs_a_known_target(self) -> None:
        self.assertEqual(_k8s("ui", "nope").returncode, 1)


class OrchestratorParityTests(unittest.TestCase):
    def test_builds_the_same_images_as_the_orchestrator(self) -> None:
        built = set(re.findall(r"^\s*build_image (\S+)", _text(), re.MULTILINE))
        expected = {image.tag for image in k8s.IMAGES}
        expected |= {image.tag.replace(k8s_perf.REGISTRY, "$REGISTRY") for image in k8s_perf.PERF_IMAGES}
        self.assertEqual(built, expected)

    def test_web_build_args_match(self) -> None:
        web = next(image for image in k8s.IMAGES if image.tag == "mini-commerce/web:local")
        for key, _value in web.build_args:
            self.assertIn(f"{key}=", _text())

    def test_cluster_and_registry_constants_match(self) -> None:
        self.assertEqual(_assignment("PROFILE"), k8s.PROFILE)
        self.assertEqual(int(_assignment("MEMORY_MB")), k8s.CLUSTER_MEMORY_MB)
        self.assertEqual(int(_assignment("CPUS")), k8s.CLUSTER_CPUS)
        self.assertEqual(_assignment("REGISTRY"), k8s_perf.REGISTRY)
        self.assertEqual(_assignment("BUCKET"), k8s_perf.BUCKET)

    def test_s3_credentials_match_the_local_secret(self) -> None:
        generator = yaml.safe_load(
            (K8S_DIR / "perf" / "aws-local" / "kustomization.yaml").read_text(encoding="utf-8")
        )["secretGenerator"][0]
        literals = dict(item.split("=", 1) for item in generator["literals"])
        self.assertEqual(_assignment("S3_ACCESS_KEY"), literals["accessKey"])
        self.assertEqual(_assignment("S3_SECRET_KEY"), literals["secretKey"])


if __name__ == "__main__":
    unittest.main()
