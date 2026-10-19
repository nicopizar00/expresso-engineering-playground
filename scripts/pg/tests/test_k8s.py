from __future__ import annotations

import json
import re
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import k8s  # noqa: E402
from pg.paths import K8S_DIR  # noqa: E402


class ManifestContractTests(unittest.TestCase):
    # imagePullPolicy is Never, so an image the manifests reference but
    # k8s:up never builds would leave its pod in ErrImageNeverPull.
    def test_every_local_image_in_manifests_is_built(self) -> None:
        referenced = set()
        for path in K8S_DIR.glob("*.yaml"):
            referenced.update(re.findall(r"image: (mini-commerce/\S+)", path.read_text()))
        self.assertEqual(referenced, {image.tag for image in k8s.IMAGES})

    def test_forwards_target_declared_service_ports(self) -> None:
        for service, _local, remote in k8s.FORWARDS:
            text = (K8S_DIR / f"{service}.yaml").read_text()
            self.assertIn(f"name: {service}\n", text)
            self.assertIn(f"port: {remote}\n", text)

    def test_restarted_deployments_exist(self) -> None:
        for name in k8s.APP_DEPLOYMENTS:
            text = (K8S_DIR / f"{name}.yaml").read_text()
            self.assertRegex(text, rf"kind: Deployment\nmetadata:\n  name: {name}\n")


class CommandTests(unittest.TestCase):
    def test_kubectl_pins_profile_context(self) -> None:
        cmd = k8s.kubectl("get", "pods")
        self.assertEqual(cmd[:3], ["kubectl", "--context", k8s.PROFILE])
        self.assertEqual(cmd[3:5], ["-n", k8s.NAMESPACE])

    def test_build_cmd_for_dev_stage(self) -> None:
        image = next(i for i in k8s.IMAGES if i.tag == "mini-commerce/bff-dev:local")
        self.assertEqual(
            k8s.build_cmd(image),
            [
                "docker",
                "build",
                "-t",
                image.tag,
                "-f",
                "apps/bff/Dockerfile",
                "--target",
                "dev",
                ".",
            ],
        )

    def test_web_build_bakes_in_cluster_service_names(self) -> None:
        image = next(i for i in k8s.IMAGES if i.tag == "mini-commerce/web:local")
        cmd = k8s.build_cmd(image)
        self.assertIn("BFF_INTERNAL_URL=http://bff:3001", cmd)
        self.assertIn("VISUALIZER_INTERNAL_URL=http://visualizer-3d:80", cmd)

    def test_parse_docker_env_drops_blank_values(self) -> None:
        env = k8s.parse_docker_env(
            "SSH_AGENT_PID=\nDOCKER_TLS_VERIFY=1\nDOCKER_HOST=tcp://127.0.0.1:57111\n"
            "SSH_AUTH_SOCK=\n"
        )
        self.assertEqual(env, {"DOCKER_TLS_VERIFY": "1", "DOCKER_HOST": "tcp://127.0.0.1:57111"})


def _pod(name, ready, transition, deleting=False):
    meta = {"name": name}
    if deleting:
        meta["deletionTimestamp"] = "2026-10-13T15:20:00Z"
    return {
        "metadata": meta,
        "status": {
            "conditions": [
                {"type": "Ready", "status": ready, "lastTransitionTime": transition},
            ]
        },
    }


class RestartReadinessTests(unittest.TestCase):
    SINCE = datetime(2026, 10, 13, 15, 20, 0, tzinfo=timezone.utc)

    def test_stale_ready_from_before_the_start_still_pending(self) -> None:
        pods = {
            "items": [
                _pod("bff", "True", "2026-10-13T15:10:00Z"),
                _pod("web", "True", "2026-10-13T15:20:31Z"),
                _pod("postgres", "False", "2026-10-13T15:20:05Z"),
                _pod("old-bff", "True", "2026-10-13T15:00:00Z", deleting=True),
            ]
        }
        self.assertEqual(k8s.pods_not_ready_since(pods, self.SINCE), ["bff", "postgres"])

    def test_empty_namespace_is_ready(self) -> None:
        self.assertEqual(k8s.pods_not_ready_since({"items": []}, self.SINCE), [])

    def test_parse_docker_time_truncates_nanoseconds(self) -> None:
        self.assertEqual(
            k8s.parse_docker_time("2026-10-13T15:34:07.351046801Z\n"),
            datetime(2026, 10, 13, 15, 34, 7, tzinfo=timezone.utc),
        )

    def test_parse_docker_time_normalizes_offset(self) -> None:
        self.assertEqual(
            k8s.parse_docker_time("2026-10-13T12:34:07.5-03:00"),
            datetime(2026, 10, 13, 15, 34, 7, tzinfo=timezone.utc),
        )

    def test_parse_docker_time_rejects_garbage(self) -> None:
        self.assertIsNone(k8s.parse_docker_time("not a time"))


