from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import argocd, cli  # noqa: E402
from pg.paths import K8S_DIR, PERF_OPTIONS_DIR, REPO_ROOT  # noqa: E402

APPS_DIR = REPO_ROOT / "infra" / "argocd" / "applications"


def _app(name: str) -> dict:
    return yaml.safe_load((APPS_DIR / f"{name}.yaml").read_text(encoding="utf-8"))


class ApplicationManifestTests(unittest.TestCase):
    def test_applications_exist_in_creation_order(self) -> None:
        self.assertEqual(argocd.APPLICATIONS, ("punch-platform", "mini-commerce"))
        self.assertEqual({p.stem for p in APPS_DIR.glob("*.yaml")}, set(argocd.APPLICATIONS))

    def test_applications_point_at_kustomizations_in_this_repo(self) -> None:
        expected = {"punch-platform": "infra/k8s/perf", "mini-commerce": "infra/argocd/mini-commerce"}
        for name, path in expected.items():
            with self.subTest(app=name):
                source = _app(name)["spec"]["source"]
                self.assertEqual(source["path"], path)
                self.assertTrue((REPO_ROOT / path / "kustomization.yaml").is_file())
                self.assertEqual(
                    source["repoURL"],
                    "https://github.com/nicopizar00/expresso-engineering-playground.git",
                )
                self.assertEqual(source["targetRevision"], "main")

    def test_sync_policy_never_self_heals_or_prunes(self) -> None:
        for name in argocd.APPLICATIONS:
            policy = _app(name)["spec"]["syncPolicy"]
            self.assertEqual(policy["automated"], {"prune": False, "selfHeal": False})
            self.assertIn("ServerSideApply=true", policy["syncOptions"])
            self.assertIn("SkipDryRunOnMissingResource=true", policy["syncOptions"])

    def test_with_revision_rewrites_the_one_target_revision(self) -> None:
        text = (APPS_DIR / "punch-platform.yaml").read_text(encoding="utf-8")
        rewritten = yaml.safe_load(argocd.with_revision(text, "feat/punch-k8s-native"))
        self.assertEqual(rewritten["spec"]["source"]["targetRevision"], "feat/punch-k8s-native")
        with self.assertRaises(ValueError):
            argocd.with_revision("kind: X\n", "main")


class PostSyncSmokeTests(unittest.TestCase):
    def test_smoke_runs_http_purchase_once_after_sync(self) -> None:
        smoke = yaml.safe_load(
            (REPO_ROOT / "infra" / "argocd" / "mini-commerce" / "postsync-smoke.yaml").read_text()
        )
        self.assertEqual(smoke["kind"], "Workflow")
        self.assertEqual(smoke["metadata"]["namespace"], "punch")
        self.assertEqual(smoke["metadata"]["annotations"], {
            "argocd.argoproj.io/hook": "PostSync",
            "argocd.argoproj.io/hook-delete-policy": "BeforeHookCreation",
        })
        self.assertEqual(smoke["spec"]["workflowTemplateRef"], {"name": "http-purchase"})
        [config] = smoke["spec"]["arguments"]["parameters"]
        self.assertEqual(config, {"name": "config", "value": "1-iteration"})
        self.assertTrue((PERF_OPTIONS_DIR / "1-iteration.json").is_file())
        self.assertTrue((K8S_DIR / "perf" / "punch" / "workflows" / "http-purchase.yaml").is_file())


class SettledTests(unittest.TestCase):
    @staticmethod
    def app(revision: str, operation_revision: str, phase: str, health: str = "Healthy") -> dict:
        return {"status": {
            "sync": {"status": "Synced", "revision": revision},
            "health": {"status": health},
            "operationState": {"phase": phase, "syncResult": {"revision": operation_revision}},
        }}

    def test_succeeded_and_healthy_for_the_current_revision(self) -> None:
        self.assertTrue(argocd.app_settled(self.app("abc", "abc", "Succeeded")))

    def test_failed_operation_for_the_current_revision(self) -> None:
        self.assertFalse(argocd.app_settled(self.app("abc", "abc", "Failed")))

    def test_stale_operation_from_an_older_revision_is_ignored(self) -> None:
        self.assertIsNone(argocd.app_settled(self.app("def", "abc", "Failed")))

    def test_still_progressing(self) -> None:
        self.assertIsNone(argocd.app_settled(self.app("abc", "abc", "Running")))
        self.assertIsNone(argocd.app_settled(self.app("abc", "abc", "Succeeded", "Progressing")))
        self.assertIsNone(argocd.app_settled({}))


class ArgsTests(unittest.TestCase):
    def test_revision_defaults_to_main(self) -> None:
        self.assertEqual(argocd.parse_args([]), "main")

    def test_revision_in_both_spellings(self) -> None:
        self.assertEqual(argocd.parse_args(["--revision", "feat/x"]), "feat/x")
        self.assertEqual(argocd.parse_args(["--revision=feat/x"]), "feat/x")

    @mock.patch("pg.argocd.fail")
    def test_unknown_argument(self, _fail) -> None:
        self.assertIsNone(argocd.parse_args(["--bogus"]))

    def test_cli_registers_the_command(self) -> None:
        self.assertIn("argocd:up", cli.COMMANDS)


if __name__ == "__main__":
    unittest.main()
