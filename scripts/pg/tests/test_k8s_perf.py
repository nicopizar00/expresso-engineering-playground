from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import cli, k8s, k8s_perf, perf  # noqa: E402


class PerfPlatformContractTests(unittest.TestCase):
    def test_pushed_images_are_the_ones_the_manifests_pull(self) -> None:
        kustomization = yaml.safe_load(
            (k8s_perf.PERF_DIR / "punch" / "kustomization.yaml").read_text(encoding="utf-8")
        )
        mapped = {f"{i['newName']}:{i['newTag']}" for i in kustomization["images"]}
        self.assertEqual(mapped, {image.tag for image in k8s_perf.PERF_IMAGES})

    def test_argo_workflows_installs_minimal_crds(self) -> None:
        # The release install.yaml ships ~12 MB of full-validation CRDs; on a
        # 4.5 GB minikube they pushed kube-apiserver and Argo CD's application
        # controller (which parses every CRD schema for diffs) into OOM churn.
        resources = yaml.safe_load(
            (k8s_perf.PERF_DIR / "argo-workflows" / "kustomization.yaml").read_text(encoding="utf-8")
        )["resources"]
        self.assertIn(
            "https://github.com/argoproj/argo-workflows//manifests/base/crds/minimal?ref=v4.1.5",
            resources,
        )
        self.assertIn(
            "https://github.com/argoproj/argo-workflows//manifests/cluster-install-no-crds?ref=v4.1.5",
            resources,
        )
        self.assertFalse([r for r in resources if r.endswith("install.yaml")])

    def test_argo_workflows_images_are_pinned_to_the_release(self) -> None:
        kustomization = yaml.safe_load(
            (k8s_perf.PERF_DIR / "argo-workflows" / "kustomization.yaml").read_text(encoding="utf-8")
        )
        self.assertEqual(
            {i["name"]: i["newTag"] for i in kustomization["images"]},
            {"quay.io/argoproj/argocli": "v4.1.5", "quay.io/argoproj/workflow-controller": "v4.1.5"},
        )

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


class RuntimeSplitTests(unittest.TestCase):
    def test_compose_is_the_default(self) -> None:
        self.assertEqual(perf.split_runtime(["--produce", "carts"]), ("compose", ["--produce", "carts"]))

    def test_runtime_flag_in_both_spellings(self) -> None:
        self.assertEqual(perf.split_runtime(["--runtime", "k8s", "--config", "1-iteration"]),
                         ("k8s", ["--config", "1-iteration"]))
        self.assertEqual(perf.split_runtime(["--runtime=k8s"]), ("k8s", []))

    def test_unknown_runtime_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            perf.split_runtime(["--runtime", "nomad"])

    @mock.patch("pg.k8s_perf.run_job", return_value=0)
    def test_perf_run_routes_k8s_to_argo(self, run_job) -> None:
        self.assertEqual(perf.run("http-cart", ["--runtime", "k8s", "--produce", "carts"]), 0)
        run_job.assert_called_once_with("http-cart", ["--produce", "carts"])


