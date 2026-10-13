"""argocd:up — Argo CD in minikube, syncing the perf platform and the app.

Applies infra/argocd/install (pinned install, trimmed), then registers the
Applications in infra/argocd/applications/ in order: punch-platform
(Argo Workflows, SeaweedFS, Punch templates), then mini-commerce (the app
plus its PostSync smoke). Argo CD pulls from GitHub, so only pushed commits
sync; --revision picks a branch. kubectl-only steps:
docs/performance/k8s-runtime.md.
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from typing import Mapping, Optional, Sequence, Tuple

from pg import k8s
from pg.ansi import bold, fail, header, info, pass_
from pg.paths import REPO_ROOT

ARGOCD_DIR = REPO_ROOT / "infra" / "argocd"
NAMESPACE = "argocd"
# Creation order matters: the app's PostSync smoke needs Punch's templates.
APPLICATIONS: Tuple[str, ...] = ("punch-platform", "mini-commerce")
ROLLOUTS: Tuple[str, ...] = (
    "deployment/argocd-redis",
    "deployment/argocd-repo-server",
    "deployment/argocd-server",
    "statefulset/argocd-application-controller",
)
CRDS: Tuple[str, ...] = ("applications.argoproj.io", "appprojects.argoproj.io")
APP_TIMEOUT_S = 900
POLL_S = 5


def parse_args(args: Sequence[str]) -> Optional[str]:
    revision = "main"
    items = list(args)
    while items:
        arg = items.pop(0)
        if arg == "--revision" and items:
            revision = items.pop(0)
        elif arg.startswith("--revision="):
            revision = arg.split("=", 1)[1]
        else:
            fail(f"Unknown argument '{arg}'. Use: ./dev argocd:up [--revision <branch>]")
            return None
    return revision


def with_revision(text: str, revision: str) -> str:
    """Point an Application manifest at `revision` (its one targetRevision)."""
    updated, count = re.subn(
        r"(?m)^(\s+targetRevision:) \S+$", lambda match: f"{match.group(1)} {revision}", text
    )
    if count != 1:
        raise ValueError(f"expected one targetRevision, found {count}")
    return updated


def app_settled(app: Mapping) -> Optional[bool]:
    """True once the sync of the current revision (hooks included) succeeded
    and the app is Healthy; False when that sync failed; None while it is in
    progress. An operation for an older revision is ignored."""
    status = app.get("status", {})
    current = status.get("sync", {}).get("revision")
    operation = status.get("operationState", {})
    if not current or operation.get("syncResult", {}).get("revision") != current:
        return None
    phase = operation.get("phase")
    if phase in ("Failed", "Error"):
        return False
    if phase == "Succeeded" and status.get("health", {}).get("status") == "Healthy":
        return True
    return None


def _register(name: str, revision: str) -> bool:
    text = (ARGOCD_DIR / "applications" / f"{name}.yaml").read_text(encoding="utf-8")
    applied = subprocess.run(k8s.kubectl("apply", "-f", "-", namespaced=False),
                             input=with_revision(text, revision), text=True, check=False)
    if applied.returncode != 0:
        fail(f"Could not create Application {name}")
        return False
    info(f"Waiting for {name} to sync (up to {APP_TIMEOUT_S // 60} min)...")
    deadline = time.monotonic() + APP_TIMEOUT_S
    status: Mapping = {}
    while time.monotonic() < deadline:
        out = subprocess.run(
            k8s.kubectl("-n", NAMESPACE, "get", "application", name, "-o", "json", namespaced=False),
            capture_output=True, text=True, check=False,
        )
        if out.returncode == 0:
            app = json.loads(out.stdout)
            status = app.get("status", {})
            settled = app_settled(app)
            if settled is True:
                pass_(f"{name}: synced and healthy")
                return True
            if settled is False:
                break
        time.sleep(POLL_S)
    operation = status.get("operationState", {})
    fail(f"{name}: sync={status.get('sync', {}).get('status', '?')} "
         f"health={status.get('health', {}).get('status', '?')} "
         f"operation={operation.get('phase', 'none')} {operation.get('message', '')}".rstrip())
    info(f"Inspect: kubectl --context {k8s.PROFILE} -n {NAMESPACE} get application {name} -o yaml")
    return False


def up(args: Sequence[str]) -> int:
    revision = parse_args(args)
    if revision is None:
        return 1
    header(f"Argo CD — syncing {bold(revision)} from GitHub...")
    if not k8s.require_tools():
        return 1
    if not k8s.cluster_running():
        fail(f"Cluster '{k8s.PROFILE}' is not running. Run ./dev k8s:up first.")
        return 1
    info("Argo CD syncs manifests only: the k6 images come from ./dev k8s:perf:up,")
    info("and only commits pushed to GitHub reach the cluster.")
    print()
    rendered = k8s.render(ARGOCD_DIR / "install")
    if rendered is None or not k8s.apply_server_side(rendered, CRDS):
        return 1
    if not k8s.wait_rollouts(NAMESPACE, ROLLOUTS):
        return 1
    pass_("Argo CD is running")
    for name in APPLICATIONS:
        if not _register(name, revision):
            return 1
    print()
    pass_("punch-platform and mini-commerce are synced; the PostSync smoke passed")
    info(f"UI: kubectl --context {k8s.PROFILE} -n argocd port-forward svc/argocd-server 8080:443")
    info(f"Password: kubectl --context {k8s.PROFILE} -n argocd get secret "
         "argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d")
    print()
    return 0
