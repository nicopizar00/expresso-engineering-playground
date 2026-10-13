from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import cli, k8s, k8s_perf  # noqa: E402


class PerfPlatformContractTests(unittest.TestCase):
    def test_pushed_images_are_the_ones_the_manifests_pull(self) -> None:
        kustomization = yaml.safe_load(
            (k8s_perf.PERF_DIR / "punch" / "kustomization.yaml").read_text(encoding="utf-8")
        )
        mapped = {f"{i['newName']}:{i['newTag']}" for i in kustomization["images"]}
        self.assertEqual(mapped, {image.tag for image in k8s_perf.PERF_IMAGES})

    def test_images_live_in_the_registry_addon(self) -> None:
        for image in k8s_perf.PERF_IMAGES:
            self.assertTrue(image.tag.startswith(f"{k8s_perf.REGISTRY}/"))

    def test_punch_kubectl_pins_context_and_namespace(self) -> None:
        self.assertEqual(
            k8s_perf.punch("get", "workflowtemplates")[:5],
            ["kubectl", "--context", k8s.PROFILE, "-n", "punch"],
        )

    def test_cli_registers_the_command(self) -> None:
        self.assertIn("k8s:perf:up", cli.COMMANDS)

    @mock.patch("pg.k8s_perf.fail")
    def test_up_rejects_unknown_arguments(self, _fail) -> None:
        self.assertEqual(k8s_perf.up(["--bogus"]), 1)


if __name__ == "__main__":
    unittest.main()
