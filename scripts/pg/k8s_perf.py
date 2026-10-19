"""k8s:perf:up and `perf:<id> --runtime k8s` — Punch on Argo Workflows.

The cluster side is plain YAML (infra/k8s/perf/ plus Punch's generic template
in vendor/punch/k8s/) and needs no Python. This module is a local
convenience over kubectl: build and push the k6 images into the registry
addon (the ECR stand-in), apply the platform, and run one job by id.
kubectl-only equivalents: docs/performance/k8s-runtime.md.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from dataclasses import dataclass
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

from pg import k8s
from pg.ansi import bold, fail, header, info, pass_, warn
from pg.paths import K8S_DIR, PERF_JOBS_DIR, PERF_OPTIONS_DIR, REPO_ROOT

PERF_DIR = K8S_DIR / "perf"
NAMESPACE = "punch"
REGISTRY = "localhost:5000"
BUCKET = "punch-artifacts"
# infra/k8s/perf/punch maps Punch's k6-scenarios / k6-scenarios-browser
# placeholders to these tags.
PERF_IMAGES: Tuple[k8s.Image, ...] = (
    k8s.Image(f"{REGISTRY}/mini-commerce/k6:local", ".", "infra/docker/k6.Dockerfile"),
    k8s.Image(
        f"{REGISTRY}/mini-commerce/k6-browser:local", ".", "infra/docker/k6-browser.Dockerfile"
    ),
)
CRDS: Tuple[str, ...] = ("workflowtemplates.argoproj.io", "workflows.argoproj.io")
ROLLOUTS: Tuple[Tuple[str, str], ...] = (
    ("argo", "deployment/workflow-controller"),
    ("argo", "deployment/argo-server"),
    ("aws-local", "deployment/seaweedfs"),
)
FINISHED: Tuple[str, ...] = ("Succeeded", "Failed", "Error")
RUN_TIMEOUT_S = 1200  # the template's 900 s deadline plus scheduling slack
POLL_S = 2
STOP_PATCH = '{"spec":{"shutdown":"Stop"}}'


def punch(*args: str) -> List[str]:
    return k8s.kubectl("-n", NAMESPACE, *args, namespaced=False)


def _push_images() -> bool:
    enable = ["minikube", "-p", k8s.PROFILE, "addons", "enable", "registry"]
    if subprocess.run(enable, check=False).returncode != 0:
        fail("Could not enable the minikube registry addon")
        return False
    ready = k8s.kubectl(
        "-n",
        "kube-system",
        "wait",
        "--for=condition=Ready",
        "pod",
        "-l",
        "kubernetes.io/minikube-addons=registry",
        "--timeout=180s",
        namespaced=False,
    )
    if subprocess.run(ready, check=False).returncode != 0:
        fail("The registry addon did not become ready")
        return False
    env = k8s.cluster_docker_env()
    if env is None:
        return False
    for image in PERF_IMAGES:
        info(f"Building {image.tag}...")
        if (
            subprocess.run(k8s.build_cmd(image), cwd=REPO_ROOT, env=env, check=False).returncode
            != 0
        ):
            fail(f"Build failed: {image.tag}")
            return False
        if subprocess.run(["docker", "push", image.tag], env=env, check=False).returncode != 0:
            fail(f"Push failed: {image.tag}")
            return False
    pass_(f"k6 images pushed to {REGISTRY}")
    return True


def up(args: Sequence[str]) -> int:
    build = True
    for arg in args:
        if arg == "--no-build":
            build = False
        else:
            fail(f"Unknown argument '{arg}'. Use: ./dev k8s:perf:up [--no-build]")
            return 1

    header("Deploying the Punch perf platform to minikube...")
    if not k8s.require_tools():
        return 1
    if not k8s.cluster_running():
        fail(f"Cluster '{k8s.PROFILE}' is not running. Run ./dev k8s:up first.")
        return 1
    if build and not _push_images():
        return 1
    rendered = k8s.render(PERF_DIR)
    if rendered is None or not k8s.apply_server_side(rendered, CRDS):
        return 1
    pass_("Perf platform applied")
    info("Waiting for rollouts...")
    for namespace, resource in ROLLOUTS:
        if not k8s.wait_rollouts(namespace, (resource,)):
            return 1
    print()
    subprocess.run(punch("get", "workflowtemplates"), check=False)
    print()
    pass_("Punch is ready on Kubernetes")
    info(f"Run a job: {bold('./dev perf:http-purchase --runtime k8s --config 1-iteration')}")
    info(
        f"Argo UI: kubectl --context {k8s.PROFILE} -n argo port-forward svc/argo-server "
        "2746:2746, then https://localhost:2746"
    )
    print()
    return 0


def parse_run_args(name: str, args: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=f"./dev perf:{name} --runtime k8s")
    parser.add_argument(
        "--config",
        default=None,
        metavar="PRESET",
        help="k6 options preset from tests/performance/k6/options/ (default: the job's).",
    )
    parser.add_argument(
        "--produce",
        action="append",
        default=[],
        metavar="DATASET",
        help=f"Publish a declared dataset to s3://{BUCKET}/datasets/ (repeatable, or 'all').",
    )
    parser.add_argument(
        "--base-url",
        default=None,
        metavar="URL",
        help="Target inside the cluster (default: the template's Service URL).",
    )
    return parser.parse_args(list(args))


def resolve_preset(value: Optional[str]) -> Optional[str]:
    """k8s runs mount presets from the punch-k6-options ConfigMap, so only
    preset names work — not the file paths compose accepts."""
    if value is None:
        return None
    if not (PERF_OPTIONS_DIR / f"{value}.json").is_file():
        raise ValueError(
            f'unknown preset "{value}"; on k8s --config takes a preset name from '
            "tests/performance/k6/options/"
        )
    return value


def extra_env(forward: Sequence[str], environ: Mapping[str, str]) -> List[str]:
    """Forwarded names (other than BASE_URL) set on the host, as K=V pairs —
    the same host-environment forwarding compose does."""
    pairs: List[str] = []
    for name in forward:
        value = environ.get(name)
        if name == "BASE_URL" or not value:
            continue
        if any(ch.isspace() for ch in value):
            raise ValueError(f"{name} contains whitespace, which k8s runs cannot forward")
        pairs.append(f"{name}={value}")
    return pairs


def workflow_manifest(
    name: str,
    *,
    config: Optional[str],
    produce: Sequence[str],
    env_pairs: Sequence[str],
    base_url: Optional[str],
) -> Dict:
    """A Workflow running the `name` WorkflowTemplate; unset knobs keep the
    template's defaults."""
    parameters = []
    if config is not None:
        parameters.append({"name": "config", "value": config})
    if produce:
        parameters.append({"name": "produce", "value": ",".join(produce)})
    if env_pairs:
        parameters.append({"name": "extra-env", "value": " ".join(env_pairs)})
    if base_url:
        parameters.append({"name": "base-url", "value": base_url})
    return {
        "apiVersion": "argoproj.io/v1alpha1",
        "kind": "Workflow",
        "metadata": {"generateName": f"{name}-", "namespace": NAMESPACE},
        "spec": {"workflowTemplateRef": {"name": name}, "arguments": {"parameters": parameters}},
    }