class RunInputTests(unittest.TestCase):
    def test_preset_names_resolve(self) -> None:
        self.assertEqual(k8s_perf.resolve_preset("1-iteration"), "1-iteration")
        self.assertIsNone(k8s_perf.resolve_preset(None))

    def test_unknown_or_path_presets_are_rejected(self) -> None:
        for value in ("nope", "tests/performance/k6/options/1-iteration.json"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                k8s_perf.resolve_preset(value)

    def test_extra_env_forwards_set_names_except_base_url(self) -> None:
        environ = {"BASE_URL": "http://x", "EXPECT_TEMPERATURE": "hot", "ORDER_COOL_DOWN_SECONDS": ""}
        forward = ("BASE_URL", "EXPECT_TEMPERATURE", "ORDER_COOL_DOWN_SECONDS")
        self.assertEqual(k8s_perf.extra_env(forward, environ), ["EXPECT_TEMPERATURE=hot"])

    def test_extra_env_rejects_whitespace(self) -> None:
        with self.assertRaises(ValueError):
            k8s_perf.extra_env(("EXPECT_TEMPERATURE",), {"EXPECT_TEMPERATURE": "very hot"})

    def test_data_overrides_are_not_accepted(self) -> None:
        with self.assertRaises(SystemExit), mock.patch("sys.stderr"):
            k8s_perf.parse_run_args("http-orders", ["--data", "carts=x.csv"])


class WorkflowManifestTests(unittest.TestCase):
    def test_defaults_keep_the_template_arguments(self) -> None:
        manifest = k8s_perf.workflow_manifest(
            "http-purchase", config=None, produce=(), env_pairs=(), base_url=None
        )
        self.assertEqual(manifest["metadata"], {"generateName": "http-purchase-", "namespace": "punch"})
        self.assertEqual(manifest["spec"]["workflowTemplateRef"], {"name": "http-purchase"})
        self.assertEqual(manifest["spec"]["arguments"]["parameters"], [])

    def test_every_knob_becomes_a_parameter(self) -> None:
        manifest = k8s_perf.workflow_manifest(
            "http-orders-status",
            config="1-iteration",
            produce=("orders", "carts"),
            env_pairs=("EXPECT_TEMPERATURE=hot", "ORDER_COOL_DOWN_SECONDS=5"),
            base_url="http://bff:3001",
        )
        self.assertEqual(
            manifest["spec"]["arguments"]["parameters"],
            [
                {"name": "config", "value": "1-iteration"},
                {"name": "produce", "value": "orders,carts"},
                {"name": "extra-env", "value": "EXPECT_TEMPERATURE=hot ORDER_COOL_DOWN_SECONDS=5"},
                {"name": "base-url", "value": "http://bff:3001"},
            ],
        )


class RunResultTests(unittest.TestCase):
    def test_success_collects_dataset_counts_from_nodes(self) -> None:
        workflow = {"status": {"phase": "Succeeded", "nodes": {
            "a": {"outputs": {"parameters": [{"name": "datasets", "value": "orders=5"}]}},
            "b": {},
        }}}
        result = k8s_perf.run_result(workflow)
        self.assertTrue(result.passed)
        self.assertEqual(result.datasets, ("orders=5",))

    def test_failed_phase_carries_the_message(self) -> None:
        result = k8s_perf.run_result({"status": {"phase": "Failed", "message": "child failed"}})
        self.assertFalse(result.passed)
        self.assertEqual(result.message, "child failed")

    def test_error_phase_is_a_failure(self) -> None:
        self.assertFalse(k8s_perf.run_result({"status": {"phase": "Error"}}).passed)

    def test_failure_details_name_the_failed_pod_nodes(self) -> None:
        workflow = {"status": {"phase": "Failed", "message": "child 'x' failed", "nodes": {
            "a": {"type": "Steps", "phase": "Failed", "displayName": "x", "message": "child failed"},
            "b": {"type": "Pod", "phase": "Error", "displayName": "k6",
                  "message": "init: Error (exit code 64): s3 unreachable"},
            "c": {"type": "Pod", "phase": "Succeeded", "displayName": "ok"},
        }}}
        self.assertEqual(
            k8s_perf.run_result(workflow).details,
            ("k6: init: Error (exit code 64): s3 unreachable",),
        )

    def test_waiting_reason_reports_image_and_config_errors(self) -> None:
        pods = {"items": [{"metadata": {"name": "p"}, "status": {"containerStatuses": [
            {"name": "main", "state": {"waiting": {
                "reason": "ImagePullBackOff", "message": "Back-off pulling image"}}}]}}]}
        self.assertEqual(k8s_perf.waiting_reason(pods), "ImagePullBackOff: Back-off pulling image")
        creating = {"items": [{"metadata": {"name": "p"}, "status": {"containerStatuses": [
            {"name": "main", "state": {"waiting": {"reason": "ContainerCreating"}}}]}}]}
        self.assertIsNone(k8s_perf.waiting_reason(creating))

    def test_main_pod_waits_for_the_main_container_to_start(self) -> None:
        waiting = {"items": [{"metadata": {"name": "p"}, "status": {"containerStatuses": [
            {"name": "main", "state": {"waiting": {"reason": "ImagePullBackOff"}}}]}}]}
        running = {"items": [{"metadata": {"name": "p"}, "status": {"containerStatuses": [
            {"name": "wait", "state": {"running": {}}},
            {"name": "main", "state": {"running": {}}}]}}]}
        self.assertIsNone(k8s_perf.main_pod(waiting))
        self.assertEqual(k8s_perf.main_pod(running), "p")


class RunJobGuardTests(unittest.TestCase):
    @mock.patch("pg.k8s_perf.fail")
    @mock.patch("pg.k8s_perf.subprocess.run")
    def test_path_config_fails_before_kubectl(self, run, fail) -> None:
        code = k8s_perf.run_job(
            "http-purchase", ["--config", "tests/performance/k6/options/1-iteration.json"]
        )
        self.assertEqual(code, 1)
        run.assert_not_called()
        self.assertIn("preset name", fail.call_args.args[0])

    @mock.patch("pg.k8s_perf.fail")
    @mock.patch("pg.k8s_perf.subprocess.run")
    def test_undeclared_produce_fails_before_kubectl(self, run, _fail) -> None:
        self.assertEqual(k8s_perf.run_job("http-orders-status", ["--produce", "orders"]), 1)
        run.assert_not_called()


class ArgoResourceTests(unittest.TestCase):
    @mock.patch("pg.k8s_perf.subprocess.run")
    def test_phase_queries_argos_workflow_resource(self, run) -> None:
        run.return_value = mock.Mock(stdout="Running\n")
        self.assertEqual(k8s_perf._phase("run-1"), "Running")
        args = run.call_args[0][0]
        self.assertIn("workflow", args)
        self.assertNotIn("job", args)


if __name__ == "__main__":
    unittest.main()
