"""k8s:perf:up — the Punch perf platform on minikube (Argo Workflows).

The cluster side is plain YAML (infra/k8s/perf/ plus Punch's generic template
in vendor/punch/k8s/) and needs no Python. This module is a local
convenience over kubectl: build and push the k6 images into the registry
addon (the ECR stand-in) and apply the platform. kubectl-only equivalents:
docs/performance/k8s-runtime.md.
"""

from __future__ import annotations

import subprocess
from typing import List, Sequence, Tuple

from pg import k8s
from pg.ansi import bold, fail, header, info, pass_
from pg.paths import K8S_DIR, REPO_ROOT

PERF_DIR = K8S_DIR / "perf"
NAMESPACE = "punch"
REGISTRY = "localhost:5000"
BUCKET = "punch-artifacts"
# infra/k8s/perf/punch maps Punch's k6-scenarios / k6-scenarios-browser
# placeholders to these tags.
PERF_IMAGES: Tuple[k8s.Image, ...] = (
    k8s.Image(f"{REGISTRY}/mini-commerce/k6:local", ".", "infra/docker/k6.Dockerfile"),
    k8s.Image(f"{REGISTRY}/mini-commerce/k6-browser:local", ".", "infra/docker/k6-browser.Dockerfile"),
)
CRDS: Tuple[str, ...] = ("workflowtemplates.argoproj.io", "workflows.argoproj.io")
ROLLOUTS: Tuple[Tuple[str, str], ...] = (
    ("argo", "deployment/workflow-controller"),
    ("argo", "deployment/argo-server"),
    ("aws-local", "deployment/seaweedfs"),
)


def punch(*args: str) -> List[str]:
    return k8s.kubectl("-n", NAMESPACE, *args, namespaced=False)


def _push_images() -> bool:
    enable = ["minikube", "-p", k8s.PROFILE, "addons", "enable", "registry"]
    if subprocess.run(enable, check=False).returncode != 0:
        fail("Could not enable the minikube registry addon")
        return False
    ready = k8s.kubectl("-n", "kube-system", "wait", "--for=condition=Ready", "pod",
                        "-l", "kubernetes.io/minikube-addons=registry", "--timeout=180s",
                        namespaced=False)
    if subprocess.run(ready, check=False).returncode != 0:
        fail("The registry addon did not become ready")
        return False
    env = k8s.cluster_docker_env()
    if env is None:
        return False
    for image in PERF_IMAGES:
        info(f"Building {image.tag}...")
        if subprocess.run(k8s.build_cmd(image), cwd=REPO_ROOT, env=env, check=False).returncode != 0:
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
    info(f"Run a workflow: {bold('./dev perf:http-purchase --runtime k8s --config 1-iteration')}")
    info(f"Argo UI: kubectl --context {k8s.PROFILE} -n argo port-forward svc/argo-server "
         "2746:2746, then https://localhost:2746")
    print()
    return 0