@dataclass(frozen=True)
class RunResult:
    phase: str
    message: str
    datasets: Tuple[str, ...]
    # "<step>: <message>" for each failed pod node — the actual reason.
    details: Tuple[str, ...] = ()

    @property
    def passed(self) -> bool:
        return self.phase == "Succeeded"


def run_result(workflow: Mapping) -> RunResult:
    status = workflow.get("status", {})
    datasets = set()
    details = []
    for node in status.get("nodes", {}).values():
        for parameter in node.get("outputs", {}).get("parameters", []):
            if parameter.get("name") == "datasets":
                datasets.update(parameter.get("value", "").split())
        if node.get("type") == "Pod" and node.get("phase") in ("Failed", "Error"):
            details.append(
                f"{node.get('displayName', '?')}: {node.get('message', '')}".rstrip(": ")
            )
    return RunResult(
        status.get("phase", "Unknown"),
        status.get("message", ""),
        tuple(sorted(datasets)),
        tuple(sorted(details)),
    )


def main_pod(pods: Mapping) -> Optional[str]:
    """The workflow pod whose `main` container has started."""
    for pod in pods.get("items", []):
        for container in pod.get("status", {}).get("containerStatuses", []):
            state = container.get("state", {})
            if container.get("name") == "main" and ("running" in state or "terminated" in state):
                return pod["metadata"]["name"]
    return None


# Waiting reasons worth surfacing: the run cannot start until someone acts.
STUCK_REASONS = (
    "ErrImagePull",
    "ImagePullBackOff",
    "InvalidImageName",
    "CreateContainerConfigError",
)


def waiting_reason(pods: Mapping) -> Optional[str]:
    """Why the `main` container cannot start, when that needs attention."""
    for pod in pods.get("items", []):
        for container in pod.get("status", {}).get("containerStatuses", []):
            waiting = container.get("state", {}).get("waiting", {})
            if container.get("name") == "main" and waiting.get("reason") in STUCK_REASONS:
                return f"{waiting['reason']}: {waiting.get('message', '')}".rstrip(": ")
    return None