class UpTests(unittest.TestCase):
    def _run_up(self, args):
        with mock.patch.object(k8s.shutil, "which", return_value="/usr/bin/x"), mock.patch.object(
            k8s, "cluster_running", return_value=True
        ), mock.patch.object(k8s.subprocess, "run") as run, mock.patch("builtins.print"):
            run.return_value.returncode = 0
            run.return_value.stdout = ""
            rc = k8s.up(args)
        return rc, [call.args[0] for call in run.call_args_list]

    def test_no_build_skips_builds_and_restarts(self) -> None:
        rc, cmds = self._run_up(["--no-build"])
        self.assertEqual(rc, 0)
        self.assertFalse(any(cmd[:2] == ["docker", "build"] for cmd in cmds))
        self.assertFalse(any("restart" in cmd for cmd in cmds))
        self.assertTrue(any(cmd[-3:] == ["apply", "-f", "-"] for cmd in cmds))

    def test_build_restarts_app_deployments_after_apply(self) -> None:
        rc, cmds = self._run_up([])
        self.assertEqual(rc, 0)
        builds = [i for i, cmd in enumerate(cmds) if cmd[:2] == ["docker", "build"]]
        apply = next(i for i, cmd in enumerate(cmds) if cmd[-3:] == ["apply", "-f", "-"])
        restart = next(i for i, cmd in enumerate(cmds) if "restart" in cmd)
        self.assertEqual(len(builds), len(k8s.IMAGES))
        self.assertLess(max(builds), apply)
        self.assertLess(apply, restart)

    def test_rejects_unknown_argument(self) -> None:
        with mock.patch("builtins.print"):
            self.assertEqual(k8s.up(["--fresh"]), 1)


class ClusterSizingTests(unittest.TestCase):
    def test_cluster_memory_fits_the_perf_platform(self) -> None:
        self.assertGreaterEqual(k8s.CLUSTER_MEMORY_MB, 4608)

    def test_profile_memory_reads_the_named_profile(self) -> None:
        listing = json.dumps(
            {
                "invalid": [],
                "valid": [
                    {"Name": "other", "Config": {"Memory": 8192}},
                    {"Name": "mini-commerce", "Config": {"Memory": 3072}},
                ],
            }
        )
        self.assertEqual(k8s.profile_memory_mb(listing, "mini-commerce"), 3072)

    def test_profile_memory_is_none_for_unknown_profile_or_garbage(self) -> None:
        self.assertIsNone(k8s.profile_memory_mb('{"valid": []}', "mini-commerce"))
        self.assertIsNone(k8s.profile_memory_mb("not json", "mini-commerce"))


class ServerSideApplyTests(unittest.TestCase):
    @mock.patch("pg.k8s.subprocess.run")
    def test_first_pass_success_needs_no_retry(self, run) -> None:
        run.return_value = mock.Mock(returncode=0)
        self.assertTrue(k8s.apply_server_side("kind: X", ("crd.example.io",)))
        self.assertEqual(run.call_count, 1)
        self.assertIn("--server-side", run.call_args.args[0])
        self.assertIn("--force-conflicts", run.call_args.args[0])

    @mock.patch("pg.k8s.subprocess.run")
    def test_crd_race_waits_for_crds_then_applies_again(self, run) -> None:
        run.side_effect = [
            mock.Mock(returncode=1),
            mock.Mock(returncode=0),
            mock.Mock(returncode=0),
        ]
        self.assertTrue(k8s.apply_server_side("kind: X", ("crd.example.io",)))
        self.assertEqual(run.call_count, 3)
        self.assertIn("crd/crd.example.io", run.call_args_list[1].args[0])

    @mock.patch("pg.k8s.fail")
    @mock.patch("pg.k8s.subprocess.run")
    def test_second_failure_is_reported(self, run, _fail) -> None:
        run.return_value = mock.Mock(returncode=1)
        self.assertFalse(k8s.apply_server_side("kind: X", ()))
        self.assertEqual(run.call_count, 2)


class RolloutWaitTests(unittest.TestCase):
    @mock.patch("pg.k8s.subprocess.run")
    def test_waits_in_the_given_namespace(self, run) -> None:
        run.return_value = mock.Mock(returncode=0)
        self.assertTrue(k8s.wait_rollouts("argo", ("deployment/workflow-controller",)))
        cmd = run.call_args.args[0]
        self.assertEqual(cmd[:5], ["kubectl", "--context", k8s.PROFILE, "-n", "argo"])
        self.assertIn("deployment/workflow-controller", cmd)


if __name__ == "__main__":
    unittest.main()
