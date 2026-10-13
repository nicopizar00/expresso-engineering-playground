"""k8s:* — deploy the core + web + viz stack to a local minikube cluster.

Manifests live in infra/k8s/ (Kustomize); infra/k8s/README.md documents the
equivalent manual steps. Images are built straight into the cluster's Docker
daemon (`minikube docker-env`), so the cluster runs the docker runtime.
Every kubectl call pins --context to the minikube profile so whatever
context is current on the host is never touched.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple

from pg import compose
from pg.ansi import bold, fail, header, info, pass_, warn, yellow
from pg.paths import BFF_PORT, K8S_DIR, REPO_ROOT, VIZ_PORT, WEB_PORT
from pg.ports import pid_on_port, port_in_use

PROFILE = "mini-commerce"
NAMESPACE = "mini-commerce"
CLUSTER_CPUS = 4
# Core + web + viz (~1.2 GB) plus the perf platform (Argo Workflows, Argo CD,
# SeaweedFS, registry addon, k6 pods). Docker Desktop needs >= 6 GB.
CLUSTER_MEMORY_MB = 4608
ROLLOUT_TIMEOUT = "300s"
RESTART_SETTLE_TIMEOUT_S = 300
FORWARD_RETRY_S = 3
# A forward alive this long after (re)start counts as healthy again.
FORWARD_HEALTHY_S = 5


@dataclass(frozen=True)
class Image:
    tag: str
    context: str
    dockerfile: Optional[str] = None
    target: Optional[str] = None
    build_args: Tuple[Tuple[str, str], ...] = ()


# Every `image: mini-commerce/...` in infra/k8s/ must have an entry here.
IMAGES: Tuple[Image, ...] = (
    Image("mini-commerce/bff:local", ".", "apps/bff/Dockerfile"),
    # Dev stage: the bff pod's migrate-seed init container.
    Image("mini-commerce/bff-dev:local", ".", "apps/bff/Dockerfile", target="dev"),
    Image(
        "mini-commerce/web:local",
        ".",
        "apps/web/Dockerfile",
        # Proxy targets are baked at build time; they are in-cluster
        # Service names, same as the compose service names.
        build_args=(
            ("BFF_INTERNAL_URL", "http://bff:3001"),
            ("VISUALIZER_INTERNAL_URL", "http://visualizer-3d:80"),
            ("NEXT_PUBLIC_VISUALIZER_URL", f"http://localhost:{VIZ_PORT}"),
        ),
    ),
    Image("mini-commerce/visualizer-3d:local", "apps/visualizer-3d"),
)

# Deployments running locally built images — restarted after a rebuild
# because the `:local` tags never change.
APP_DEPLOYMENTS: Tuple[str, ...] = ("bff", "web", "visualizer-3d")
ROLLOUTS: Tuple[str, ...] = (
    "statefulset/postgres",
    "deployment/otel-collector",
    *(f"deployment/{name}" for name in APP_DEPLOYMENTS),
)

# (service, local port, service port). Local ports match compose so
# ./dev smoke and the baked NEXT_PUBLIC_VISUALIZER_URL work unchanged.
FORWARDS: Tuple[Tuple[str, int, int], ...] = (
    ("web", WEB_PORT, 3000),
    ("bff", BFF_PORT, 3001),
    ("visualizer-3d", VIZ_PORT, 80),
)


def kubectl(*args: str, namespaced: bool = True) -> List[str]:
    cmd = ["kubectl", "--context", PROFILE]
    if namespaced:
        cmd.extend(["-n", NAMESPACE])
    return cmd + list(args)


def build_cmd(image: Image) -> List[str]:
    cmd = ["docker", "build", "-t", image.tag]
    if image.dockerfile:
        cmd.extend(["-f", image.dockerfile])
    if image.target:
        cmd.extend(["--target", image.target])
    for key, value in image.build_args:
        cmd.extend(["--build-arg", f"{key}={value}"])
    cmd.append(image.context)
    return cmd


def parse_docker_env(text: str) -> Dict[str, str]:
    """Parse `minikube docker-env --shell none` (KEY=VALUE lines). Blank
    values are dropped so they never clobber the host's SSH agent vars."""
    env: Dict[str, str] = {}
    for line in text.splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() and value.strip():
            env[key.strip()] = value.strip()
    return env