def _phase(run: str) -> str:
    out = subprocess.run(
        punch("get", "workflow", run, "-o", "jsonpath={.status.phase}"),
        capture_output=True,
        text=True,
        check=False,
    )
    return out.stdout.strip()


def _follow(name: str, run: str) -> int:
    deadline = time.monotonic() + RUN_TIMEOUT_S
    pod: Optional[str] = None
    reported: Optional[str] = None
    while pod is None and time.monotonic() < deadline and _phase(run) not in FINISHED:
        listing = subprocess.run(
            punch("get", "pods", "-l", f"workflows.argoproj.io/workflow={run}", "-o", "json"),
            capture_output=True,
            text=True,
            check=False,
        )
        if listing.returncode == 0:
            pods = json.loads(listing.stdout)
            pod = main_pod(pods)
            reason = waiting_reason(pods)
            if reason is not None and reason != reported:
                warn(f"{run} cannot start yet — {reason}")
                reported = reason
        if pod is None:
            time.sleep(POLL_S)
    if pod is not None:
        subprocess.run(punch("logs", "-f", pod, "-c", "main"), check=False)
    while time.monotonic() < deadline and _phase(run) not in FINISHED:
        time.sleep(POLL_S)

    fetched = subprocess.run(
        punch("get", "workflow", run, "-o", "json"), capture_output=True, text=True, check=False
    )
    if fetched.returncode != 0:
        fail(f"Could not read {run}: {fetched.stderr.strip()}")
        return 1
    result = run_result(json.loads(fetched.stdout))
    print()
    if result.passed:
        pass_(f"k6 {name} completed on k8s ({run}).")
        for entry in result.datasets:
            dataset, _, count = entry.partition("=")
            info(f"Published {count} {dataset} rows to s3://{BUCKET}/datasets/{dataset}.csv")
        info(
            f"Evidence: s3://{BUCKET}/runs/{run}/ and kubectl -n {NAMESPACE} get workflow {run} -o yaml"
        )
        print()
        return 0
    detail = f" — {result.message}" if result.message else ""
    fail(f"k6 {name} failed on k8s ({run}): {result.phase}{detail}")
    for line in result.details:
        info(line)
    info(f"Inspect: kubectl --context {k8s.PROFILE} -n {NAMESPACE} get workflow {run} -o yaml")
    print()
    return 1


def run_job(name: str, args: Sequence[str]) -> int:
    """Run one repository job on Argo Workflows and follow it."""
    parsed = parse_run_args(name, args)
    try:
        # Punch's loader is the perf-only dependency; import it lazily.
        from punch.execution import validate_produce
        from punch.job import load_job

        job = load_job(PERF_JOBS_DIR / f"{name}.yaml")
        produce = validate_produce(job, parsed.produce)
        config = resolve_preset(parsed.config)
        env_pairs = extra_env(job.forward_environment, os.environ)
    except ValueError as error:
        fail(f"Could not prepare k8s job {name}: {error}")
        return 1

    header(f"Punch on Kubernetes — {name} (Argo Workflows)")
    info(f"Template: {NAMESPACE}/{name}")
    info(f"Config  : {config or 'template default'}")
    if produce:
        info(f"Produce : {', '.join(produce)} → s3://{BUCKET}/datasets/")
    print()
    if not k8s.cluster_running():
        fail(f"Cluster '{k8s.PROFILE}' is not running. Run ./dev k8s:up and ./dev k8s:perf:up.")
        return 1

    manifest = workflow_manifest(
        name, config=config, produce=produce, env_pairs=env_pairs, base_url=parsed.base_url
    )
    created = subprocess.run(
        punch("create", "-f", "-", "-o", "jsonpath={.metadata.name}"),
        input=json.dumps(manifest),
        capture_output=True,
        text=True,
        check=False,
    )
    if created.returncode != 0:
        fail(f"Could not submit {name}: {created.stderr.strip()}")
        info("Is the perf platform deployed? Run ./dev k8s:perf:up")
        return 1
    run = created.stdout.strip()
    info(f"Submitted {bold(run)}")
    try:
        return _follow(name, run)
    except KeyboardInterrupt:
        subprocess.run(
            punch("patch", "workflow", run, "--type", "merge", "-p", STOP_PATCH),
            capture_output=True,
            check=False,
        )
        print()
        warn(f"Stopped {run} (spec.shutdown=Stop).")
        return 130