def pods_not_ready_since(pods: dict, since: datetime) -> List[str]:
    """Names of live pods not Ready since `since`. After a cluster restart
    the API still reports pre-stop readiness until the kubelet resyncs; a
    node reboot restarts every container, so only a Ready transition after
    the start proves the pod is actually back."""
    pending: List[str] = []
    for pod in pods.get("items", []):
        meta = pod.get("metadata", {})
        if meta.get("deletionTimestamp"):
            continue
        ready = next(
            (c for c in pod.get("status", {}).get("conditions", []) if c.get("type") == "Ready"),
            None,
        )
        if (
            not ready
            or ready.get("status") != "True"
            or _parse_time(ready.get("lastTransitionTime", "")) < since
        ):
            pending.append(meta.get("name", "?"))
    return pending


def _parse_time(value: str) -> datetime:
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def parse_docker_time(value: str) -> Optional[datetime]:
    """Parse `docker info` SystemTime (RFC 3339, nanoseconds), truncated to
    whole seconds to match Kubernetes condition timestamps."""
    value = value.strip().replace("Z", "+00:00")
    head, dot, rest = value.partition(".")
    if dot:
        offset = rest.lstrip("0123456789")
        value = head + offset
    try:
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except ValueError:
        return None


def _cluster_clock_now() -> datetime:
    """Current time on the Docker VM clock — the clock the node and API
    server stamp conditions with. The host clock can drift from it (e.g.
    Docker Desktop after sleep), so prefer it and fall back to the host."""
    out = subprocess.run(
        ["docker", "info", "--format", "{{.SystemTime}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    parsed = parse_docker_time(out.stdout) if out.returncode == 0 else None
    return parsed or datetime.now(timezone.utc).replace(microsecond=0)


def _wait_for_restarted_pods(since: datetime) -> bool:
    info("Waiting for existing pods to come back after the cluster start...")
    deadline = time.monotonic() + RESTART_SETTLE_TIMEOUT_S
    pending: List[str] = []
    while time.monotonic() < deadline:
        listing = subprocess.run(
            kubectl("get", "pods", "-o", "json"), capture_output=True, text=True, check=False
        )
        if listing.returncode == 0:
            pending = pods_not_ready_since(json.loads(listing.stdout), since)
            if not pending:
                return True
        time.sleep(3)
    fail(f"Pods not ready after restart: {', '.join(pending) or 'API unreachable'}")
    return False


def _run(cmd: Sequence[str], **kwargs) -> int:
    return subprocess.run(list(cmd), check=False, **kwargs).returncode


def require_tools() -> bool:
    missing = [tool for tool in ("docker", "minikube", "kubectl") if not shutil.which(tool)]
    if missing:
        fail(f"Missing on PATH: {', '.join(missing)}")
        info("Install with: brew install minikube  (pulls kubectl too)")
        return False
    return True


def cluster_running() -> bool:
    result = subprocess.run(
        ["minikube", "-p", PROFILE, "status"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


def _start_cluster() -> bool:
    info(f"Starting minikube cluster '{PROFILE}'...")
    rc = _run([
        "minikube", "start", "-p", PROFILE,
        "--driver=docker",
        # minikube >= 1.39 defaults to containerd, which has no docker-env.
        "--container-runtime=docker",
        f"--cpus={CLUSTER_CPUS}",
        f"--memory={CLUSTER_MEMORY_MB}",
    ])
    return rc == 0


def cluster_docker_env() -> Optional[Dict[str, str]]:
    """Host environment pointed at the cluster node's Docker daemon."""
    env_out = subprocess.run(
        ["minikube", "-p", PROFILE, "docker-env", "--shell", "none"],
        capture_output=True,
        text=True,
        check=False,
    )
    if env_out.returncode != 0:
        fail("minikube docker-env failed — is the cluster on the docker runtime?")
        print(env_out.stderr.strip())
        return None
    return {**os.environ, **parse_docker_env(env_out.stdout)}


def _build_images() -> bool:
    env = cluster_docker_env()
    if env is None:
        return False
    for image in IMAGES:
        info(f"Building {image.tag}...")
        if _run(build_cmd(image), cwd=REPO_ROOT, env=env) != 0:
            fail(f"Build failed: {image.tag}")
            return False
    pass_("Images built into the cluster")
    return True


def render(directory: Path) -> Optional[str]:
    """`kubectl kustomize` with the load restrictor off: infra/k8s reads the
    otel config from infra/observability/, infra/k8s/perf reads the k6 option
    presets and vendor/punch/k8s."""
    rendered = subprocess.run(
        ["kubectl", "kustomize", "--load-restrictor", "LoadRestrictionsNone", str(directory)],
        capture_output=True,
        text=True,
        check=False,
    )
    if rendered.returncode != 0:
        fail(f"kustomize render failed: {directory}")
        print(rendered.stderr.strip())
        return None
    return rendered.stdout


def apply_server_side(rendered: str, crds: Sequence[str]) -> bool:
    """Server-side apply: Argo's CRDs exceed the client-side annotation limit.
    Custom resources that race their just-created CRDs fail the first pass;
    wait for those CRDs, then apply again."""
    cmd = kubectl("apply", "--server-side", "--force-conflicts", "-f", "-", namespaced=False)
    if _run(cmd, input=rendered, text=True, capture_output=True) == 0:
        return True
    for crd in crds:
        _run(kubectl("wait", "--for=condition=Established", f"crd/{crd}", "--timeout=120s",
                     namespaced=False))
    if _run(cmd, input=rendered, text=True) != 0:
        fail("kubectl apply --server-side failed")
        return False
    return True


def wait_rollouts(namespace: str, resources: Sequence[str]) -> bool:
    for resource in resources:
        cmd = kubectl("-n", namespace, "rollout", "status", resource,
                      f"--timeout={ROLLOUT_TIMEOUT}", namespaced=False)
        if _run(cmd) != 0:
            fail(f"{namespace}/{resource} did not become ready")
            info(f"Inspect: kubectl --context {PROFILE} -n {namespace} describe {resource}")
            return False
    return True


def profile_memory_mb(listing: str, profile: str) -> Optional[int]:
    """Memory (MB) of `profile` in `minikube profile list -o json` output."""
    try:
        valid = json.loads(listing).get("valid") or []
    except ValueError:
        return None
    for entry in valid:
        if entry.get("Name") == profile:
            return entry.get("Config", {}).get("Memory")
    return None


def _warn_if_undersized() -> None:
    listing = subprocess.run(
        ["minikube", "profile", "list", "-o", "json"], capture_output=True, text=True, check=False
    )
    memory = profile_memory_mb(listing.stdout, PROFILE) if listing.returncode == 0 else None
    if memory is not None and memory < CLUSTER_MEMORY_MB:
        warn(f"Cluster '{PROFILE}' has {memory} MB; the perf platform needs {CLUSTER_MEMORY_MB} MB.")
        print(yellow(f"  Recreate it (destructive: Postgres data and built images): "
                     f"minikube delete -p {PROFILE}"))


def _apply() -> bool:
    rendered = render(K8S_DIR)
    if rendered is None:
        return False
    if _run(kubectl("apply", "-f", "-", namespaced=False), input=rendered, text=True) != 0:
        fail("kubectl apply failed")
        return False
    pass_("Manifests applied")
    return True


def _warn_if_compose_running() -> None:
    running = compose.capture(["ps", "--services", "--filter", "status=running"])
    if (running.stdout or "").strip():
        warn("Compose stack is running — minikube needs ~3 GB of Docker's RAM "
             "and k8s:forward needs its ports. Run ./dev down first.")


def up(args: Sequence[str]) -> int:
    build = True
    for arg in args:
        if arg == "--no-build":
            build = False
        else:
            fail(f"Unknown argument '{arg}'. Use: ./dev k8s:up [--no-build]")
            return 1

    header("Deploying to minikube (core + web + viz)...")
    if not require_tools():
        return 1
    _warn_if_compose_running()

    if cluster_running():
        pass_(f"Cluster '{PROFILE}' is running")
        _warn_if_undersized()
    else:
        started_at = _cluster_clock_now()
        if not _start_cluster():
            fail("minikube start failed")
            return 1
        if not _wait_for_restarted_pods(started_at):
            return 1

    if build and not _build_images():
        return 1
    if not _apply():
        return 1
    if build:
        _run(kubectl("rollout", "restart", *(f"deployment/{d}" for d in APP_DEPLOYMENTS)))

    info("Waiting for rollouts...")
    if not wait_rollouts(NAMESPACE, ROLLOUTS):
        return 1

    print()
    pass_("Stack is running in minikube")
    info(f"Run {bold('./dev k8s:forward')} to reach it on localhost, then {bold('./dev smoke')}")
    print()
    return 0


def _start_forward(service: str, local: int, remote: int) -> subprocess.Popen:
    # kubectl's own errors repeat on every retry; the supervisor loop
    # reports outages once instead.
    return subprocess.Popen(
        kubectl("port-forward", f"svc/{service}", f"{local}:{remote}"),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def forward() -> int:
    # Long-running: outage notices must show up even when piped to a log.
    sys.stdout.reconfigure(line_buffering=True)
    header("Port-forwarding minikube services...")
    if not require_tools():
        return 1
    if not cluster_running():
        fail(f"Cluster '{PROFILE}' is not running. Run ./dev k8s:up first.")
        return 1

    busy = [(svc, port) for svc, port, _ in FORWARDS if port_in_use(port)]
    for svc, port in busy:
        pid = pid_on_port(port)
        fail(f"Port {port} ({svc}) is in use" + (f" by PID {pid}" if pid else ""))
    if busy:
        info("If the compose stack holds it, run ./dev down first.")
        return 1

    procs = {spec: _start_forward(*spec) for spec in FORWARDS}
    started = {spec: time.monotonic() for spec in FORWARDS}
    retry_at: Dict[Tuple[str, int, int], float] = {}
    down: Set[Tuple[str, int, int]] = set()
    for svc, local, _ in FORWARDS:
        pass_(f"{svc:<14} http://localhost:{local}")
    print()
    info("Ctrl+C to stop. A forward whose pod is replaced or still starting retries until ready.")
    print()

    try:
        while True:
            time.sleep(1)
            now = time.monotonic()
            for spec, proc in procs.items():
                svc = spec[0]
                if proc.poll() is None:
                    if spec in down and now - started[spec] >= FORWARD_HEALTHY_S:
                        down.discard(spec)
                        pass_(f"svc/{svc} forwarding again")
                    continue
                if spec not in retry_at:
                    if not cluster_running():
                        fail(f"Cluster '{PROFILE}' stopped — ending port-forwards.")
                        return 1
                    if spec not in down:
                        down.add(spec)
                        warn(f"svc/{svc} unavailable — retrying until its pod is ready "
                             "(./dev k8s:status)")
                    retry_at[spec] = now + FORWARD_RETRY_S
                elif now >= retry_at[spec]:
                    del retry_at[spec]
                    procs[spec] = _start_forward(*spec)
                    started[spec] = now
    except KeyboardInterrupt:
        print()
        return 0
    finally:
        for proc in procs.values():
            if proc.poll() is None:
                proc.terminate()
        for proc in procs.values():
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


def status() -> int:
    header("Kubernetes Status (minikube)")
    if not shutil.which("minikube"):
        info("minikube not installed. Run: brew install minikube")
        print()
        return 0
    if not cluster_running():
        info(f"Cluster '{PROFILE}' is not running. Run ./dev k8s:up to start.")
        print()
        return 0
    _run(kubectl("get", "pods,services"))
    print()
    return 0


def down() -> int:
    header("Stopping minikube cluster...")
    if not shutil.which("minikube") or not cluster_running():
        info(f"Cluster '{PROFILE}' is not running — nothing to stop.")
        print()
        return 0
    if _run(["minikube", "stop", "-p", PROFILE]) != 0:
        fail("minikube stop failed")
        return 1
    print()
    pass_("Cluster stopped. Images and Postgres data are kept for the next k8s:up.")
    print(yellow(f"  To remove the cluster entirely (destructive): minikube delete -p {PROFILE}"))
    print()
    return 0
