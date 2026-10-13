# Punch on Kubernetes (k8s-native) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Punch k6 workflows natively on Kubernetes (Argo Workflows + Argo CD, S3 artifacts, OCI registry) on local minikube, with no Python or Punch image in the cluster, alongside the unchanged compose runtime.

**Architecture:** Punch (`vendor/punch/k8s/`) ships a generic `punch-k6-run` WorkflowTemplate whose single container runs a POSIX shell step (`k6-run.sh`) inside the consumer's k6 image: input validation, dataset preflight, `k6 run`, stdout-only `[DATA]` harvest, atomic publication. Expresso (`infra/k8s/perf/`) installs Argo Workflows and SeaweedFS (S3 stand-in), maps images to the minikube registry addon (ECR stand-in), and adds nine thin per-workflow templates pinned to the Punch YAMLs by a CI parity test. Argo CD (`infra/argocd/install/`) syncs the platform and the app from GitHub and runs `http-purchase` as a PostSync smoke. `./dev` gains thin kubectl wrappers.

**Tech Stack:** Argo Workflows v4.1.5, Argo CD v3.5.5, SeaweedFS 4.48 (`weed mini`), minikube registry addon, kustomize (kubectl-embedded), POSIX sh + busybox (Alpine `grafana/k6:0.54.0`), Python 3.9+ stdlib (`scripts/pg`), PyYAML (tests), kubeconform v0.8.0, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-10-13-punch-k8s-native-design.md`](../specs/2026-10-13-punch-k8s-native-design.md)

## Global Constraints

- No AI attribution anywhere: no `Co-Authored-By: Claude`, no "Generated with Claude Code", in commits, PR bodies, or docs (repo `CLAUDE.md` overrides harness attribution).
- Committed content is English. No secrets; S3 credentials are the local-only literals `accessKey=punch` / `secretKey=punch-local-only`, commented "Not real credentials".
- No Python and no Punch image in the cluster. Python on the k8s side is local tooling (`./dev` wrappers) or CI tests only.
- `scripts/pg/cli.py`, `scripts/pg/k8s.py`, `scripts/pg/argocd.py`, `scripts/pg/k8s_perf.py` import only the standard library at module level; `k8s_perf.run_workflow` imports `punch.*` lazily. `cli.py` must import with `yaml`/`punch` unavailable.
- Pinned versions: Argo Workflows `https://github.com/argoproj/argo-workflows/releases/download/v4.1.5/install.yaml`; Argo CD `https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.5/manifests/install.yaml`; `chrislusf/seaweedfs:4.48`; kubeconform `v0.8.0`; `amazon/aws-cli:2.37.13` (inspection only); k6 images unchanged (`grafana/k6:0.54.0`, `-with-browser`).
- Fixed names: namespaces `argo`, `punch`, `aws-local`, `argocd`; bucket `punch-artifacts`; images `localhost:5000/mini-commerce/k6:local`, `localhost:5000/mini-commerce/k6-browser:local`; placeholders `k6-scenarios`, `k6-scenarios-browser`; ServiceAccount `punch-executor`; ConfigMaps `punch-k6-run-script`, `punch-k6-options`, `artifact-repositories`; Secret `s3-credentials`; S3 endpoint `seaweedfs.aws-local.svc.cluster.local:8333`.
- Workflow ids are one string everywhere (Punch YAML stem = thin template name = `./dev perf:<id>`).
- Every `kubectl` call from `./dev` pins `--context mini-commerce` (use `k8s.kubectl(...)`).
- `vendor/punch` has uncommitted `.github/` changes that predate this work: never stage them (`git -C vendor/punch add` only the paths named in a step).
- Destructive or outward actions need the user's explicit OK at that step: `minikube delete`, any `git push` of the outer repo. Pushing Punch in Task 5 is pre-authorized by the approved spec ("Pushed to Punch's remote before the outer pointer bump").
- Before any outer `git push`: `git log origin/main..HEAD -- vendor/punch`; for each bumped sha, `git -C vendor/punch branch -r --contains <sha>` must be non-empty.
- Python tooling: `.cache/punch-venv/bin/python` (already has PyYAML/rich). Ruff `0.7.4` is installed into it in Task 1.
- Temporary files go in `SCRATCH` — the session scratchpad directory when one exists, otherwise `SCRATCH=$(mktemp -d)`. Never `/tmp` directly.
- Argo CD files live in `infra/argocd/{install,applications,mini-commerce}/`, outside `infra/k8s/`: kustomize rejects an overlay that includes its own parent directory ("cycle detected: candidate root ... contains visited root" — verified).

## Review Focus

1. **Dataset CSV without a trailing newline, or with blank lines** — preflight must count real rows: one header plus one unterminated row passes; blank lines never count. Test: Task 3 (`test_dataset_without_trailing_newline_passes_preflight`, `test_header_only_dataset_fails_preflight`).
2. **A forwarded env value containing whitespace** (`EXPECT_TEMPERATURE="very hot"`) — must be rejected before k6 runs, never split silently into two `-e` flags. Tests: Task 3 (`test_extra_env_value_with_spaces_exits_2_before_k6`), Task 8 (`test_extra_env_rejects_whitespace`).
3. **Compose habits on k8s: `--config <path>`** — a path that works on compose must fail on k8s before anything is submitted, with a message naming presets. Test: Task 8 (`test_path_config_fails_before_kubectl`).
4. **Unpullable image / Argo `Error` phase** — a run must end within 900 s (not hang a PostSync hook), and the wrapper must treat `Error` like `Failed`. Tests: Task 4 (`test_runs_bounded_with_the_executor_account_and_archived_logs`), Task 8 (`test_error_phase_is_a_failure`).
5. **Re-running `argocd:up` after a failed sync** — a stale failed operation from an older revision must not be reported as the current result. Test: Task 11 (`test_stale_operation_from_an_older_revision_is_ignored`).

---

## File Structure

| Path | Repo | Responsibility |
| --- | --- | --- |
| `vendor/punch/k8s/k6-run.sh` | Punch | Shell step: validate → preflight → k6 → harvest |
| `vendor/punch/k8s/punch-k6-run.yaml` | Punch | Generic WorkflowTemplate (`k6`, `k6-browser`) |
| `vendor/punch/k8s/rbac.yaml` | Punch | `punch-executor` SA + Role + RoleBinding |
| `vendor/punch/k8s/kustomization.yaml` | Punch | Base: resources + script ConfigMap |
| `vendor/punch/k8s/kustomizeconfig.yaml` | Punch | `images:` fieldSpec for WorkflowTemplate |
| `vendor/punch/k8s/examples/artifact-repositories.yaml` | Punch | Real-AWS S3 example (IRSA) |
| `vendor/punch/k8s/README.md` | Punch | Runtime contract |
| `vendor/punch/tests/test_k8s_run_script.py` | Punch | Shell step tests |
| `vendor/punch/tests/test_k8s_base.py` | Punch | Template/RBAC/kustomize tests |
| `vendor/punch/docs/decisions/0006-kubernetes-runtime.md` | Punch | ADR |
| `infra/k8s/perf/kustomization.yaml` | Expresso | Platform aggregate |
| `infra/k8s/perf/argo-workflows/{kustomization,namespace}.yaml` | Expresso | Argo Workflows install |
| `infra/k8s/perf/aws-local/{kustomization,namespace,seaweedfs}.yaml` | Expresso | S3 stand-in |
| `infra/k8s/perf/punch/{kustomization,namespace,artifact-repositories}.yaml` | Expresso | Punch namespace wiring |
| `infra/k8s/perf/punch/workflows/<id>.yaml` (×9) | Expresso | Thin templates |
| `infra/argocd/install/{kustomization,namespace,argocd-cm}.yaml` | Expresso | Argo CD install |
| `infra/argocd/applications/{punch-platform,mini-commerce}.yaml` | Expresso | Applications |
| `infra/argocd/mini-commerce/{kustomization,postsync-smoke}.yaml` | Expresso | App overlay + PostSync smoke |
| `scripts/pg/k8s.py` | Expresso | Cluster size + shared kubectl helpers (modified) |
| `scripts/pg/k8s_perf.py` | Expresso | `k8s:perf:up`, `perf:<id> --runtime k8s` |
| `scripts/pg/argocd.py` | Expresso | `argocd:up` |
| `scripts/pg/perf.py`, `scripts/pg/cli.py` | Expresso | Runtime split, command registration (modified) |
| `scripts/pg/tests/test_k8s.py` | Expresso | Cluster size + helper tests (modified) |
| `scripts/pg/tests/test_k8s_workflows.py` | Expresso | Parity test |
| `scripts/pg/tests/test_k8s_perf.py` | Expresso | Wrapper tests |
| `scripts/pg/tests/test_argocd.py` | Expresso | Argo CD tests |
| `.github/workflows/ci.yml` | Expresso | `k8s-manifests` job (modified) |
| `docs/performance/k8s-runtime.md` | Expresso | Operation guide |
| `docs/next-steps/punch-k8s.md` | Expresso | Follow-ups |

---

### Task 1: Cluster sizing and shared kubectl helpers

**Files:**
- Modify: `scripts/pg/k8s.py`
- Modify: `scripts/pg/tests/test_k8s.py`

**Interfaces:**
- Produces (used by Tasks 7, 8, 11):
  - `k8s.CLUSTER_MEMORY_MB: int = 4608`
  - `k8s.require_tools() -> bool` (renamed from `_require_tools`)
  - `k8s.cluster_docker_env() -> Optional[Dict[str, str]]`
  - `k8s.render(directory: Path) -> Optional[str]`
  - `k8s.apply_server_side(rendered: str, crds: Sequence[str]) -> bool`
  - `k8s.wait_rollouts(namespace: str, resources: Sequence[str]) -> bool`
  - `k8s.profile_memory_mb(listing: str, profile: str) -> Optional[int]`
- Consumes: existing `k8s.kubectl`, `k8s.build_cmd`, `k8s.parse_docker_env`, `k8s.Image`, `k8s.PROFILE`.

- [ ] **Step 1: Install ruff into the Punch venv (one-time tooling)**

Run: `.cache/punch-venv/bin/python -m pip install --quiet ruff==0.7.4 && .cache/punch-venv/bin/python -m ruff --version`
Expected: `ruff 0.7.4`

- [ ] **Step 2: Write the failing tests**

In `scripts/pg/tests/test_k8s.py`, add `import json` to the imports (after `from __future__ import annotations`, alphabetically before `import re`), then append:

```python
class ClusterSizingTests(unittest.TestCase):
    def test_cluster_memory_fits_the_perf_platform(self) -> None:
        self.assertGreaterEqual(k8s.CLUSTER_MEMORY_MB, 4608)

    def test_profile_memory_reads_the_named_profile(self) -> None:
        listing = json.dumps({
            "invalid": [],
            "valid": [
                {"Name": "other", "Config": {"Memory": 8192}},
                {"Name": "mini-commerce", "Config": {"Memory": 3072}},
            ],
        })
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
        run.side_effect = [mock.Mock(returncode=1), mock.Mock(returncode=0), mock.Mock(returncode=0)]
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_k8s -v 2>&1 | tail -15`
Expected: FAIL/ERROR — `AttributeError: module 'pg.k8s' has no attribute 'profile_memory_mb'` (likewise `apply_server_side`, `wait_rollouts`) and `AssertionError: 3072 not greater than or equal to 4608`.

- [ ] **Step 4: Implement in `scripts/pg/k8s.py`**

4a. Imports — add `from pathlib import Path` after `from datetime import datetime, timezone`.

4b. Replace `CLUSTER_MEMORY_MB = 3072` with:

```python
# Core + web + viz (~1.2 GB) plus the perf platform (Argo Workflows, Argo CD,
# SeaweedFS, registry addon, k6 pods). Docker Desktop needs >= 6 GB.
CLUSTER_MEMORY_MB = 4608
```

4c. Rename `def _require_tools() -> bool:` to `def require_tools() -> bool:` and update its two callers in `up()` and `forward()` (`if not _require_tools():` → `if not require_tools():`).

4d. Replace the whole `_build_images` function with:

```python
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
```

4e. Replace the whole `_apply` function with:

```python
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
```

4f. In `up()`, after `pass_(f"Cluster '{PROFILE}' is running")` add `_warn_if_undersized()`, and replace the rollout loop:

```python
    info("Waiting for rollouts...")
    for resource in ROLLOUTS:
        if _run(kubectl("rollout", "status", resource, f"--timeout={ROLLOUT_TIMEOUT}")) != 0:
            fail(f"{resource} did not become ready")
            info(f"Inspect: kubectl --context {PROFILE} -n {NAMESPACE} describe {resource}")
            return 1
```

with:

```python
    info("Waiting for rollouts...")
    if not wait_rollouts(NAMESPACE, ROLLOUTS):
        return 1
```

- [ ] **Step 5: Run the tests and lint**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_k8s -v 2>&1 | tail -5 && cd .. && .cache/punch-venv/bin/python -m ruff check scripts/pg`
Expected: `OK`; `All checks passed!`

- [ ] **Step 6: Check Docker Desktop memory (user action if short)**

Run: `docker info --format '{{.MemTotal}}'`
Expected: ≥ `5905580032` (≈5.5 GiB, i.e. Docker Desktop set to 6 GB). If lower: STOP and ask the user to raise Docker Desktop → Settings → Resources → Memory to at least 6 GB and restart Docker, then re-run this step.

- [ ] **Step 7: Recreate the cluster at 4.5 GB (ask first — destructive)**

Ask the user: "Recreating the `mini-commerce` minikube profile deletes its Postgres data and built images (the seed restores data). OK to run `minikube delete -p mini-commerce`?" Only on an explicit yes:

Run: `minikube delete -p mini-commerce && ./dev k8s:up`
Expected: ends with `Stack is running in minikube`.

Run: `minikube profile list -o json | python3 -c 'import json,sys; v=[p for p in json.load(sys.stdin)["valid"] if p["Name"]=="mini-commerce"][0]; print(v["Config"]["Memory"], v["Config"]["CPUs"])'`
Expected: `4608 4`

- [ ] **Step 8: Commit**

```bash
git add scripts/pg/k8s.py scripts/pg/tests/test_k8s.py
git commit -m "feat(k8s): size minikube for the perf platform and share kubectl helpers"
```

---

### Task 2: P0 spike — Argo artifacts, SeaweedFS, registry addon (throwaway)

Nothing from this task is committed. It proves the four assumptions the template relies on. Work in `SPIKE=<scratchpad>/spike` (the session scratchpad directory).

**Files:** scratchpad only.

**Interfaces:** Produces a go/no-go for Task 4's artifact design. If any check fails, STOP and report to the user with the fallback (one artifact per dataset, keyed `datasets/{{inputs.parameters.requires}}.csv` / `datasets/{{inputs.parameters.produce}}.csv`; every workflow today requires ≤ 1 and produces ≤ 1).

- [ ] **Step 1: Registry addon serves `localhost:5000` images to pods**

```bash
minikube -p mini-commerce addons enable registry
kubectl --context mini-commerce -n kube-system wait --for=condition=Ready pod \
  -l kubernetes.io/minikube-addons=registry --timeout=180s
eval "$(minikube -p mini-commerce docker-env)"
docker pull busybox:1.36 && docker tag busybox:1.36 localhost:5000/spike/busybox:1 \
  && docker push localhost:5000/spike/busybox:1
eval "$(minikube -p mini-commerce docker-env --unset)"
kubectl --context mini-commerce run spike-pull --image=localhost:5000/spike/busybox:1 \
  --image-pull-policy=Always --restart=Never -- true
kubectl --context mini-commerce wait --for=jsonpath='{.status.phase}'=Succeeded pod/spike-pull --timeout=120s
kubectl --context mini-commerce delete pod spike-pull
```

Expected: the `wait` for registry pods succeeds (proves the label Task 7 uses), the push succeeds, `pod/spike-pull condition met`.

- [ ] **Step 2: kustomize fetches the Argo release URL; install Argo Workflows**

```bash
mkdir -p "$SPIKE/argo" && cat > "$SPIKE/argo/kustomization.yaml" <<'EOF'
resources:
  - namespace.yaml
  - https://github.com/argoproj/argo-workflows/releases/download/v4.1.5/install.yaml
EOF
printf 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: argo\n' > "$SPIKE/argo/namespace.yaml"
kubectl kustomize "$SPIKE/argo" | kubectl --context mini-commerce apply --server-side --force-conflicts -f - >/dev/null
kubectl --context mini-commerce -n argo rollout status deployment/workflow-controller --timeout=300s
```

Expected: `deployment "workflow-controller" successfully rolled out`.

- [ ] **Step 3: SeaweedFS + artifact repository + executor RBAC in namespace `spike`**

```bash
cat > "$SPIKE/spike.yaml" <<'EOF'
apiVersion: v1
kind: Namespace
metadata: { name: spike }
---
apiVersion: v1
kind: Secret
metadata: { name: s3-credentials, namespace: spike }
stringData: { accessKey: punch, secretKey: punch-local-only }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: seaweedfs, namespace: spike }
spec:
  selector: { matchLabels: { app: seaweedfs } }
  template:
    metadata: { labels: { app: seaweedfs } }
    spec:
      containers:
        - name: seaweedfs
          image: chrislusf/seaweedfs:4.48
          args: [mini]
          env:
            - { name: AWS_ACCESS_KEY_ID, valueFrom: { secretKeyRef: { name: s3-credentials, key: accessKey } } }
            - { name: AWS_SECRET_ACCESS_KEY, valueFrom: { secretKeyRef: { name: s3-credentials, key: secretKey } } }
            - { name: S3_BUCKET, value: punch-artifacts }
          ports: [ { name: s3, containerPort: 8333 } ]
          readinessProbe: { tcpSocket: { port: s3 }, periodSeconds: 5 }
---
apiVersion: v1
kind: Service
metadata: { name: seaweedfs, namespace: spike }
spec:
  selector: { app: seaweedfs }
  ports: [ { name: s3, port: 8333, targetPort: s3 } ]
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: artifact-repositories
  namespace: spike
  annotations: { workflows.argoproj.io/default-artifact-repository: seaweedfs }
data:
  seaweedfs: |
    s3:
      endpoint: seaweedfs.spike.svc.cluster.local:8333
      bucket: punch-artifacts
      insecure: true
      region: us-east-1
      keyFormat: "runs/{{workflow.name}}/{{pod.name}}"
      accessKeySecret: { name: s3-credentials, key: accessKey }
      secretKeySecret: { name: s3-credentials, key: secretKey }
---
apiVersion: v1
kind: ServiceAccount
metadata: { name: spike-executor, namespace: spike }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: spike-executor, namespace: spike }
rules:
  - { apiGroups: [argoproj.io], resources: [workflowtaskresults], verbs: [create, patch] }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: spike-executor, namespace: spike }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: spike-executor }
subjects: [ { kind: ServiceAccount, name: spike-executor, namespace: spike } ]
EOF
kubectl --context mini-commerce apply -f "$SPIKE/spike.yaml"
kubectl --context mini-commerce -n spike rollout status deployment/seaweedfs --timeout=180s
```

Expected: `deployment "seaweedfs" successfully rolled out`.

- [ ] **Step 4: Run the artifact-semantics Workflow**

```bash
cat > "$SPIKE/workflow.yaml" <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata: { name: spike, namespace: spike }
spec:
  serviceAccountName: spike-executor
  entrypoint: main
  archiveLogs: true
  templates:
    - name: main
      steps:
        - - { name: write-ab, template: write, arguments: { parameters: [ { name: files, value: "a=a1 b=b1" } ] } }
        - - { name: read-1, template: read, arguments: { parameters: [ { name: expect, value: "a1 b1" } ] } }
        - - { name: write-a, template: write, arguments: { parameters: [ { name: files, value: "a=a2" } ] } }
        - - { name: read-2, template: read, arguments: { parameters: [ { name: expect, value: "a2 b1" } ] } }
        - - { name: no-output, template: write, arguments: { parameters: [ { name: files, value: "" } ] } }
        - - { name: missing-input, template: missing }
    - name: write
      inputs: { parameters: [ { name: files } ] }
      outputs:
        artifacts:
          - { name: datasets, path: /out/datasets, optional: true, archive: { none: {} }, s3: { key: datasets } }
      volumes: [ { name: out, emptyDir: {} } ]
      container:
        image: localhost:5000/spike/busybox:1
        imagePullPolicy: Always
        command: [sh, -c]
        args:
          - |
            files="{{inputs.parameters.files}}"
            for pair in $files; do
              mkdir -p /out/datasets
              echo "${pair#*=}" > "/out/datasets/${pair%%=*}.csv"
            done
            ls -laR /out
        volumeMounts: [ { name: out, mountPath: /out } ]
    - name: read
      inputs:
        parameters: [ { name: expect } ]
        artifacts:
          - { name: datasets, path: /in/datasets, optional: true, s3: { key: datasets } }
      container:
        image: localhost:5000/spike/busybox:1
        command: [sh, -c]
        args:
          - |
            got="$(cat /in/datasets/a.csv) $(cat /in/datasets/b.csv)"
            echo "got: $got"
            [ "$got" = "{{inputs.parameters.expect}}" ]
    - name: missing
      inputs:
        artifacts:
          - { name: nothing, path: /in/nothing, optional: true, s3: { key: no-such-prefix } }
      container:
        image: localhost:5000/spike/busybox:1
        command: [sh, -c]
        args: ["test ! -e /in/nothing/x && echo missing-input-ok"]
EOF
kubectl --context mini-commerce create -f "$SPIKE/workflow.yaml"
kubectl --context mini-commerce -n spike wait --for=jsonpath='{.status.phase}'=Succeeded workflow/spike --timeout=600s
kubectl --context mini-commerce -n spike get workflow spike -o jsonpath='{range .status.nodes.*}{.displayName}{"\t"}{.phase}{"\n"}{end}'
```

Expected: `workflow.argoproj.io/spike condition met`; every node `Succeeded`. This proves: directory output under an optional prefix with `archive: none` replaces only the files written (`read-2` saw `a2 b1`); a missing output directory uploads nothing and does not fail (`no-output`); a missing optional input prefix is skipped (`missing-input`); template-level `volumes` work. If the wait times out or a node failed, inspect with `kubectl -n spike get workflow spike -o yaml` and STOP: report to the user with the per-dataset fallback above.

- [ ] **Step 5: Confirm bucket contents and archived logs**

```bash
kubectl --context mini-commerce -n spike run s3-ls --rm -i --restart=Never --quiet \
  --image=amazon/aws-cli:2.37.13 \
  --env=AWS_ACCESS_KEY_ID=punch --env=AWS_SECRET_ACCESS_KEY=punch-local-only --env=AWS_DEFAULT_REGION=us-east-1 \
  -- --endpoint-url http://seaweedfs:8333 s3 ls s3://punch-artifacts --recursive
```

Expected: lines for `datasets/a.csv`, `datasets/b.csv`, and `runs/spike/<pod>/main.log` entries.

- [ ] **Step 6: Clean up**

Run: `kubectl --context mini-commerce delete namespace spike`
Expected: `namespace "spike" deleted`. Leave namespace `argo` installed (Task 7 re-applies the same release). Record the outcome (pass, or the failing check) in the task report.

---

### Task 3: Punch shell step `k6-run.sh`

All paths in this task are inside `vendor/punch/`. Commit inside the submodule.

**Files:**
- Create: `vendor/punch/k8s/k6-run.sh`
- Test: `vendor/punch/tests/test_k8s_run_script.py`

**Interfaces:**
- Produces: the step contract read by Task 4's template. Inputs are env vars `PUNCH_WORKFLOW` (required), `PUNCH_SCRIPT` (required), `PUNCH_CONFIG`, `PUNCH_FORWARD`, `PUNCH_EXTRA_ENV`, `PUNCH_REQUIRES`, `PUNCH_REQUIRES_HINT`, `PUNCH_PRODUCES`, `PUNCH_PRODUCE`, plus test overrides `PUNCH_DATA_DIR` (default `/scripts/data`), `PUNCH_OUT_DIR` (default `/punch/out`), `PUNCH_OPTIONS_DIR` (default `/punch/options`). Outputs: `$PUNCH_OUT_DIR/datasets/<ds>.csv`, `$PUNCH_OUT_DIR/rows.txt`, `$PUNCH_OUT_DIR/stdout.log`. Exit: k6's code; 2 invalid input; 1 preflight/harvest failure.

- [ ] **Step 1: Write the failing tests**

Create `vendor/punch/tests/test_k8s_run_script.py`:

```python
"""k8s/k6-run.sh: the shell step of the punch-k6-run WorkflowTemplate.

Runs the script under `sh` with a fake `k6` on PATH, as the template runs it
inside the consumer's k6 image (Alpine busybox).
"""

from __future__ import annotations

import os
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).resolve().parents[1] / "k8s" / "k6-run.sh"

FAKE_K6 = """#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_K6_ARGS"
env > "$FAKE_K6_ENV"
cat "$FAKE_K6_STDOUT"
cat "$FAKE_K6_STDERR" >&2
exit "$FAKE_K6_EXIT"
"""


class K6RunScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        root = Path(self._tmp.name)
        self.bin = root / "bin"
        self.bin.mkdir()
        fake = self.bin / "k6"
        fake.write_text(FAKE_K6)
        fake.chmod(0o755)
        self.data = root / "data"
        self.data.mkdir()
        self.out = root / "out"
        self.stdout_file = root / "k6.stdout"
        self.stderr_file = root / "k6.stderr"
        self.args_file = root / "k6.args"
        self.env_file = root / "k6.env"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def run_script(
        self, *, stdout: str = "", stderr: str = "", k6_exit: int = 0, **params: str
    ) -> subprocess.CompletedProcess[str]:
        self.stdout_file.write_text(stdout)
        self.stderr_file.write_text(stderr)
        env = {
            "PATH": f"{self.bin}{os.pathsep}{os.environ['PATH']}",
            "PUNCH_WORKFLOW": "http-orders",
            "PUNCH_SCRIPT": "/scripts/scenarios/http-orders/http-orders.js",
            "PUNCH_DATA_DIR": str(self.data),
            "PUNCH_OUT_DIR": str(self.out),
            "PUNCH_OPTIONS_DIR": "/punch/options",
            "FAKE_K6_STDOUT": str(self.stdout_file),
            "FAKE_K6_STDERR": str(self.stderr_file),
            "FAKE_K6_ARGS": str(self.args_file),
            "FAKE_K6_ENV": str(self.env_file),
            "FAKE_K6_EXIT": str(k6_exit),
        }
        env.update({f"PUNCH_{key.upper()}": value for key, value in params.items()})
        return subprocess.run(
            ["sh", str(SCRIPT)], env=env, capture_output=True, text=True, check=False
        )

    def k6_args(self) -> list[str]:
        return self.args_file.read_text().splitlines()

    def k6_ran(self) -> bool:
        return self.args_file.exists()

    # --- run -------------------------------------------------------------

    def test_runs_the_script_with_the_preset_config(self) -> None:
        result = self.run_script(config="5-iterations")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.k6_args(),
            [
                "run",
                "/scripts/scenarios/http-orders/http-orders.js",
                "--config",
                "/punch/options/5-iterations.json",
            ],
        )

    def test_without_config_k6_gets_no_config_flag(self) -> None:
        self.assertEqual(self.run_script().returncode, 0)
        self.assertNotIn("--config", self.k6_args())

    def test_forwarded_extra_env_becomes_k6_env_flags(self) -> None:
        result = self.run_script(
            forward="EXPECT_TEMPERATURE ORDER_COOL_DOWN_SECONDS",
            extra_env="EXPECT_TEMPERATURE=hot",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.k6_args()[-2:], ["-e", "EXPECT_TEMPERATURE=hot"])

    def test_k6_failure_keeps_its_exit_code_and_publishes_nothing(self) -> None:
        result = self.run_script(
            produces="orders=orderId", produce="orders", stdout="[DATA orders] o-1\n", k6_exit=99
        )
        self.assertEqual(result.returncode, 99)
        self.assertFalse((self.out / "datasets").exists())

    # --- validation (exit 2, before k6) -----------------------------------

    def test_extra_env_outside_forward_exits_2_before_k6(self) -> None:
        result = self.run_script(forward="EXPECT_TEMPERATURE", extra_env="USERS=5")
        self.assertEqual(result.returncode, 2)
        self.assertIn('does not forward "USERS"', result.stderr)
        self.assertFalse(self.k6_ran())

    def test_extra_env_value_with_spaces_exits_2_before_k6(self) -> None:
        result = self.run_script(
            forward="EXPECT_TEMPERATURE", extra_env="EXPECT_TEMPERATURE=very hot"
        )
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.k6_ran())

    def test_undeclared_produce_exits_2_before_k6(self) -> None:
        result = self.run_script(produces="orders=orderId", produce="carts")
        self.assertEqual(result.returncode, 2)
        self.assertIn('does not produce "carts"', result.stderr)
        self.assertFalse(self.k6_ran())

    # --- preflight (exit 1, before k6) -------------------------------------

    def test_missing_required_dataset_fails_preflight_naming_producers(self) -> None:
        result = self.run_script(requires="carts", requires_hint="carts=browser-cart,http-cart")
        self.assertEqual(result.returncode, 1)
        self.assertIn(
            'http-orders requires "carts"; produce it with: browser-cart, http-cart '
            "(--produce carts)",
            result.stderr,
        )
        self.assertFalse(self.k6_ran())

    def test_missing_dataset_without_hint_names_no_known_workflow(self) -> None:
        result = self.run_script(requires="carts")
        self.assertIn("produce it with: no known workflow (--produce carts)", result.stderr)

    def test_header_only_dataset_fails_preflight(self) -> None:
        (self.data / "carts.csv").write_text("cartId,productId,sid\n\n")
        result = self.run_script(requires="carts", requires_hint="carts=http-cart")
        self.assertEqual(result.returncode, 1)
        self.assertFalse(self.k6_ran())

    def test_dataset_without_trailing_newline_passes_preflight(self) -> None:
        (self.data / "carts.csv").write_text("cartId,productId,sid\nc1,p1,s1")
        result = self.run_script(requires="carts")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_required_dataset_paths_are_exported(self) -> None:
        (self.data / "carts.csv").write_text("cartId,productId,sid\nc1,p1,s1\n")
        (self.data / "auth-tokens.csv").write_text("username,authToken\nu,t\n")
        self.assertEqual(self.run_script(requires="carts auth-tokens").returncode, 0)
        env = self.env_file.read_text().splitlines()
        self.assertIn(f"DATA_CARTS_CSV={self.data / 'carts.csv'}", env)
        self.assertIn(f"DATA_AUTH_TOKENS_CSV={self.data / 'auth-tokens.csv'}", env)

    # --- harvest -----------------------------------------------------------

    def test_harvests_opted_in_dataset(self) -> None:
        result = self.run_script(
            produces="orders=orderId",
            produce="orders",
            stdout="iteration 1\n[DATA orders] o-1\n[DATA orders]o-2\n",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.out / "datasets" / "orders.csv").read_text(), "orderId\no-1\no-2\n")
        self.assertEqual((self.out / "rows.txt").read_text().strip(), "orders=2")
        self.assertIn("[DATA orders] o-1", result.stdout)

    def test_stderr_records_are_never_harvested(self) -> None:
        result = self.run_script(
            produces="orders=orderId",
            produce="orders",
            stdout="[DATA orders] o-1\n",
            stderr="[DATA orders] o-from-stderr\n",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.out / "datasets" / "orders.csv").read_text(), "orderId\no-1\n")

    def test_without_produce_nothing_is_published(self) -> None:
        result = self.run_script(produces="orders=orderId", stdout="[DATA orders] o-1\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.out / "datasets").exists())
        self.assertEqual((self.out / "rows.txt").read_text(), "")

    def test_produce_all_opts_into_every_declared_dataset(self) -> None:
        result = self.run_script(
            produces="carts=cartId,productId,sid orders=orderId",
            produce="all",
            stdout="[DATA carts] c1,p1,s1\n[DATA orders] o-1\n",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            sorted(path.name for path in (self.out / "datasets").iterdir()),
            ["carts.csv", "orders.csv"],
        )

    def test_undeclared_record_fails_even_without_produce(self) -> None:
        result = self.run_script(produces="orders=orderId", stdout="[DATA carts] c1,p1,s1\n")
        self.assertEqual(result.returncode, 1)
        self.assertIn('undeclared dataset "carts"', result.stderr)

    def test_column_mismatch_fails_and_publishes_nothing(self) -> None:
        result = self.run_script(
            produces="carts=cartId,productId,sid",
            produce="carts",
            stdout="[DATA carts] c1,p1,s1\n[DATA carts] c2,p2\n",
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("expected 3 columns", result.stderr)
        self.assertFalse((self.out / "datasets").exists())

    def test_quoted_comma_payload_fails_loudly(self) -> None:
        result = self.run_script(
            produces="carts=cartId,productId,sid",
            produce="carts",
            stdout='[DATA carts] "c,1",p1,s1\n',
        )
        self.assertEqual(result.returncode, 1)
        self.assertFalse((self.out / "datasets").exists())

    def test_zero_rows_for_an_opted_in_dataset_fails(self) -> None:
        result = self.run_script(produces="orders=orderId", produce="orders", stdout="none\n")
        self.assertEqual(result.returncode, 1)
        self.assertIn("no [DATA orders] records were produced", result.stderr)
        self.assertFalse((self.out / "datasets").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd vendor/punch && PYTHONPATH=src ../../.cache/punch-venv/bin/python -m unittest tests.test_k8s_run_script -v 2>&1 | tail -5`
Expected: FAIL — `sh: .../k8s/k6-run.sh: No such file or directory` surfaces as non-matching return codes (e.g. `AssertionError: 127 != 0`).

- [ ] **Step 3: Write `vendor/punch/k8s/k6-run.sh`**

```sh
#!/bin/sh
# Punch's Kubernetes step: validate -> preflight -> k6 run -> [DATA] harvest.
#
# Runs as the punch-k6-run WorkflowTemplate's container inside the consumer's
# k6 image (Alpine busybox: sh, awk, tee, tr). Inputs arrive as PUNCH_*
# environment variables; contract: k8s/README.md. Exit codes: k6's own,
# 2 for invalid inputs, 1 for a failed preflight or harvest.
set -eu

workflow=${PUNCH_WORKFLOW:?PUNCH_WORKFLOW is required}
script=${PUNCH_SCRIPT:?PUNCH_SCRIPT is required}
config=${PUNCH_CONFIG:-}
forward=${PUNCH_FORWARD:-}
extra_env=${PUNCH_EXTRA_ENV:-}
requires=${PUNCH_REQUIRES:-}
requires_hint=${PUNCH_REQUIRES_HINT:-}
produces=${PUNCH_PRODUCES:-}
produce=${PUNCH_PRODUCE:-}
data_dir=${PUNCH_DATA_DIR:-/scripts/data}
out_dir=${PUNCH_OUT_DIR:-/punch/out}
options_dir=${PUNCH_OPTIONS_DIR:-/punch/options}

die() {
  code=$1
  shift
  echo "[punch] $*" >&2
  exit "$code"
}

# Value after "<key>=" in a space-separated "<key>=<value>" list.
lookup() {
  for entry in $2; do
    if [ "${entry%%=*}" = "$1" ]; then
      echo "${entry#*=}"
      return 0
    fi
  done
  return 1
}

declared=""
for entry in $produces; do
  declared="$declared ${entry%%=*}"
done

# 0. Validate inputs; nothing runs on a bad request.
opted=""
if [ "$produce" = "all" ]; then
  opted=$declared
else
  for dataset in $(echo "$produce" | tr ',' ' '); do
    lookup "$dataset" "$produces" >/dev/null ||
      die 2 "$workflow does not produce \"$dataset\" (declared:${declared:- none})"
    opted="$opted $dataset"
  done
fi

set -- run "$script"
if [ -n "$config" ]; then
  set -- "$@" --config "$options_dir/$config.json"
fi
for pair in $extra_env; do
  case $pair in
    ?*=*) ;;
    *) die 2 "extra env \"$pair\" is not NAME=VALUE (values cannot contain spaces)" ;;
  esac
  case " $forward " in
    *" ${pair%%=*} "*) set -- "$@" -e "$pair" ;;
    *) die 2 "$workflow does not forward \"${pair%%=*}\" (forwarded: ${forward:-none})" ;;
  esac
done

# 1. Preflight: every required dataset has at least one row after its header.
for dataset in $requires; do
  file="$data_dir/$dataset.csv"
  rows=0
  if [ -f "$file" ]; then
    rows=$(awk 'NR > 1 && NF { n++ } END { print n + 0 }' "$file")
  fi
  if [ "$rows" -lt 1 ]; then
    producers=$(lookup "$dataset" "$requires_hint" | sed 's/,/, /g')
    die 1 "$workflow requires \"$dataset\"; produce it with:" \
      "${producers:-no known workflow} (--produce $dataset)"
  fi
  export "DATA_$(echo "$dataset" | tr 'a-z-' 'A-Z_')_CSV=$file"
done

# 2. Run k6. Only stdout is teed for harvesting; stderr goes to the pod log.
mkdir -p "$out_dir"
: >"$out_dir/rows.txt"
{
  status=0
  k6 "$@" || status=$?
  echo "$status" >"$out_dir/k6.status"
} | tee "$out_dir/stdout.log"
status=$(cat "$out_dir/k6.status")
if [ "$status" -ne 0 ]; then
  exit "$status"
fi

# 3. Harvest [DATA <dataset>] records. Every record is checked; files are
#    published only after the whole log passes.
staging="$out_dir/.staging"
rm -rf "$staging"
mkdir -p "$staging"
awk -v declared="$produces" -v opted="$opted" -v staging="$staging" '
  BEGIN {
    n = split(declared, entries, " ")
    for (i = 1; i <= n; i++) {
      eq = index(entries[i], "=")
      name = substr(entries[i], 1, eq - 1)
      header[name] = substr(entries[i], eq + 1)
      columns[name] = split(header[name], ignored, ",")
    }
    n = split(opted, names, " ")
    for (i = 1; i <= n; i++) {
      wanted[names[i]] = 1
      rows[names[i]] = 0
    }
  }
  /^\[DATA [a-z0-9]([a-z0-9-]*[a-z0-9])?\]/ {
    close_at = index($0, "]")
    name = substr($0, 7, close_at - 7)
    payload = substr($0, close_at + 1)
    if (substr(payload, 1, 1) == " ") payload = substr(payload, 2)
    if (!(name in columns)) {
      print "[punch] undeclared dataset \"" name "\"" > "/dev/stderr"
      failed = 1
      exit 1
    }
    if (!(name in wanted)) next
    if (split(payload, fields, ",") != columns[name]) {
      print "[punch] " name ": expected " columns[name] " columns, got \"" payload "\"" > "/dev/stderr"
      failed = 1
      exit 1
    }
    file = staging "/" name ".csv"
    if (rows[name] == 0) print header[name] > file
    print payload > file
    rows[name]++
  }
  END {
    if (failed) exit 1
    for (name in wanted) {
      if (rows[name] == 0) {
        print "[punch] no [DATA " name "] records were produced" > "/dev/stderr"
        exit 1
      }
      print name "=" rows[name] > (staging "/rows.txt")
    }
  }
' "$out_dir/stdout.log" || exit 1

if [ -n "$opted" ]; then
  mkdir -p "$out_dir/datasets"
  for dataset in $opted; do
    mv "$staging/$dataset.csv" "$out_dir/datasets/$dataset.csv"
  done
  mv "$staging/rows.txt" "$out_dir/rows.txt"
fi
rm -rf "$staging"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd vendor/punch && PYTHONPATH=src ../../.cache/punch-venv/bin/python -m unittest tests.test_k8s_run_script -v 2>&1 | tail -5`
Expected: `Ran 20 tests` … `OK`

- [ ] **Step 5: Verify under busybox `sh` in the real k6 image**

```bash
docker run --rm -v "$PWD/vendor/punch/k8s:/punch/bin:ro" --entrypoint sh grafana/k6:0.54.0 -c '
  mkdir -p /tmp/fake && printf "#!/bin/sh\necho \"[DATA orders] o-1\"\n" > /tmp/fake/k6 && chmod +x /tmp/fake/k6
  PATH=/tmp/fake:$PATH PUNCH_WORKFLOW=w PUNCH_SCRIPT=s PUNCH_PRODUCES=orders=orderId PUNCH_PRODUCE=orders \
    PUNCH_OUT_DIR=/tmp/out sh /punch/bin/k6-run.sh && cat /tmp/out/datasets/orders.csv /tmp/out/rows.txt'
```

Expected output ends with:
```
orderId
o-1
orders=1
```

- [ ] **Step 6: Commit (inside the submodule)**

```bash
git -C vendor/punch add k8s/k6-run.sh tests/test_k8s_run_script.py
git -C vendor/punch commit -m "feat(k8s): add the shell step for the Kubernetes runtime"
```

---

### Task 4: Punch `punch-k6-run` WorkflowTemplate and kustomize base

**Files:**
- Create: `vendor/punch/k8s/punch-k6-run.yaml`, `vendor/punch/k8s/rbac.yaml`, `vendor/punch/k8s/kustomization.yaml`, `vendor/punch/k8s/kustomizeconfig.yaml`, `vendor/punch/k8s/examples/artifact-repositories.yaml`
- Test: `vendor/punch/tests/test_k8s_base.py`

**Interfaces:**
- Consumes: `k6-run.sh` env contract (Task 3).
- Produces (used by Task 6): WorkflowTemplate `punch-k6-run` with templates `k6` and `k6-browser`; input parameters, in order, `workflow`, `script`, `config`, `base-url`, `forward`, `extra-env`, `requires`, `requires-hint`, `produces`, `produce` (only `workflow`, `script`, `base-url` required); output parameter `datasets`; image placeholders `k6-scenarios`, `k6-scenarios-browser`; consumer must provide ConfigMap `punch-k6-options` and the default artifact repository; consumer lists `kustomizeconfig.yaml` under `configurations:`.

- [ ] **Step 1: Write the failing tests**

Create `vendor/punch/tests/test_k8s_base.py`:

```python
"""k8s/: the punch-k6-run WorkflowTemplate, its RBAC, and kustomize wiring."""

from __future__ import annotations

import unittest
from pathlib import Path

import yaml

K8S = Path(__file__).resolve().parents[1] / "k8s"
PARAMETERS = (
    "workflow",
    "script",
    "config",
    "base-url",
    "forward",
    "extra-env",
    "requires",
    "requires-hint",
    "produces",
    "produce",
)


def _documents(name: str) -> list[dict]:
    return [doc for doc in yaml.safe_load_all((K8S / name).read_text(encoding="utf-8")) if doc]


def _templates() -> dict[str, dict]:
    [template] = _documents("punch-k6-run.yaml")
    return {t["name"]: t for t in template["spec"]["templates"]}


def _env_name(parameter: str) -> str:
    return "BASE_URL" if parameter == "base-url" else "PUNCH_" + parameter.upper().replace("-", "_")


class PunchK6RunTemplateTests(unittest.TestCase):
    def test_declares_k6_and_k6_browser(self) -> None:
        self.assertEqual(set(_templates()), {"k6", "k6-browser"})

    def test_every_parameter_reaches_the_script_as_env(self) -> None:
        for name, template in _templates().items():
            with self.subTest(template=name):
                declared = [p["name"] for p in template["inputs"]["parameters"]]
                self.assertEqual(declared, list(PARAMETERS))
                env = {e["name"]: e["value"] for e in template["container"]["env"]}
                for parameter in PARAMETERS:
                    self.assertEqual(
                        env[_env_name(parameter)], "{{inputs.parameters.%s}}" % parameter
                    )
                self.assertEqual(env["K6_LOG_OUTPUT"], "stdout")
                self.assertEqual(env["K6_LOG_FORMAT"], "raw")

    def test_only_workflow_script_and_base_url_are_required(self) -> None:
        for template in _templates().values():
            required = {p["name"] for p in template["inputs"]["parameters"] if "default" not in p}
            self.assertEqual(required, {"workflow", "script", "base-url"})

    def test_runs_bounded_with_the_executor_account_and_archived_logs(self) -> None:
        # An unpullable image must fail the run instead of hanging a PostSync hook.
        for template in _templates().values():
            self.assertEqual(template["activeDeadlineSeconds"], 900)
            self.assertEqual(template["serviceAccountName"], "punch-executor")
            self.assertTrue(template["archiveLocation"]["archiveLogs"])

    def test_runs_the_mounted_script_in_the_consumer_image(self) -> None:
        images = {name: t["container"]["image"] for name, t in _templates().items()}
        self.assertEqual(images, {"k6": "k6-scenarios", "k6-browser": "k6-scenarios-browser"})
        for template in _templates().values():
            self.assertEqual(template["container"]["command"], ["sh", "/punch/bin/k6-run.sh"])
            mounts = {m["mountPath"]: m["name"] for m in template["container"]["volumeMounts"]}
            volumes = {v["name"]: v for v in template["volumes"]}
            self.assertEqual(volumes[mounts["/punch/bin"]]["configMap"]["name"], "punch-k6-run-script")
            self.assertEqual(volumes[mounts["/punch/options"]]["configMap"]["name"], "punch-k6-options")
            self.assertIn("emptyDir", volumes[mounts["/punch/out"]])
            self.assertIn("emptyDir", volumes[mounts["/scripts/reports"]])

    def test_browser_template_adds_shared_memory(self) -> None:
        browser = _templates()["k6-browser"]
        mounts = {m["mountPath"]: m["name"] for m in browser["container"]["volumeMounts"]}
        volumes = {v["name"]: v for v in browser["volumes"]}
        self.assertEqual(volumes[mounts["/dev/shm"]]["emptyDir"], {"medium": "Memory", "sizeLimit": "512Mi"})
        k6_mounts = {m["mountPath"] for m in _templates()["k6"]["container"]["volumeMounts"]}
        self.assertNotIn("/dev/shm", k6_mounts)

    def test_datasets_move_through_one_s3_prefix(self) -> None:
        for template in _templates().values():
            [dataset_input] = template["inputs"]["artifacts"]
            self.assertEqual(
                (dataset_input["path"], dataset_input["s3"]["key"], dataset_input["optional"]),
                ("/scripts/data", "datasets", True),
            )
            outputs = {a["name"]: a for a in template["outputs"]["artifacts"]}
            self.assertEqual(outputs["datasets"]["path"], "/punch/out/datasets")
            self.assertEqual(outputs["datasets"]["s3"]["key"], "datasets")
            self.assertEqual(outputs["reports"]["path"], "/scripts/reports")
            self.assertEqual(outputs["reports"]["s3"]["key"], "runs/{{workflow.name}}/reports")
            for artifact in outputs.values():
                self.assertTrue(artifact["optional"])
                self.assertEqual(artifact["archive"], {"none": {}})
            [rows] = template["outputs"]["parameters"]
            self.assertEqual(rows["name"], "datasets")
            self.assertEqual(rows["valueFrom"], {"path": "/punch/out/rows.txt", "default": ""})


class KustomizeWiringTests(unittest.TestCase):
    def test_kustomization_generates_the_script_configmap_with_a_stable_name(self) -> None:
        [kustomization] = _documents("kustomization.yaml")
        self.assertEqual(kustomization["resources"], ["rbac.yaml", "punch-k6-run.yaml"])
        [generator] = kustomization["configMapGenerator"]
        self.assertEqual((generator["name"], generator["files"]), ("punch-k6-run-script", ["k6-run.sh"]))
        self.assertTrue(kustomization["generatorOptions"]["disableNameSuffixHash"])

    def test_images_fieldspec_reaches_workflow_template_containers(self) -> None:
        [config] = _documents("kustomizeconfig.yaml")
        self.assertEqual(
            config["images"], [{"path": "spec/templates[]/container/image", "kind": "WorkflowTemplate"}]
        )

    def test_executor_role_allows_task_results_only(self) -> None:
        role = next(d for d in _documents("rbac.yaml") if d["kind"] == "Role")
        self.assertEqual(
            role["rules"],
            [{"apiGroups": ["argoproj.io"], "resources": ["workflowtaskresults"], "verbs": ["create", "patch"]}],
        )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd vendor/punch && PYTHONPATH=src ../../.cache/punch-venv/bin/python -m unittest tests.test_k8s_base 2>&1 | tail -3`
Expected: ERROR — `FileNotFoundError: ... k8s/punch-k6-run.yaml`

- [ ] **Step 3: Write `vendor/punch/k8s/punch-k6-run.yaml`**

```yaml
# Punch's step for Argo Workflows: one k6 run of a consumer's scenario image,
# with Punch's dataset preflight and [DATA] harvest (k6-run.sh, mounted from
# the punch-k6-run-script ConfigMap). Consumers call it from thin
# per-workflow WorkflowTemplates via templateRef; contract: README.md.
# k6 and k6-browser differ only in the image placeholder and the /dev/shm
# volume Chromium needs.
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: punch-k6-run
spec:
  templates:
    - name: k6
      serviceAccountName: punch-executor
      # Bounds a run that never starts (e.g. ImagePullBackOff) so an Argo CD
      # hook fails instead of hanging.
      activeDeadlineSeconds: 900
      archiveLocation:
        archiveLogs: true
      inputs:
        parameters:
          - name: workflow
          - name: script
          - name: config
            default: ""
          - name: base-url
          - name: forward
            default: ""
          - name: extra-env
            default: ""
          - name: requires
            default: ""
          - name: requires-hint
            default: ""
          - name: produces
            default: ""
          - name: produce
            default: ""
        artifacts:
          - name: datasets
            path: /scripts/data
            optional: true
            s3:
              key: datasets
      outputs:
        parameters:
          - name: datasets
            valueFrom:
              path: /punch/out/rows.txt
              default: ""
        artifacts:
          - name: datasets
            path: /punch/out/datasets
            optional: true
            archive:
              none: {}
            s3:
              key: datasets
          - name: reports
            path: /scripts/reports
            optional: true
            archive:
              none: {}
            s3:
              key: "runs/{{workflow.name}}/reports"
      container:
        image: k6-scenarios
        imagePullPolicy: Always
        command: [sh, /punch/bin/k6-run.sh]
        env:
          - name: PUNCH_WORKFLOW
            value: "{{inputs.parameters.workflow}}"
          - name: PUNCH_SCRIPT
            value: "{{inputs.parameters.script}}"
          - name: PUNCH_CONFIG
            value: "{{inputs.parameters.config}}"
          - name: BASE_URL
            value: "{{inputs.parameters.base-url}}"
          - name: PUNCH_FORWARD
            value: "{{inputs.parameters.forward}}"
          - name: PUNCH_EXTRA_ENV
            value: "{{inputs.parameters.extra-env}}"
          - name: PUNCH_REQUIRES
            value: "{{inputs.parameters.requires}}"
          - name: PUNCH_REQUIRES_HINT
            value: "{{inputs.parameters.requires-hint}}"
          - name: PUNCH_PRODUCES
            value: "{{inputs.parameters.produces}}"
          - name: PUNCH_PRODUCE
            value: "{{inputs.parameters.produce}}"
          # As in compose: console.log [DATA] records must reach stdout
          # unwrapped for the harvest.
          - name: K6_LOG_OUTPUT
            value: stdout
          - name: K6_LOG_FORMAT
            value: raw
        volumeMounts:
          - name: punch-bin
            mountPath: /punch/bin
          - name: punch-options
            mountPath: /punch/options
          - name: punch-out
            mountPath: /punch/out
          - name: reports
            mountPath: /scripts/reports
      volumes:
        - name: punch-bin
          configMap:
            name: punch-k6-run-script
        - name: punch-options
          configMap:
            name: punch-k6-options
        - name: punch-out
          emptyDir: {}
        - name: reports
          emptyDir: {}

    - name: k6-browser
      serviceAccountName: punch-executor
      activeDeadlineSeconds: 900
      archiveLocation:
        archiveLogs: true
      inputs:
        parameters:
          - name: workflow
          - name: script
          - name: config
            default: ""
          - name: base-url
          - name: forward
            default: ""
          - name: extra-env
            default: ""
          - name: requires
            default: ""
          - name: requires-hint
            default: ""
          - name: produces
            default: ""
          - name: produce
            default: ""
        artifacts:
          - name: datasets
            path: /scripts/data
            optional: true
            s3:
              key: datasets
      outputs:
        parameters:
          - name: datasets
            valueFrom:
              path: /punch/out/rows.txt
              default: ""
        artifacts:
          - name: datasets
            path: /punch/out/datasets
            optional: true
            archive:
              none: {}
            s3:
              key: datasets
          - name: reports
            path: /scripts/reports
            optional: true
            archive:
              none: {}
            s3:
              key: "runs/{{workflow.name}}/reports"
      container:
        image: k6-scenarios-browser
        imagePullPolicy: Always
        command: [sh, /punch/bin/k6-run.sh]
        env:
          - name: PUNCH_WORKFLOW
            value: "{{inputs.parameters.workflow}}"
          - name: PUNCH_SCRIPT
            value: "{{inputs.parameters.script}}"
          - name: PUNCH_CONFIG
            value: "{{inputs.parameters.config}}"
          - name: BASE_URL
            value: "{{inputs.parameters.base-url}}"
          - name: PUNCH_FORWARD
            value: "{{inputs.parameters.forward}}"
          - name: PUNCH_EXTRA_ENV
            value: "{{inputs.parameters.extra-env}}"
          - name: PUNCH_REQUIRES
            value: "{{inputs.parameters.requires}}"
          - name: PUNCH_REQUIRES_HINT
            value: "{{inputs.parameters.requires-hint}}"
          - name: PUNCH_PRODUCES
            value: "{{inputs.parameters.produces}}"
          - name: PUNCH_PRODUCE
            value: "{{inputs.parameters.produce}}"
          - name: K6_LOG_OUTPUT
            value: stdout
          - name: K6_LOG_FORMAT
            value: raw
        volumeMounts:
          - name: punch-bin
            mountPath: /punch/bin
          - name: punch-options
            mountPath: /punch/options
          - name: punch-out
            mountPath: /punch/out
          - name: reports
            mountPath: /scripts/reports
          # Chromium needs more than the default 64 MB (compose shm_size).
          - name: dshm
            mountPath: /dev/shm
      volumes:
        - name: punch-bin
          configMap:
            name: punch-k6-run-script
        - name: punch-options
          configMap:
            name: punch-k6-options
        - name: punch-out
          emptyDir: {}
        - name: reports
          emptyDir: {}
        - name: dshm
          emptyDir:
            medium: Memory
            sizeLimit: 512Mi
```

- [ ] **Step 4: Write `rbac.yaml`, `kustomization.yaml`, `kustomizeconfig.yaml`, and the AWS example**

`vendor/punch/k8s/rbac.yaml`:

```yaml
# Service account the punch-k6-run pods run as. Argo's executor reports step
# results through WorkflowTaskResults; nothing else is needed.
apiVersion: v1
kind: ServiceAccount
metadata:
  name: punch-executor
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: punch-executor
rules:
  - apiGroups: [argoproj.io]
    resources: [workflowtaskresults]
    verbs: [create, patch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: punch-executor
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: punch-executor
subjects:
  - kind: ServiceAccount
    name: punch-executor
```

`vendor/punch/k8s/kustomization.yaml`:

```yaml
# Punch's Kubernetes runtime: the generic punch-k6-run WorkflowTemplate, its
# shell step, and the executor RBAC. A consumer adds this directory as a
# kustomize resource, sets `namespace:`, lists kustomizeconfig.yaml under
# `configurations:`, maps the k6-scenarios images, and provides the
# punch-k6-options ConfigMap and a default artifact repository. README.md.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - rbac.yaml
  - punch-k6-run.yaml

configMapGenerator:
  - name: punch-k6-run-script
    files:
      - k6-run.sh

# The WorkflowTemplate references the ConfigMap by name, which kustomize does
# not rewrite inside custom resources, so keep the name stable.
generatorOptions:
  disableNameSuffixHash: true
```

`vendor/punch/k8s/kustomizeconfig.yaml`:

```yaml
# Lets a consumer's kustomize `images:` rewrite the k6-scenarios /
# k6-scenarios-browser placeholders inside punch-k6-run. List this file under
# `configurations:` in the consumer kustomization: a base's configurations do
# not apply to its overlays.
images:
  - path: spec/templates[]/container/image
    kind: WorkflowTemplate
```

`vendor/punch/k8s/examples/artifact-repositories.yaml`:

```yaml
# Example default artifact repository on real AWS S3 for the namespace that
# runs punch-k6-run. Credentials come from the pod's IAM role (IRSA on EKS),
# so no keys are stored. Not part of the kustomize base: consumers ship
# their own (a local stand-in, or this shape with their bucket).
apiVersion: v1
kind: ConfigMap
metadata:
  name: artifact-repositories
  annotations:
    workflows.argoproj.io/default-artifact-repository: s3
data:
  s3: |
    s3:
      endpoint: s3.amazonaws.com
      bucket: my-punch-artifacts
      region: us-east-1
      useSDKCreds: true
      keyFormat: "runs/{{workflow.name}}/{{pod.name}}"
```

- [ ] **Step 5: Run the tests, then render the base**

Run: `cd vendor/punch && PYTHONPATH=src ../../.cache/punch-venv/bin/python -m unittest tests.test_k8s_base -v 2>&1 | tail -3`
Expected: `Ran 10 tests` … `OK`

Run: `kubectl kustomize vendor/punch/k8s | grep -E "^kind:|name: punch-k6-run-script"`
Expected: `kind: ServiceAccount`, `kind: Role`, `kind: RoleBinding`, `kind: ConfigMap`, `kind: WorkflowTemplate`, and `name: punch-k6-run-script` (no hash suffix).

- [ ] **Step 6: Commit (inside the submodule)**

```bash
git -C vendor/punch add k8s/punch-k6-run.yaml k8s/rbac.yaml k8s/kustomization.yaml \
  k8s/kustomizeconfig.yaml k8s/examples/artifact-repositories.yaml tests/test_k8s_base.py
git -C vendor/punch commit -m "feat(k8s): add the punch-k6-run WorkflowTemplate base"
```

---

### Task 5: Punch docs, full Punch suite, push, outer pointer bump

**Files:**
- Create: `vendor/punch/k8s/README.md`, `vendor/punch/docs/decisions/0006-kubernetes-runtime.md`
- Modify: `vendor/punch/docs/architecture/punch-boundaries.md`, `vendor/punch/CLAUDE.md`, `vendor/punch/README.md`
- Modify (outer): submodule pointer `vendor/punch`

**Interfaces:** Consumes Tasks 3–4. Produces a pushed Punch commit that the outer repo points at.

- [ ] **Step 1: Write `vendor/punch/k8s/README.md`**

````markdown
# Punch on Kubernetes

A second, Kubernetes-native runtime for Punch workflows
([ADR 0006](../docs/decisions/0006-kubernetes-runtime.md)). Argo Workflows
runs the step and moves artifacts through S3; a POSIX shell step ports
Punch's core data contract. No Python and no Punch image run in the cluster.
The compose runtime (`punch run`) is unchanged.

| File | Holds |
| --- | --- |
| `punch-k6-run.yaml` | `WorkflowTemplate punch-k6-run`: templates `k6` and `k6-browser` |
| `k6-run.sh` | The step: validate → preflight → `k6 run` → `[DATA]` harvest |
| `rbac.yaml` | `punch-executor` ServiceAccount, Role (WorkflowTaskResults), RoleBinding |
| `kustomization.yaml` | Base: the above plus ConfigMap `punch-k6-run-script` |
| `kustomizeconfig.yaml` | `images:` fieldSpec for WorkflowTemplate containers |
| `examples/artifact-repositories.yaml` | Real-AWS S3 repository (IRSA) |

## Parameters

| Parameter | Required | Example | Meaning |
| --- | --- | --- | --- |
| `workflow` | yes | `http-orders` | Workflow id, used in messages |
| `script` | yes | `/scripts/scenarios/http-orders/http-orders.js` | k6 entry in the consumer image |
| `base-url` | yes | `http://bff.shop.svc.cluster.local:3001` | `BASE_URL` |
| `config` | no | `5-iterations` | Preset → `k6 run --config /punch/options/<config>.json` |
| `forward` | no | `EXPECT_TEMPERATURE USERS` | Names `extra-env` may set |
| `extra-env` | no | `EXPECT_TEMPERATURE=hot` | Space-separated `K=V`, each passed as `-e K=V`; values cannot contain spaces |
| `requires` | no | `carts` | Datasets that must exist with ≥ 1 row |
| `requires-hint` | no | `carts=browser-cart,http-cart` | Producers named in the preflight failure |
| `produces` | no | `orders=orderId` | Declared datasets and columns, `<ds>=<col>,<col>` space-separated |
| `produce` | no | `orders` or `all` | Datasets this run publishes (comma-separated) |

Container environment: `BASE_URL`, `K6_LOG_OUTPUT=stdout`, `K6_LOG_FORMAT=raw`,
and `DATA_<DATASET>_CSV=/scripts/data/<dataset>.csv` per required dataset
(`-` becomes `_`).

## Behavior

1. **Validate** — an undeclared `produce` entry or an `extra-env` name outside
   `forward` exits 2 before anything runs.
2. **Preflight** — a required dataset that is missing or has no row after its
   header exits 1: `<workflow> requires "<ds>"; produce it with: <producers>
   (--produce <ds>)`.
3. **Run** — k6's stdout is teed to `/punch/out/stdout.log`; stderr goes only
   to the pod log and is never harvested. A non-zero k6 exit ends the step
   with that code and publishes nothing.
4. **Harvest** — every `[DATA <ds>] payload` line on stdout is checked: an
   undeclared `<ds>` fails; for an opted-in `<ds>`, the comma-separated field
   count must match its columns; an opted-in dataset with zero rows fails.
   Only after the whole log passes are `<ds>.csv` files (header + rows)
   written to `/punch/out/datasets/` and `rows.txt` (`<ds>=<count>`) written.

Payloads are plain comma-separated values with no quoting; a quoted comma
fails the column check. The compose runtime's Python harvester accepts full
CSV.

## Artifacts and evidence

| Direction | Path | S3 key |
| --- | --- | --- |
| In (optional) | `/scripts/data` | `datasets/` |
| Out (optional, `archive: none`) | `/punch/out/datasets` | `datasets/` — only written files replace objects |
| Out (optional, `archive: none`) | `/scripts/reports` | `runs/{{workflow.name}}/reports/` |
| Logs | — | `archiveLogs: true` → repository `keyFormat` |

Evidence is the Workflow itself: its phase, node messages and exit codes, the
`datasets` output parameter (from `rows.txt`), and the archived logs and
reports. Runs end within `activeDeadlineSeconds: 900`.

## Consumer setup

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: perf
resources:
  - <path>/punch/k8s
  - artifact-repositories.yaml   # default S3 repository for this namespace
  - workflows/http-orders.yaml   # thin templates calling punch-k6-run
configurations:
  - <path>/punch/k8s/kustomizeconfig.yaml
images:
  - name: k6-scenarios
    newName: <registry>/<repo>/k6
    newTag: <tag>
  - name: k6-scenarios-browser
    newName: <registry>/<repo>/k6-browser
    newTag: <tag>
configMapGenerator:
  - name: punch-k6-options      # k6 options JSON presets, one key per file
    files: [options/5-iterations.json]
generatorOptions:
  disableNameSuffixHash: true
```

A thin template runs one workflow:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: http-orders
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://bff.shop.svc.cluster.local:3001" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6 }
            arguments:
              parameters:
                - { name: workflow, value: http-orders }
                - { name: script, value: /scripts/scenarios/http-orders/http-orders.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: "" }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: carts }
                - { name: requires-hint, value: "carts=http-cart" }
                - { name: produces, value: "orders=orderId" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

Render with `kubectl kustomize --load-restrictor LoadRestrictionsNone` when
the base or presets live outside the kustomization root, and apply with
`--server-side` (Argo's CRDs exceed the client-side annotation limit).
````

- [ ] **Step 2: Write `vendor/punch/docs/decisions/0006-kubernetes-runtime.md`**

```markdown
# ADR 0006: Kubernetes Runtime on Argo Workflows

- Status: Accepted
- Date: 2026-10-13

## Context

Punch runs one workflow as one `docker compose run`, driven by Python on the
host. A consumer needs the same runs inside Kubernetes — synced by Argo CD,
triggered by a CI job, with images in a registry and datasets in S3 — without
a host process or Python in the cluster.

## Decision

Punch ships a second, Kubernetes-native runtime in `k8s/`: a generic Argo
Workflows `WorkflowTemplate` (`punch-k6-run`), the POSIX shell step
`k6-run.sh` it runs inside the consumer's k6 image, and the executor RBAC.
Argo Workflows does scheduling and S3 artifact I/O. The shell step ports
Punch's core data contract: dataset preflight, stdout-only `[DATA]` harvest
with explicit opt-in, column checks, and atomic publication. Run evidence is
the Workflow status plus archived logs and reports.

The compose runtime is unchanged and remains the default. The menu, prompts,
catalog checks, sizing, and `--data` stay local-only.

## Consequences

- Anti-pattern 4 ("Python bypassing Compose") is a compose-runtime rule. On
  Kubernetes the step's pod is the isolation boundary and k6 runs directly in
  it.
- Two harvesters implement the `[DATA]` contract: Python (full CSV) for
  compose and shell (plain comma-separated payloads, no quoting) for
  Kubernetes. `tests/test_k8s_run_script.py` pins the shell side.
- Consumers own image mapping, the `punch-k6-options` presets ConfigMap, the
  artifact repository, and one thin WorkflowTemplate per workflow.

## Rejected alternatives

- Punch's Python engine in a runner image: keeps Python in the cluster and a
  host-shaped engine in a pod.
- k6-operator `TestRun`: its distributed load is not needed and it has no
  data handoff between runs.
- Plain Jobs with a harvest sidecar: hand-built artifact plumbing and a race
  with main-container exit.
```

- [ ] **Step 3: Update Punch's boundaries doc, CLAUDE.md, and README**

In `vendor/punch/docs/architecture/punch-boundaries.md`, insert this section immediately before `## Allowed calls`:

```markdown
## Kubernetes runtime (`k8s/`)

A second runtime for consumers on Kubernetes
([ADR 0006](../decisions/0006-kubernetes-runtime.md)). It holds no Python.

| Layer | Owns | Never owns |
|---|---|---|
| `k8s/punch-k6-run.yaml` | Step shape: parameters, env, mounts, S3 artifacts, deadline | Consumer images, presets, targets |
| `k8s/k6-run.sh` | Validation, preflight, `[DATA]` harvest, atomic publication | Scheduling, S3 I/O (Argo's executor) |
| Consumer | Thin per-workflow templates, image mapping, `punch-k6-options`, artifact repository | The step's semantics |

Anti-pattern 4 below is a compose-runtime rule: on Kubernetes, k6 runs
directly in the step's pod.
```

In `vendor/punch/CLAUDE.md`, add this row to the Layout table directly after the `| \`src/punch/\` | ...` row:

```markdown
| `k8s/` | Kubernetes runtime (ADR 0006): `punch-k6-run` WorkflowTemplate, `k6-run.sh` step, executor RBAC — no Python |
```

and add this paragraph directly after the Execution chain code block:

```markdown
The Kubernetes runtime ([`k8s/README.md`](k8s/README.md)) keeps the chain up
to the k6 image, then runs one Argo Workflows step per workflow with S3
artifacts instead of `docker compose run`.
```

In `vendor/punch/README.md`, append at the end of the file:

```markdown
## Kubernetes runtime

`k8s/` runs the same workflows natively on Argo Workflows — no Python in the
cluster, datasets and evidence in S3. Contract and consumer setup:
[`k8s/README.md`](k8s/README.md).
```

- [ ] **Step 4: Run the full Punch suite**

Run: `cd vendor/punch && PYTHONPATH=src ../../.cache/punch-venv/bin/python -m unittest discover -s tests -p 'test_*.py' 2>&1 | tail -3`
Expected: `OK` (if `test_ci_contract` asserts on doc text you changed, fix the doc wording to satisfy it — do not edit the test).

- [ ] **Step 5: Commit the docs (inside the submodule) and push Punch**

```bash
git -C vendor/punch add k8s/README.md docs/decisions/0006-kubernetes-runtime.md \
  docs/architecture/punch-boundaries.md CLAUDE.md README.md
git -C vendor/punch commit -m "docs(k8s): document the Kubernetes runtime and record ADR 0006"
git -C vendor/punch status --short   # only the pre-existing .github changes may remain
git -C vendor/punch log origin/main..HEAD --oneline   # exactly the three commits from Tasks 3-5
git -C vendor/punch push origin main
```

Expected: push succeeds; `git -C vendor/punch branch -r --contains HEAD` prints `origin/main`.

- [ ] **Step 6: Bump the outer pointer**

```bash
git add vendor/punch
git commit -m "chore(punch): bump vendor/punch to the Kubernetes runtime"
```

---

### Task 6: Expresso perf platform manifests and the parity test

**Files:**
- Create: `infra/k8s/perf/kustomization.yaml`
- Create: `infra/k8s/perf/argo-workflows/kustomization.yaml`, `infra/k8s/perf/argo-workflows/namespace.yaml`
- Create: `infra/k8s/perf/aws-local/kustomization.yaml`, `infra/k8s/perf/aws-local/namespace.yaml`, `infra/k8s/perf/aws-local/seaweedfs.yaml`
- Create: `infra/k8s/perf/punch/kustomization.yaml`, `infra/k8s/perf/punch/namespace.yaml`, `infra/k8s/perf/punch/artifact-repositories.yaml`
- Create: `infra/k8s/perf/punch/workflows/{browser-cart,browser-purchase,http-auth-login,http-cart,http-me-hot-status,http-orders,http-orders-status,http-purchase,http-purchase-registered}.yaml`
- Test: `scripts/pg/tests/test_k8s_workflows.py`

**Interfaces:**
- Consumes: `punch-k6-run` (Task 4); Punch's `load_workflow`, `load_catalog().producers_of`, `K6Workflow.{name,compose_service,k6_script,k6_config,forward_environment,data}`.
- Produces (used by Tasks 7, 8, 11): rendered `infra/k8s/perf`; WorkflowTemplates named by workflow id in namespace `punch`, each with workflow arguments `config`, `produce`, `base-url`, `extra-env`; image mapping in `infra/k8s/perf/punch/kustomization.yaml` `images:`.

- [ ] **Step 1: Write the failing parity test**

Create `scripts/pg/tests/test_k8s_workflows.py`:

```python
"""Each Kubernetes thin template mirrors its Punch workflow YAML.

infra/k8s/perf/punch/workflows/<id>.yaml runs Punch's generic punch-k6-run
template with the facts of tests/performance/k6/workflows/<id>.yaml. The
cluster never reads the Punch YAML, so this test is what keeps them equal.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.paths import K8S_DIR, PERF_OPTIONS_DIR, PERF_WORKFLOWS_DIR  # noqa: E402
from punch.catalog import load_catalog  # noqa: E402
from punch.workflow import load_workflow  # noqa: E402

PUNCH_DIR = K8S_DIR / "perf" / "punch"
THIN_DIR = PUNCH_DIR / "workflows"
BASE_URLS = {
    "k6": "http://bff.mini-commerce.svc.cluster.local:3001",
    "k6-browser": "http://web.mini-commerce.svc.cluster.local:3000",
}
PASSED_THROUGH = {
    "config": "{{workflow.parameters.config}}",
    "base-url": "{{workflow.parameters.base-url}}",
    "extra-env": "{{workflow.parameters.extra-env}}",
    "produce": "{{workflow.parameters.produce}}",
}


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _named(items: list) -> dict:
    return {item["name"]: item.get("value") for item in items}


class ThinTemplateParityTests(unittest.TestCase):
    def test_one_thin_template_per_punch_workflow(self) -> None:
        punch = {path.stem for path in PERF_WORKFLOWS_DIR.glob("*.yaml")}
        thin = {path.stem for path in THIN_DIR.glob("*.yaml")}
        self.assertEqual(thin, punch)

    def test_kustomization_lists_every_thin_template(self) -> None:
        resources = _load(PUNCH_DIR / "kustomization.yaml")["resources"]
        listed = {r for r in resources if r.startswith("workflows/")}
        self.assertEqual(listed, {f"workflows/{p.name}" for p in THIN_DIR.glob("*.yaml")})

    def test_options_configmap_carries_every_preset(self) -> None:
        generators = _load(PUNCH_DIR / "kustomization.yaml")["configMapGenerator"]
        options = next(g for g in generators if g["name"] == "punch-k6-options")
        self.assertEqual(
            {Path(f).name for f in options["files"]},
            {p.name for p in PERF_OPTIONS_DIR.glob("*.json")},
        )

    def test_thin_templates_match_their_punch_workflow(self) -> None:
        catalog = load_catalog(PERF_WORKFLOWS_DIR)
        for path in sorted(PERF_WORKFLOWS_DIR.glob("*.yaml")):
            workflow = load_workflow(path)
            with self.subTest(workflow=workflow.name):
                thin = _load(THIN_DIR / path.name)
                self.assertEqual(thin["kind"], "WorkflowTemplate")
                self.assertEqual(thin["metadata"]["name"], workflow.name)
                spec = thin["spec"]
                main = next(t for t in spec["templates"] if t["name"] == spec["entrypoint"])
                [[step]] = main["steps"]
                self.assertEqual(
                    step["templateRef"],
                    {"name": "punch-k6-run", "template": workflow.compose_service},
                )
                requires = workflow.data.requires if workflow.data else ()
                produces = workflow.data.produces if workflow.data else ()
                self.assertEqual(
                    _named(spec["arguments"]["parameters"]),
                    {
                        "config": workflow.k6_config.stem,
                        "produce": "",
                        "base-url": BASE_URLS[workflow.compose_service],
                        "extra-env": "",
                    },
                )
                self.assertEqual(
                    _named(step["arguments"]["parameters"]),
                    {
                        "workflow": workflow.name,
                        "script": workflow.k6_script,
                        "forward": " ".join(
                            name for name in workflow.forward_environment if name != "BASE_URL"
                        ),
                        "requires": " ".join(requires),
                        "requires-hint": " ".join(
                            f"{dataset}={','.join(catalog.producers_of(dataset))}"
                            for dataset in requires
                        ),
                        "produces": " ".join(
                            f"{product.dataset}={','.join(product.columns)}"
                            for product in produces
                        ),
                        **PASSED_THROUGH,
                    },
                )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_k8s_workflows 2>&1 | tail -3`
Expected: FAIL/ERROR — `FileNotFoundError` for `infra/k8s/perf/punch/kustomization.yaml` and an empty `thin` set.

- [ ] **Step 3: Write the platform kustomizations**

`infra/k8s/perf/kustomization.yaml`:

```yaml
# Punch perf platform on minikube: Argo Workflows (namespace argo), SeaweedFS
# as the S3 stand-in (aws-local), and Punch's templates (punch). Apply with
# ./dev k8s:perf:up, or by hand (repeat once if the first pass races the new
# CRDs):
#
#   kubectl kustomize --load-restrictor LoadRestrictionsNone infra/k8s/perf \
#     | kubectl apply --server-side --force-conflicts -f -
#
# Argo CD syncs this directory as the punch-platform Application.
# Operation guide: docs/performance/k8s-runtime.md.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - argo-workflows
  - aws-local
  - punch
```

`infra/k8s/perf/argo-workflows/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: argo
```

`infra/k8s/perf/argo-workflows/kustomization.yaml`:

```yaml
# Argo Workflows v4.1.5 (controller + UI server), cluster-wide. The release
# manifest pins namespace argo itself and ships full CRDs, which need
# server-side apply.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - namespace.yaml
  - https://github.com/argoproj/argo-workflows/releases/download/v4.1.5/install.yaml

patches:
  # Local cluster only: the UI needs no login token.
  - target:
      kind: Deployment
      name: argo-server
    patch: |-
      - op: add
        path: /spec/template/spec/containers/0/args/-
        value: --auth-mode=server
```

`infra/k8s/perf/aws-local/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: aws-local
```

`infra/k8s/perf/aws-local/seaweedfs.yaml`:

```yaml
# S3 stand-in: SeaweedFS `weed mini` (master, volume, filer, and S3 gateway in
# one process), S3 API on :8333. The access key pair comes from
# s3-credentials; S3_BUCKET creates punch-artifacts at startup. Real AWS
# replaces this with an S3 bucket and IRSA.
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: seaweedfs-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 2Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: seaweedfs
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: seaweedfs
  template:
    metadata:
      labels:
        app: seaweedfs
    spec:
      containers:
        - name: seaweedfs
          image: chrislusf/seaweedfs:4.48
          # The image entrypoint adds -dir=/data for `mini`.
          args: [mini]
          env:
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: s3-credentials
                  key: accessKey
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: s3-credentials
                  key: secretKey
            - name: S3_BUCKET
              value: punch-artifacts
          ports:
            - name: s3
              containerPort: 8333
          readinessProbe:
            tcpSocket:
              port: s3
            periodSeconds: 5
          resources:
            requests:
              memory: 128Mi
            limits:
              memory: 512Mi
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: seaweedfs-data
---
apiVersion: v1
kind: Service
metadata:
  name: seaweedfs
spec:
  selector:
    app: seaweedfs
  ports:
    - name: s3
      port: 8333
      targetPort: s3
```

`infra/k8s/perf/aws-local/kustomization.yaml`:

```yaml
# Local AWS stand-ins. The ECR stand-in is the minikube registry addon
# (enabled by ./dev k8s:perf:up), not a manifest here.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: aws-local

resources:
  - namespace.yaml
  - seaweedfs.yaml

# Local-only defaults, mirrored in ../punch for Argo's artifact repository.
# Not real credentials.
secretGenerator:
  - name: s3-credentials
    literals:
      - accessKey=punch
      - secretKey=punch-local-only

generatorOptions:
  disableNameSuffixHash: true
```

`infra/k8s/perf/punch/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: punch
```

`infra/k8s/perf/punch/artifact-repositories.yaml`:

```yaml
# Default artifact repository for namespace punch: datasets/ and runs/ in the
# SeaweedFS bucket. Real AWS: the same shape with endpoint s3.amazonaws.com,
# a real bucket, and useSDKCreds (IRSA) instead of the secret
# (vendor/punch/k8s/examples/artifact-repositories.yaml).
apiVersion: v1
kind: ConfigMap
metadata:
  name: artifact-repositories
  annotations:
    workflows.argoproj.io/default-artifact-repository: seaweedfs
data:
  seaweedfs: |
    s3:
      endpoint: seaweedfs.aws-local.svc.cluster.local:8333
      bucket: punch-artifacts
      insecure: true
      region: us-east-1
      keyFormat: "runs/{{workflow.name}}/{{pod.name}}"
      accessKeySecret:
        name: s3-credentials
        key: accessKey
      secretKeySecret:
        name: s3-credentials
        key: secretKey
```

`infra/k8s/perf/punch/kustomization.yaml`:

```yaml
# Punch's runtime in namespace punch: the generic punch-k6-run template
# (vendor/punch/k8s), one thin template per
# tests/performance/k6/workflows/*.yaml (pinned by
# scripts/pg/tests/test_k8s_workflows.py), the k6 option presets, and the S3
# artifact repository on SeaweedFS.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: punch

resources:
  - namespace.yaml
  - ../../../../vendor/punch/k8s
  - artifact-repositories.yaml
  - workflows/browser-cart.yaml
  - workflows/browser-purchase.yaml
  - workflows/http-auth-login.yaml
  - workflows/http-cart.yaml
  - workflows/http-me-hot-status.yaml
  - workflows/http-orders.yaml
  - workflows/http-orders-status.yaml
  - workflows/http-purchase.yaml
  - workflows/http-purchase-registered.yaml

configurations:
  - ../../../../vendor/punch/k8s/kustomizeconfig.yaml

# ECR stand-in: the minikube registry addon. ./dev k8s:perf:up builds and
# pushes these tags.
# TODO(next-steps/punch-k8s): sha-tagged ECR images from the on-demand GitHub job.
images:
  - name: k6-scenarios
    newName: localhost:5000/mini-commerce/k6
    newTag: local
  - name: k6-scenarios-browser
    newName: localhost:5000/mini-commerce/k6-browser
    newTag: local

configMapGenerator:
  - name: punch-k6-options
    files:
      - ../../../../tests/performance/k6/options/1-iteration.json
      - ../../../../tests/performance/k6/options/1-iteration-browser.json
      - ../../../../tests/performance/k6/options/1-vu-5m.json
      - ../../../../tests/performance/k6/options/5-iterations.json
      - ../../../../tests/performance/k6/options/5-iterations-browser.json
      - ../../../../tests/performance/k6/options/5-vu-5m.json

# Same local-only literals as ../aws-local. Not real credentials.
secretGenerator:
  - name: s3-credentials
    literals:
      - accessKey=punch
      - secretKey=punch-local-only

# punch-k6-run and artifact-repositories reference these by name inside
# custom resources and ConfigMap data, which kustomize does not rewrite.
generatorOptions:
  disableNameSuffixHash: true
```

- [ ] **Step 4: Write the nine thin templates**

Each file begins with the same three-line header comment naming its source YAML. Write exactly:

`infra/k8s/perf/punch/workflows/browser-cart.yaml`:

```yaml
# Punch workflow browser-cart on Kubernetes; mirrors
# tests/performance/k6/workflows/browser-cart.yaml (test_k8s_workflows.py).
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: browser-cart
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations-browser }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://web.mini-commerce.svc.cluster.local:3000" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6-browser }
            arguments:
              parameters:
                - { name: workflow, value: browser-cart }
                - { name: script, value: /scripts/scenarios/browser-cart/browser-cart.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: "" }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: "" }
                - { name: requires-hint, value: "" }
                - { name: produces, value: "carts=cartId,productId,sid" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

`infra/k8s/perf/punch/workflows/browser-purchase.yaml`:

```yaml
# Punch workflow browser-purchase on Kubernetes; mirrors
# tests/performance/k6/workflows/browser-purchase.yaml (test_k8s_workflows.py).
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: browser-purchase
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations-browser }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://web.mini-commerce.svc.cluster.local:3000" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6-browser }
            arguments:
              parameters:
                - { name: workflow, value: browser-purchase }
                - { name: script, value: /scripts/scenarios/browser-purchase/browser-purchase.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: "" }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: "" }
                - { name: requires-hint, value: "" }
                - { name: produces, value: "orders=orderId" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

`infra/k8s/perf/punch/workflows/http-auth-login.yaml`:

```yaml
# Punch workflow http-auth-login on Kubernetes; mirrors
# tests/performance/k6/workflows/http-auth-login.yaml (test_k8s_workflows.py).
# Its optional owned-orders dataset is not wired on k8s (POC): the scenario
# falls back to the seeded demo users.
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: http-auth-login
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://bff.mini-commerce.svc.cluster.local:3001" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6 }
            arguments:
              parameters:
                - { name: workflow, value: http-auth-login }
                - { name: script, value: /scripts/scenarios/http-auth-login/http-auth-login.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: DEMO_PASSWORD }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: "" }
                - { name: requires-hint, value: "" }
                - { name: produces, value: "auth-tokens=username,authToken" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

`infra/k8s/perf/punch/workflows/http-cart.yaml`:

```yaml
# Punch workflow http-cart on Kubernetes; mirrors
# tests/performance/k6/workflows/http-cart.yaml (test_k8s_workflows.py).
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: http-cart
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://bff.mini-commerce.svc.cluster.local:3001" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6 }
            arguments:
              parameters:
                - { name: workflow, value: http-cart }
                - { name: script, value: /scripts/scenarios/http-cart/http-cart.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: "" }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: "" }
                - { name: requires-hint, value: "" }
                - { name: produces, value: "carts=cartId,productId,sid" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

`infra/k8s/perf/punch/workflows/http-me-hot-status.yaml`:

```yaml
# Punch workflow http-me-hot-status on Kubernetes; mirrors
# tests/performance/k6/workflows/http-me-hot-status.yaml (test_k8s_workflows.py).
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: http-me-hot-status
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://bff.mini-commerce.svc.cluster.local:3001" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6 }
            arguments:
              parameters:
                - { name: workflow, value: http-me-hot-status }
                - { name: script, value: /scripts/scenarios/http-me-hot-status/http-me-hot-status.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: "" }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: auth-tokens }
                - { name: requires-hint, value: "auth-tokens=http-auth-login" }
                - { name: produces, value: "" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

`infra/k8s/perf/punch/workflows/http-orders.yaml`:

```yaml
# Punch workflow http-orders on Kubernetes; mirrors
# tests/performance/k6/workflows/http-orders.yaml (test_k8s_workflows.py).
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: http-orders
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://bff.mini-commerce.svc.cluster.local:3001" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6 }
            arguments:
              parameters:
                - { name: workflow, value: http-orders }
                - { name: script, value: /scripts/scenarios/http-orders/http-orders.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: "" }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: carts }
                - { name: requires-hint, value: "carts=browser-cart,http-cart" }
                - { name: produces, value: "orders=orderId" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

`infra/k8s/perf/punch/workflows/http-orders-status.yaml`:

```yaml
# Punch workflow http-orders-status on Kubernetes; mirrors
# tests/performance/k6/workflows/http-orders-status.yaml (test_k8s_workflows.py).
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: http-orders-status
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://bff.mini-commerce.svc.cluster.local:3001" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6 }
            arguments:
              parameters:
                - { name: workflow, value: http-orders-status }
                - { name: script, value: /scripts/scenarios/http-orders-status/http-orders-status.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: "EXPECT_TEMPERATURE ORDER_COOL_DOWN_SECONDS" }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: orders }
                - { name: requires-hint, value: "orders=browser-purchase,http-orders,http-purchase" }
                - { name: produces, value: "" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

`infra/k8s/perf/punch/workflows/http-purchase.yaml`:

```yaml
# Punch workflow http-purchase on Kubernetes; mirrors
# tests/performance/k6/workflows/http-purchase.yaml (test_k8s_workflows.py).
# Also the Argo CD PostSync smoke (infra/argocd/mini-commerce/postsync-smoke.yaml).
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: http-purchase
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://bff.mini-commerce.svc.cluster.local:3001" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6 }
            arguments:
              parameters:
                - { name: workflow, value: http-purchase }
                - { name: script, value: /scripts/scenarios/http-purchase/http-purchase.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: "" }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: "" }
                - { name: requires-hint, value: "" }
                - { name: produces, value: "orders=orderId" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

`infra/k8s/perf/punch/workflows/http-purchase-registered.yaml`:

```yaml
# Punch workflow http-purchase-registered on Kubernetes; mirrors
# tests/performance/k6/workflows/http-purchase-registered.yaml (test_k8s_workflows.py).
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: http-purchase-registered
spec:
  entrypoint: main
  arguments:
    parameters:
      - { name: config, value: 5-iterations }
      - { name: produce, value: "" }
      - { name: base-url, value: "http://bff.mini-commerce.svc.cluster.local:3001" }
      - { name: extra-env, value: "" }
  templates:
    - name: main
      steps:
        - - name: k6
            templateRef: { name: punch-k6-run, template: k6 }
            arguments:
              parameters:
                - { name: workflow, value: http-purchase-registered }
                - { name: script, value: /scripts/scenarios/http-purchase-registered/http-purchase-registered.js }
                - { name: config, value: "{{workflow.parameters.config}}" }
                - { name: base-url, value: "{{workflow.parameters.base-url}}" }
                - { name: forward, value: USERS }
                - { name: extra-env, value: "{{workflow.parameters.extra-env}}" }
                - { name: requires, value: "" }
                - { name: requires-hint, value: "" }
                - { name: produces, value: "owned-orders=orderId,username,email" }
                - { name: produce, value: "{{workflow.parameters.produce}}" }
```

- [ ] **Step 5: Run the parity test**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_k8s_workflows -v 2>&1 | tail -4`
Expected: `Ran 4 tests` … `OK`

- [ ] **Step 6: Render and spot-check**

Run:
```bash
kubectl kustomize --load-restrictor LoadRestrictionsNone infra/k8s/perf > "$SCRATCH/perf-rendered.yaml"
grep -c "^kind: WorkflowTemplate" "$SCRATCH/perf-rendered.yaml"
grep -E "image: localhost:5000/mini-commerce/k6(-browser)?:local" "$SCRATCH/perf-rendered.yaml" | sort -u
.cache/punch-venv/bin/python -c "import sys, yaml; print([d['subjects'] for d in yaml.safe_load_all(open(sys.argv[1])) if d and d['kind'] == 'RoleBinding' and d['metadata']['name'] == 'punch-executor'])" "$SCRATCH/perf-rendered.yaml"
grep -- "--auth-mode=server" "$SCRATCH/perf-rendered.yaml"
```
Expected: `10` (punch-k6-run + nine); both image lines; `[[{'kind': 'ServiceAccount', 'name': 'punch-executor', 'namespace': 'punch'}]]`; one `--auth-mode=server` line.

- [ ] **Step 7: Run the whole pg suite and lint, then commit**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3 && cd .. && .cache/punch-venv/bin/python -m ruff check scripts/pg`
Expected: `OK`; `All checks passed!`

```bash
git add infra/k8s/perf scripts/pg/tests/test_k8s_workflows.py
git commit -m "feat(k8s): add the Punch perf platform manifests and thin workflow templates"
```

---

### Task 7: `./dev k8s:perf:up`

**Files:**
- Create: `scripts/pg/k8s_perf.py`
- Modify: `scripts/pg/cli.py`, `package.json`, `Taskfile.yml`
- Test: `scripts/pg/tests/test_k8s_perf.py`

**Interfaces:**
- Consumes: Task 1 helpers (`k8s.require_tools`, `k8s.cluster_running`, `k8s.cluster_docker_env`, `k8s.build_cmd`, `k8s.render`, `k8s.apply_server_side`, `k8s.wait_rollouts`, `k8s.kubectl`, `k8s.Image`, `k8s.PROFILE`); Task 6 manifests.
- Produces (used by Task 8): module `pg.k8s_perf` with `PERF_DIR`, `NAMESPACE = "punch"`, `REGISTRY`, `BUCKET`, `PERF_IMAGES`, `punch(*args) -> List[str]` (kubectl pinned to namespace punch), `up(args) -> int`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/pg/tests/test_k8s_perf.py`:

```python
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_k8s_perf 2>&1 | tail -3`
Expected: ERROR — `ImportError: cannot import name 'k8s_perf' from 'pg'`.

- [ ] **Step 3: Write `scripts/pg/k8s_perf.py`**

```python
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
```

- [ ] **Step 4: Register the command and aliases**

In `scripts/pg/cli.py`, add after `_k8s_down`:

```python
def _k8s_perf_up(args: Sequence[str]) -> int:
    from pg import k8s_perf
    return k8s_perf.up(args)
```

and in `COMMANDS`, after `"k8s:down": _k8s_down,` add `"k8s:perf:up": _k8s_perf_up,`.

In `package.json` `scripts`, after `"pg:k8s:down": "./dev k8s:down",` add:

```json
    "pg:k8s:perf:up": "./dev k8s:perf:up",
```

In `Taskfile.yml`, after the `k8s:down` task add:

```yaml
  k8s:perf:up:
    desc: Deploy the Punch perf platform (Argo Workflows, SeaweedFS, registry, k6 images)
    cmds:
      - pnpm pg:k8s:perf:up {{.CLI_ARGS}}
```

- [ ] **Step 5: Run the tests and lint**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_k8s_perf pg.tests.test_k6runner -v 2>&1 | tail -3 && cd .. && .cache/punch-venv/bin/python -m ruff check scripts/pg`
Expected: `OK`; `All checks passed!` (test_k6runner's `cli` import-without-yaml test still passes).

- [ ] **Step 6: Deploy for real**

Run: `./dev k8s:perf:up`
Expected: both images built and pushed; `Perf platform applied`; three rollouts succeed; `kubectl get workflowtemplates` lists `punch-k6-run` and the nine workflow ids; ends `Punch is ready on Kubernetes`.

Run: `minikube -p mini-commerce ssh -- free -m`
Expected: `used` well under the `total` of the `Mem:` row (record both in the task report).

- [ ] **Step 7: Commit**

```bash
git add scripts/pg/k8s_perf.py scripts/pg/cli.py scripts/pg/tests/test_k8s_perf.py package.json Taskfile.yml
git commit -m "feat(k8s): add ./dev k8s:perf:up for the Punch perf platform"
```

---

### Task 8: `./dev perf:<id> --runtime k8s`

**Files:**
- Modify: `scripts/pg/k8s_perf.py`, `scripts/pg/perf.py`, `scripts/pg/cli.py` (usage line)
- Test: `scripts/pg/tests/test_k8s_perf.py`

**Interfaces:**
- Consumes: Task 7 module; Punch `load_workflow`, `validate_produce(workflow, produce) -> tuple[str, ...]` (raises `ValueError`).
- Produces: `perf.split_runtime(args) -> Tuple[str, List[str]]`; `k8s_perf.run_workflow(name, args) -> int`; pure helpers `parse_run_args`, `resolve_preset(value) -> Optional[str]`, `extra_env(forward, environ) -> List[str]`, `workflow_manifest(name, *, config, produce, env_pairs, base_url) -> Dict`, `run_result(workflow) -> RunResult`, `main_pod(pods) -> Optional[str]`, `RunResult(phase, message, datasets).passed`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/pg/tests/test_k8s_perf.py` (before the `if __name__` block) and add `from pg import perf` to the imports (`from pg import cli, k8s, k8s_perf, perf  # noqa: E402`):

```python
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

    @mock.patch("pg.k8s_perf.run_workflow", return_value=0)
    def test_perf_run_routes_k8s_to_argo(self, run_workflow) -> None:
        self.assertEqual(perf.run("http-cart", ["--runtime", "k8s", "--produce", "carts"]), 0)
        run_workflow.assert_called_once_with("http-cart", ["--produce", "carts"])


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

    def test_main_pod_waits_for_the_main_container_to_start(self) -> None:
        waiting = {"items": [{"metadata": {"name": "p"}, "status": {"containerStatuses": [
            {"name": "main", "state": {"waiting": {"reason": "ImagePullBackOff"}}}]}}]}
        running = {"items": [{"metadata": {"name": "p"}, "status": {"containerStatuses": [
            {"name": "wait", "state": {"running": {}}},
            {"name": "main", "state": {"running": {}}}]}}]}
        self.assertIsNone(k8s_perf.main_pod(waiting))
        self.assertEqual(k8s_perf.main_pod(running), "p")


class RunWorkflowGuardTests(unittest.TestCase):
    @mock.patch("pg.k8s_perf.fail")
    @mock.patch("pg.k8s_perf.subprocess.run")
    def test_path_config_fails_before_kubectl(self, run, fail) -> None:
        code = k8s_perf.run_workflow(
            "http-purchase", ["--config", "tests/performance/k6/options/1-iteration.json"]
        )
        self.assertEqual(code, 1)
        run.assert_not_called()
        self.assertIn("preset name", fail.call_args.args[0])

    @mock.patch("pg.k8s_perf.fail")
    @mock.patch("pg.k8s_perf.subprocess.run")
    def test_undeclared_produce_fails_before_kubectl(self, run, _fail) -> None:
        self.assertEqual(k8s_perf.run_workflow("http-orders-status", ["--produce", "orders"]), 1)
        run.assert_not_called()
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_k8s_perf 2>&1 | tail -3`
Expected: ERROR — `AttributeError: module 'pg.perf' has no attribute 'split_runtime'` (and missing `k8s_perf` helpers).

- [ ] **Step 3: Add the runtime split to `scripts/pg/perf.py`**

Replace the imports and `run` function:

```python
import shutil
from typing import List, Sequence, Tuple

from pg.ansi import dim, fail, header, info, pass_, warn
from pg.k6runner import run_k6
from pg.paths import PERF_REPORTS_DIR
from pg.workflows import WORKFLOWS

RUNTIMES = ("compose", "k8s")


def split_runtime(args: Sequence[str]) -> Tuple[str, List[str]]:
    """Pull `--runtime <compose|k8s>` out of a perf command's arguments."""
    runtime = "compose"
    rest: List[str] = []
    items = list(args)
    while items:
        arg = items.pop(0)
        if arg == "--runtime" and items:
            runtime = items.pop(0)
        elif arg.startswith("--runtime="):
            runtime = arg.split("=", 1)[1]
        else:
            rest.append(arg)
    if runtime not in RUNTIMES:
        raise ValueError(f"unknown runtime '{runtime}' (use: {', '.join(RUNTIMES)})")
    return runtime, rest


def run(name: str, args: Sequence[str]) -> int:
    try:
        runtime, rest = split_runtime(args)
    except ValueError as error:
        fail(str(error))
        return 1
    if runtime == "k8s":
        from pg import k8s_perf
        return k8s_perf.run_workflow(name, rest)
    return run_k6(name, rest, default_port=WORKFLOWS[name])
```

Also update the module docstring's last sentence to: "`--runtime k8s` runs the same workflow on Argo Workflows instead (pg.k8s_perf)."

- [ ] **Step 4: Add the run path to `scripts/pg/k8s_perf.py`**

Replace the import block with:

```python
import argparse
import json
import os
import subprocess
import time
from dataclasses import dataclass
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

from pg import k8s
from pg.ansi import bold, fail, header, info, pass_, warn
from pg.paths import K8S_DIR, PERF_OPTIONS_DIR, PERF_WORKFLOWS_DIR, REPO_ROOT
```

Update the module docstring's first line to `"""k8s:perf:up and `perf:<id> --runtime k8s` — Punch on Argo Workflows.` and its body sentence to "...apply the platform, and run one workflow by id."

Add after `ROLLOUTS`:

```python
FINISHED: Tuple[str, ...] = ("Succeeded", "Failed", "Error")
RUN_TIMEOUT_S = 1200  # the template's 900 s deadline plus scheduling slack
POLL_S = 2
STOP_PATCH = '{"spec":{"shutdown":"Stop"}}'
```

Append at the end of the module:

```python
def parse_run_args(name: str, args: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=f"./dev perf:{name} --runtime k8s")
    parser.add_argument(
        "--config", default=None, metavar="PRESET",
        help="k6 options preset from tests/performance/k6/options/ (default: the workflow's).",
    )
    parser.add_argument(
        "--produce", action="append", default=[], metavar="DATASET",
        help=f"Publish a declared dataset to s3://{BUCKET}/datasets/ (repeatable, or 'all').",
    )
    parser.add_argument(
        "--base-url", default=None, metavar="URL",
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

    @property
    def passed(self) -> bool:
        return self.phase == "Succeeded"


def run_result(workflow: Mapping) -> RunResult:
    status = workflow.get("status", {})
    datasets = set()
    for node in status.get("nodes", {}).values():
        for parameter in node.get("outputs", {}).get("parameters", []):
            if parameter.get("name") == "datasets":
                datasets.update(parameter.get("value", "").split())
    return RunResult(status.get("phase", "Unknown"), status.get("message", ""), tuple(sorted(datasets)))


def main_pod(pods: Mapping) -> Optional[str]:
    """The workflow pod whose `main` container has started."""
    for pod in pods.get("items", []):
        for container in pod.get("status", {}).get("containerStatuses", []):
            state = container.get("state", {})
            if container.get("name") == "main" and ("running" in state or "terminated" in state):
                return pod["metadata"]["name"]
    return None


def _phase(run: str) -> str:
    out = subprocess.run(punch("get", "workflow", run, "-o", "jsonpath={.status.phase}"),
                         capture_output=True, text=True, check=False)
    return out.stdout.strip()


def _follow(name: str, run: str) -> int:
    deadline = time.monotonic() + RUN_TIMEOUT_S
    pod: Optional[str] = None
    while pod is None and time.monotonic() < deadline and _phase(run) not in FINISHED:
        listing = subprocess.run(
            punch("get", "pods", "-l", f"workflows.argoproj.io/workflow={run}", "-o", "json"),
            capture_output=True, text=True, check=False,
        )
        if listing.returncode == 0:
            pod = main_pod(json.loads(listing.stdout))
        if pod is None:
            time.sleep(POLL_S)
    if pod is not None:
        subprocess.run(punch("logs", "-f", pod, "-c", "main"), check=False)
    while time.monotonic() < deadline and _phase(run) not in FINISHED:
        time.sleep(POLL_S)

    fetched = subprocess.run(punch("get", "workflow", run, "-o", "json"),
                             capture_output=True, text=True, check=False)
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
        info(f"Evidence: s3://{BUCKET}/runs/{run}/ and kubectl -n {NAMESPACE} get workflow {run} -o yaml")
        print()
        return 0
    detail = f" — {result.message}" if result.message else ""
    fail(f"k6 {name} failed on k8s ({run}): {result.phase}{detail}")
    info(f"Inspect: kubectl --context {k8s.PROFILE} -n {NAMESPACE} get workflow {run} -o yaml")
    print()
    return 1


def run_workflow(name: str, args: Sequence[str]) -> int:
    """Run one repository workflow on Argo Workflows and follow it."""
    parsed = parse_run_args(name, args)
    try:
        # Punch's loader is the perf-only dependency; import it lazily.
        from punch.execution import validate_produce
        from punch.workflow import load_workflow

        workflow = load_workflow(PERF_WORKFLOWS_DIR / f"{name}.yaml")
        produce = validate_produce(workflow, parsed.produce)
        config = resolve_preset(parsed.config)
        env_pairs = extra_env(workflow.forward_environment, os.environ)
    except ValueError as error:
        fail(f"Could not prepare k8s workflow {name}: {error}")
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
        input=json.dumps(manifest), capture_output=True, text=True, check=False,
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
        subprocess.run(punch("patch", "workflow", run, "--type", "merge", "-p", STOP_PATCH),
                       capture_output=True, check=False)
        print()
        warn(f"Stopped {run} (spec.shutdown=Stop).")
        return 130
```

Note: `validate_produce` raises `ValueError`; Punch's `WorkflowError` subclasses `ValueError`, so one `except` covers both.

- [ ] **Step 5: Mention the runtime in `./dev --help`**

In `scripts/pg/cli.py` `_usage()`, after the line printing `perf:* take their k6 load shape ...`, add:

```python
    print("perf:* --runtime k8s runs the workflow on Argo Workflows (after ./dev k8s:perf:up).")
```

- [ ] **Step 6: Run the tests and lint**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3 && cd .. && .cache/punch-venv/bin/python -m ruff check scripts/pg`
Expected: `OK`; `All checks passed!`

- [ ] **Step 7: Smoke-run on the cluster**

Run: `./dev perf:http-purchase --runtime k8s --config 1-iteration`
Expected: streams k6 output; ends with `k6 http-purchase completed on k8s (http-purchase-xxxxx).`; exit code 0 (`echo $?` → `0`).

- [ ] **Step 8: Commit**

```bash
git add scripts/pg/k8s_perf.py scripts/pg/perf.py scripts/pg/cli.py scripts/pg/tests/test_k8s_perf.py
git commit -m "feat(k8s): run Punch workflows on Argo Workflows with --runtime k8s"
```

---

### Task 9: Live acceptance on Kubernetes (data chain, preflight, atomicity)

No code unless a check fails; a failure is fixed in the owning task's files with a regression test first, then this task re-runs. Record every command's tail output in `<scratchpad>/evidence-k8s.md` for the PR description.

**Files:** none (evidence only).

**Interfaces:** Consumes Tasks 6–8 on the live cluster.

- [ ] **Step 1: Define the S3 inspection helper for this shell**

```bash
s3() { kubectl --context mini-commerce -n aws-local run "s3-$RANDOM" --rm -i --restart=Never --quiet \
  --image=amazon/aws-cli:2.37.13 \
  --env=AWS_ACCESS_KEY_ID=punch --env=AWS_SECRET_ACCESS_KEY=punch-local-only --env=AWS_DEFAULT_REGION=us-east-1 \
  -- --endpoint-url http://seaweedfs:8333 "$@"; }
s3 s3 rm s3://punch-artifacts/datasets/ --recursive
```

Expected: no error (datasets start empty).

- [ ] **Step 2: Smoke evidence in S3**

Run: `./dev perf:http-purchase --runtime k8s --config 1-iteration; s3 s3 ls s3://punch-artifacts/runs/ --recursive | grep http-purchase`
Expected: run passes; listing shows `.../reports/http-purchase-summary.json`, `.../reports/http-purchase-report.html`, and `.../main.log`.

- [ ] **Step 3: Preflight failure names the producers**

Run: `./dev perf:http-orders --runtime k8s; echo "exit=$?"`
Expected: log contains `http-orders requires "carts"; produce it with: browser-cart, http-cart (--produce carts)`; `k6 http-orders failed on k8s`; `exit=1`.

- [ ] **Step 4: The data chain**

```bash
./dev perf:http-cart --runtime k8s --produce carts
./dev perf:http-orders --runtime k8s --produce orders
./dev perf:http-orders-status --runtime k8s
s3 s3 ls s3://punch-artifacts/datasets/
```

Expected: `Published 5 carts rows ...`; `Published 5 orders rows ...`; `k6 http-orders-status completed on k8s`; listing shows `carts.csv` and `orders.csv`.

- [ ] **Step 5: Atomicity — a failed producer leaves the previous dataset untouched**

```bash
s3 s3api head-object --bucket punch-artifacts --key datasets/carts.csv --query ETag --output text
./dev perf:http-cart --runtime k8s --produce carts --base-url http://nowhere.invalid:3001; echo "exit=$?"
s3 s3api head-object --bucket punch-artifacts --key datasets/carts.csv --query ETag --output text
```

Expected: `exit=1`; both ETags identical.

- [ ] **Step 6: Compose regression**

Run: `./dev k8s:down && ./dev up && ./dev perf:http-purchase --config 1-iteration; echo "exit=$?"; ./dev down && ./dev k8s:up --no-build && ./dev k8s:perf:up`
Expected: compose run passes (`exit=0`); the cluster comes back with the perf platform (`k8s:perf:up` re-pushes the images in case the registry addon lost them; the node's build cache keeps it fast).

---

### Task 10: CI `k8s-manifests` job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:** Consumes all kustomizations from Tasks 6 and 11. (Task 11 adds `infra/argocd/install*`; this job is written to cover them and is re-run in Task 11, Step 8.)

- [ ] **Step 1: Validate locally first (perf + app)**

```bash
for dir in infra/k8s infra/k8s/perf; do
  kubectl kustomize --load-restrictor LoadRestrictionsNone "$dir" > "$SCRATCH/rendered.yaml"
  docker run --rm -v "$SCRATCH/rendered.yaml:/rendered.yaml:ro" ghcr.io/yannh/kubeconform:v0.8.0 \
    -summary -strict -schema-location default \
    -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
    /rendered.yaml
done
```

Expected: each prints `Summary: N resources found in 1 file - Valid: N, Invalid: 0, Errors: 0, Skipped: 0`. If a resource is Invalid, fix the manifest (not the validator flags) and re-run.

- [ ] **Step 2: Add the job to `.github/workflows/ci.yml`**

Insert after the `lint-docker` job:

```yaml
  k8s-manifests:
    name: Kubernetes manifests (kustomize + kubeconform)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - name: Install kubeconform
        run: |
          mkdir -p "$RUNNER_TEMP/bin"
          curl -sSL https://github.com/yannh/kubeconform/releases/download/v0.8.0/kubeconform-linux-amd64.tar.gz \
            | tar -xz -C "$RUNNER_TEMP/bin" kubeconform
          echo "$RUNNER_TEMP/bin" >> "$GITHUB_PATH"
      - name: Render and validate
        # Argo CRD schemas come from the datree CRDs catalog. The perf and
        # Argo CD kustomizations fetch pinned upstream installs over HTTPS.
        run: |
          schemas=(-schema-location default -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json')
          for dir in infra/k8s infra/k8s/perf infra/argocd/mini-commerce infra/argocd/install; do
            echo "::group::$dir"
            kubectl kustomize --load-restrictor LoadRestrictionsNone "$dir" > "$RUNNER_TEMP/rendered.yaml"
            kubeconform -summary -strict "${schemas[@]}" "$RUNNER_TEMP/rendered.yaml"
            echo "::endgroup::"
          done
          kubeconform -summary -strict "${schemas[@]}" infra/argocd/applications/
```

- [ ] **Step 3: Check the YAML parses**

Run: `.cache/punch-venv/bin/python -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs']))"`
Expected: list includes `k8s-manifests`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: validate the Kubernetes manifests with kustomize and kubeconform"
```

---

### Task 11: Argo CD manifests, PostSync smoke, `./dev argocd:up`

**Files:**
- Create: `infra/argocd/install/kustomization.yaml`, `infra/argocd/install/namespace.yaml`, `infra/argocd/install/argocd-cm.yaml`
- Create: `infra/argocd/applications/punch-platform.yaml`, `infra/argocd/applications/mini-commerce.yaml`
- Create: `infra/argocd/mini-commerce/kustomization.yaml`, `infra/argocd/mini-commerce/postsync-smoke.yaml`
- Create: `scripts/pg/argocd.py`
- Modify: `scripts/pg/cli.py`, `package.json`, `Taskfile.yml`
- Test: `scripts/pg/tests/test_argocd.py`

**Interfaces:**
- Consumes: Task 1 helpers; thin template `http-purchase` and preset `1-iteration`.
- Produces: `argocd.APPLICATIONS = ("punch-platform", "mini-commerce")`, `argocd.with_revision(text, revision) -> str`, `argocd.app_settled(app) -> Optional[bool]`, `argocd.parse_args(args) -> Optional[str]`, `argocd.up(args) -> int`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/pg/tests/test_argocd.py`:

```python
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_argocd 2>&1 | tail -3`
Expected: ERROR — `ImportError: cannot import name 'argocd' from 'pg'`.

- [ ] **Step 3: Write the Argo CD install kustomization**

`infra/argocd/install/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: argocd
```

`infra/argocd/install/argocd-cm.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
data:
  # infra/k8s and infra/k8s/perf read files outside their directory
  # (otel config, k6 option presets, vendor/punch/k8s).
  kustomize.buildOptions: --load-restrictor LoadRestrictionsNone
```

`infra/argocd/install/kustomization.yaml`:

```yaml
# Argo CD for the local minikube cluster: pinned v3.5.5, non-HA. dex,
# notifications, and the ApplicationSet controller are scaled to 0 to save
# memory. The Applications in ../applications/ are applied separately, in
# order, by ./dev argocd:up (manual steps: docs/performance/k8s-runtime.md).
# Apply server-side — Argo CD's CRDs exceed the client-side annotation limit:
#
#   kubectl kustomize --load-restrictor LoadRestrictionsNone infra/argocd/install \
#     | kubectl apply --server-side --force-conflicts -f -
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: argocd

resources:
  - namespace.yaml
  - https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.5/manifests/install.yaml

patches:
  - path: argocd-cm.yaml
  - target:
      kind: Deployment
      name: argocd-dex-server
    patch: |-
      - op: add
        path: /spec/replicas
        value: 0
  - target:
      kind: Deployment
      name: argocd-notifications-controller
    patch: |-
      - op: add
        path: /spec/replicas
        value: 0
  - target:
      kind: Deployment
      name: argocd-applicationset-controller
    patch: |-
      - op: add
        path: /spec/replicas
        value: 0
```

- [ ] **Step 4: Write the Applications and the app overlay**

`infra/argocd/applications/punch-platform.yaml`:

```yaml
# Argo Workflows, SeaweedFS (S3 stand-in), and Punch's templates
# (infra/k8s/perf). Created first: the mini-commerce Application's PostSync
# smoke needs these templates. ./dev argocd:up --revision <branch> rewrites
# targetRevision before applying.
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: punch-platform
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/nicopizar00/expresso-engineering-playground.git
    targetRevision: main
    path: infra/k8s/perf
  destination:
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      prune: false
      selfHeal: false
    syncOptions:
      - ServerSideApply=true
      - SkipDryRunOnMissingResource=true
```

`infra/argocd/applications/mini-commerce.yaml`:

```yaml
# The app (infra/k8s via the infra/argocd/mini-commerce overlay) plus its PostSync
# smoke. selfHeal stays off so ./dev k8s:up's rollout restarts do not fight
# Argo CD. ./dev argocd:up --revision <branch> rewrites targetRevision.
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mini-commerce
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/nicopizar00/expresso-engineering-playground.git
    targetRevision: main
    path: infra/argocd/mini-commerce
  destination:
    server: https://kubernetes.default.svc
    namespace: mini-commerce
  syncPolicy:
    automated:
      prune: false
      selfHeal: false
    syncOptions:
      - ServerSideApply=true
      - SkipDryRunOnMissingResource=true
```

`infra/argocd/mini-commerce/kustomization.yaml`:

```yaml
# Argo CD source for the app: infra/k8s plus a PostSync smoke run of the
# http-purchase Punch workflow (namespace punch). ./dev k8s:up keeps applying
# infra/k8s directly; this overlay exists only for Argo CD. It lives outside
# infra/k8s because kustomize rejects an overlay that includes its own parent
# directory (cycle).
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../k8s
  - postsync-smoke.yaml
```

`infra/argocd/mini-commerce/postsync-smoke.yaml`:

```yaml
# Runs after a sync of the mini-commerce Application once all its resources
# are Healthy. Argo CD's built-in Workflow health check fails the sync when
# the smoke fails. BeforeHookCreation removes the previous run only when the
# next sync starts, so the last result stays inspectable.
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  name: postsync-smoke
  namespace: punch
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
spec:
  workflowTemplateRef:
    name: http-purchase
  arguments:
    parameters:
      - name: config
        value: 1-iteration
```

- [ ] **Step 5: Write `scripts/pg/argocd.py`**

```python
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
```

- [ ] **Step 6: Register the command and aliases**

In `scripts/pg/cli.py`, add after `_k8s_perf_up`:

```python
def _argocd_up(args: Sequence[str]) -> int:
    from pg import argocd
    return argocd.up(args)
```

and in `COMMANDS`, after `"k8s:perf:up": _k8s_perf_up,` add `"argocd:up": _argocd_up,`.

In `package.json`, after the `pg:k8s:perf:up` line add `"pg:argocd:up": "./dev argocd:up",`.

In `Taskfile.yml`, after the `k8s:perf:up` task add:

```yaml
  argocd:up:
    desc: Install Argo CD and sync the perf platform + app from GitHub (--revision <branch>)
    cmds:
      - pnpm pg:argocd:up {{.CLI_ARGS}}
```

- [ ] **Step 7: Run the tests and lint**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3 && cd .. && .cache/punch-venv/bin/python -m ruff check scripts/pg`
Expected: `OK`; `All checks passed!`

- [ ] **Step 8: Validate the new manifests like CI does**

```bash
for dir in infra/argocd/mini-commerce infra/argocd/install; do
  kubectl kustomize --load-restrictor LoadRestrictionsNone "$dir" > "$SCRATCH/rendered.yaml"
  docker run --rm -v "$SCRATCH/rendered.yaml:/rendered.yaml:ro" ghcr.io/yannh/kubeconform:v0.8.0 \
    -summary -strict -schema-location default \
    -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
    /rendered.yaml
done
docker run --rm -v "$PWD/infra/argocd/applications:/apps:ro" ghcr.io/yannh/kubeconform:v0.8.0 \
  -summary -strict -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' /apps
kubectl kustomize --load-restrictor LoadRestrictionsNone infra/argocd/install | grep -A2 "kustomize.buildOptions"
```

Expected: every summary `Invalid: 0, Errors: 0`; the last command shows `kustomize.buildOptions: --load-restrictor LoadRestrictionsNone`.

- [ ] **Step 9: Commit**

```bash
git add infra/argocd scripts/pg/argocd.py scripts/pg/cli.py \
  scripts/pg/tests/test_argocd.py package.json Taskfile.yml
git commit -m "feat(k8s): sync the perf platform and app with Argo CD and a PostSync smoke"
```

---

### Task 12: Argo CD live acceptance

**Files:** none unless a check fails (fix in Task 11's files with a test first).

**Interfaces:** Consumes Task 11 on the live cluster and the pushed branch.

- [ ] **Step 1: Pre-push checks, then ask before pushing**

```bash
git log origin/main..HEAD --oneline -- vendor/punch
git -C vendor/punch branch -r --contains "$(git ls-tree HEAD vendor/punch | awk '{print $3}')"
```

Expected: the pointer commit is listed; the second command prints `origin/main`.

Ask the user: "Argo CD pulls from GitHub. OK to push branch `feat/punch-k8s-native` to origin?" Only on an explicit yes: `git push -u origin feat/punch-k8s-native`.

- [ ] **Step 2: Install and sync**

Run: `./dev argocd:up --revision feat/punch-k8s-native`
Expected: `Argo CD is running`; `punch-platform: synced and healthy`; `mini-commerce: synced and healthy`; final `the PostSync smoke passed`.

Run: `kubectl --context mini-commerce -n punch get workflow postsync-smoke -o jsonpath='{.status.phase}'`
Expected: `Succeeded`

- [ ] **Step 3: A failing smoke fails the sync**

```bash
kubectl --context mini-commerce -n punch delete workflowtemplate http-purchase
kubectl --context mini-commerce -n argocd patch application mini-commerce --type merge \
  -p '{"operation":{"initiatedBy":{"username":"acceptance"},"sync":{"revision":"feat/punch-k8s-native"}}}'
sleep 60
kubectl --context mini-commerce -n argocd get application mini-commerce \
  -o jsonpath='{.status.operationState.phase}{"\n"}{.status.operationState.message}{"\n"}'
```

Expected: phase `Failed` (or `Running` — then re-run the last command until it settles; it must end `Failed`); message mentions `postsync-smoke`.

- [ ] **Step 4: Recover**

```bash
for app in punch-platform mini-commerce; do
  kubectl --context mini-commerce -n argocd patch application "$app" --type merge \
    -p '{"operation":{"initiatedBy":{"username":"acceptance"},"sync":{"revision":"feat/punch-k8s-native"}}}'
  sleep 90
  kubectl --context mini-commerce -n argocd get application "$app" \
    -o jsonpath='{.metadata.name}{" "}{.status.operationState.phase}{" "}{.status.health.status}{"\n"}'
done
```

Expected: `punch-platform Succeeded Healthy` then `mini-commerce Succeeded Healthy`. Record Steps 2–4 output in the evidence file.

- [ ] **Step 5: Memory headroom with everything running**

Run: `minikube -p mini-commerce ssh -- free -m`
Expected: `available` on the `Mem:` row above ~10% of `total`. Record it; if lower, report to the user before continuing.

---

### Task 13: Documentation

**Files:**
- Create: `docs/performance/k8s-runtime.md`, `docs/next-steps/punch-k8s.md`
- Modify: `docs/performance/orchestrator.md`, `docs/architecture/punch-implementation.md`, `infra/k8s/README.md`, `docs/cli-reference.md`, `CLAUDE.md`, `docs/next-steps/README.md`

**Interfaces:** Documents Tasks 1–12. The `TODO(next-steps/punch-k8s)` anchor from Task 6 points at the new next-steps file.

- [ ] **Step 1: Write `docs/performance/k8s-runtime.md`**

````markdown
# Punch on Kubernetes

Punch workflows also run natively on Kubernetes: Argo Workflows executes
them, S3 holds datasets and evidence, an OCI registry holds the k6 images,
and Argo CD syncs everything from git. No Python and no Punch image run in
the cluster. The compose runtime (`./dev perf:<id>`) is unchanged and stays
the default. Design: [spec](../superpowers/specs/2026-10-13-punch-k8s-native-design.md);
Punch's contract: [`vendor/punch/k8s/README.md`](../../vendor/punch/k8s/README.md).

## What runs where

| Namespace | Holds |
| --- | --- |
| `mini-commerce` | The app (`infra/k8s`) |
| `argo` | Argo Workflows v4.1.5 controller + UI (`--auth-mode=server`) |
| `punch` | `punch-k6-run`, nine thin templates (`infra/k8s/perf/punch/workflows/`), runs, presets, artifact repository |
| `aws-local` | SeaweedFS 4.48 — S3 stand-in, bucket `punch-artifacts` |
| `kube-system` | minikube `registry` addon — ECR stand-in at `localhost:5000` |
| `argocd` | Argo CD v3.5.5 |

## Prerequisites

- Docker Desktop with at least 6 GB of memory; the `mini-commerce` minikube
  profile at 4.5 GB (`./dev k8s:up` warns when an older, smaller profile is
  running; recreate it with `minikube delete -p mini-commerce`, which deletes
  its Postgres data and images).
- `kubectl`, `minikube`. The `argo` CLI is optional.

## Quick start

```bash
./dev k8s:up                                   # app on minikube
./dev k8s:perf:up                              # registry + k6 images, Argo Workflows, SeaweedFS, templates
./dev perf:http-purchase --runtime k8s --config 1-iteration
./dev perf:http-cart --runtime k8s --produce carts
./dev perf:http-orders --runtime k8s --produce orders
./dev perf:http-orders-status --runtime k8s
```

`--runtime k8s` accepts `--config <preset>` (names from
`tests/performance/k6/options/`, not paths), `--produce <dataset>` (repeatable
or `all`), and `--base-url <in-cluster URL>`. Forwarded names set in your
shell (e.g. `EXPECT_TEMPERATURE=hot`) are passed through as on compose;
values cannot contain spaces. `--data`, `--size-for`, prompts, and the menu
are compose-only. Ctrl+C stops the run (`spec.shutdown: Stop`).

## Without `./dev` (kubectl only)

```bash
kubectl --context mini-commerce kustomize --load-restrictor LoadRestrictionsNone infra/k8s/perf \
  | kubectl --context mini-commerce apply --server-side --force-conflicts -f -
# Repeat once if the first pass reports "no matches for kind WorkflowTemplate".

kubectl --context mini-commerce -n punch create -f - <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata: { generateName: http-cart- }
spec:
  workflowTemplateRef: { name: http-cart }
  arguments: { parameters: [ { name: produce, value: carts } ] }
EOF
kubectl --context mini-commerce -n punch get workflows
kubectl --context mini-commerce -n punch logs -f -l workflows.argoproj.io/workflow=<run> -c main
kubectl --context mini-commerce -n punch get workflow <run> -o jsonpath='{.status.phase}'
# or: argo -n punch submit --from workflowtemplate/http-cart -p produce=carts --wait --log
```

The images must exist first: build `infra/docker/k6.Dockerfile` and
`k6-browser.Dockerfile` with `eval "$(minikube -p mini-commerce docker-env)"`,
tag them `localhost:5000/mini-commerce/k6:local` /
`localhost:5000/mini-commerce/k6-browser:local`, and `docker push` (after
`minikube -p mini-commerce addons enable registry`).

## Datasets and evidence

```text
s3://punch-artifacts/
  datasets/<dataset>.csv   published by --produce; read by the next run's preflight
  runs/<run>/              archived pod logs and reports/ (summary JSON + HTML)
```

The k8s dataset store is separate from the host files in
`tests/performance/k6/data/`. A run's evidence is the Workflow itself — its
phase, node messages and exit codes, and the `datasets` output parameter
(`orders=5`) — plus the archived logs and reports. Browse the bucket:

```bash
kubectl --context mini-commerce -n aws-local run s3-ls --rm -i --restart=Never --quiet \
  --image=amazon/aws-cli:2.37.13 \
  --env=AWS_ACCESS_KEY_ID=punch --env=AWS_SECRET_ACCESS_KEY=punch-local-only --env=AWS_DEFAULT_REGION=us-east-1 \
  -- --endpoint-url http://seaweedfs:8333 s3 ls s3://punch-artifacts --recursive
```

Argo UI: `kubectl --context mini-commerce -n argo port-forward svc/argo-server 2746:2746`,
then https://localhost:2746.

## Argo CD

```bash
./dev k8s:perf:up                                  # images must be in the registry
./dev argocd:up --revision feat/my-branch          # branch must be pushed to GitHub
```

`argocd:up` installs Argo CD (`infra/argocd/install`), then creates the
`punch-platform` Application (`infra/k8s/perf`), waits until it is synced and
healthy, then creates `mini-commerce` (`infra/argocd/mini-commerce`: the app plus a
PostSync `http-purchase` smoke at `1-iteration`). A failed smoke fails the
sync. Sync policy is automated without self-heal or prune, so `./dev k8s:up`
rollout restarts do not fight Argo CD.

Manual equivalent: apply the rendered `infra/argocd/install` server-side, then
`kubectl apply -f` each file in `infra/argocd/applications/` (edit
`targetRevision` first). Re-sync an app without the `argocd` CLI:

```bash
kubectl --context mini-commerce -n argocd patch application mini-commerce --type merge \
  -p '{"operation":{"initiatedBy":{"username":"me"},"sync":{"revision":"<branch>"}}}'
```

UI: `kubectl --context mini-commerce -n argocd port-forward svc/argocd-server 8080:443`;
password: `kubectl --context mini-commerce -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d`.

## Porting to AWS

| Local | AWS |
| --- | --- |
| `localhost:5000/mini-commerce/k6:local` | `<acct>.dkr.ecr.<region>.amazonaws.com/mini-commerce/k6:<sha>` via `kustomize edit set image k6-scenarios=...` |
| SeaweedFS + `s3-credentials` | S3 bucket + IRSA; `artifact-repositories` shaped like `vendor/punch/k8s/examples/artifact-repositories.yaml` |
| minikube | EKS; Argo CD or a GitHub job applies the same kustomizations |

The on-demand GitHub job is the next step: [`../next-steps/punch-k8s.md`](../next-steps/punch-k8s.md).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `no matches for kind "WorkflowTemplate"` on apply | CRDs were still registering; apply again (`k8s:perf:up` does this). |
| Run `Failed` after ~15 min, pod `ImagePullBackOff` | Images not in the registry: `./dev k8s:perf:up` (without `--no-build`). |
| `requires "carts"; produce it with: ...` | Run the named producer with `--produce carts` first. |
| `unknown preset` | `--config` takes a preset name on k8s, not a path. |
| Pods `OOMKilled` / evicted | The cluster is undersized: see Prerequisites. |
````

- [ ] **Step 2: Write `docs/next-steps/punch-k8s.md`**

```markdown
# Punch on Kubernetes

Status: POC shipped on branch `feat/punch-k8s-native` — Punch workflows run
natively on Argo Workflows in minikube, with SeaweedFS (S3) and the minikube
registry (ECR) as local stand-ins, synced by Argo CD with a PostSync smoke.
Operation: [`../performance/k8s-runtime.md`](../performance/k8s-runtime.md).
Design: [spec](../superpowers/specs/2026-10-13-punch-k8s-native-design.md).
Anchor: `git grep -n "TODO(next-steps/punch-k8s)"`.

## Verified

- `http-purchase` (and as the PostSync smoke).
- `http-cart --produce carts` → `http-orders --produce orders` →
  `http-orders-status`, through `s3://punch-artifacts/datasets/`.
- Preflight failure naming producers; a failed producer leaves the previous
  dataset untouched.

## Follow-ups

1. **On-demand GitHub job against real AWS** — `workflow_dispatch` with
   inputs `workflow`, `config`, `produce`: OIDC → AWS role; build and push
   sha-tagged k6 images to ECR; `kustomize edit set image`; EKS kubeconfig;
   artifact repository on a real bucket with IRSA; create the Workflow, wait,
   upload the run's evidence.
2. **Browser workflows on k8s** — `browser-cart`, `browser-purchase`
   (Chromium in a pod, `/dev/shm` 512 Mi) are rendered but unverified.
3. **Auth chain and optional datasets** — `http-purchase-registered` →
   `http-auth-login` → `http-me-hot-status`; wire optional `owned-orders`.
4. **Chain DAGs** — one Workflow running a producer → consumer chain.
5. **App images in the registry** — move `bff`/`web`/`visualizer-3d` off
   node-local `:local` tags.
6. **Sizing on k8s** — `--size-for` equivalent (generated preset).
```

- [ ] **Step 3: Update existing docs**

`docs/performance/orchestrator.md` — insert before `## Invariants`:

```markdown
## Kubernetes runtime

The same nine workflows also run natively on Kubernetes: `./dev
perf:<id> --runtime k8s` submits the matching thin template in
`infra/k8s/perf/punch/workflows/` to Argo Workflows (no Python in the
cluster; datasets and evidence in S3). The invariants below describe the
compose runtime. Guide: [`k8s-runtime.md`](k8s-runtime.md).
```

and add to its `## Related` list:

```markdown
- [`k8s-runtime.md`](k8s-runtime.md) — Punch on Kubernetes (Argo Workflows, Argo CD).
```

`docs/architecture/punch-implementation.md` — add two rows to the Punch documentation index table (after the README row):

```markdown
| [Kubernetes runtime](../../vendor/punch/k8s/README.md)                                                                                     | `punch-k6-run` WorkflowTemplate contract and consumer setup                 |
| [ADR 0006](../../vendor/punch/docs/decisions/0006-kubernetes-runtime.md)                                                                   | Why the second runtime is Argo Workflows and Python-free                    |
```

and replace the invariant line `- One \`perf:*\` command → one workflow → at most one Compose run.` with:

```markdown
- One `perf:*` command → one workflow → at most one Compose run (compose
  runtime) or one Argo Workflow (`--runtime k8s`).
```

`infra/k8s/README.md` — append:

```markdown
## Perf platform and Argo CD

`./dev k8s:perf:up` adds the Punch perf platform (`perf/`: Argo Workflows,
SeaweedFS as the S3 stand-in, the registry addon as the ECR stand-in, and
Punch's templates). `./dev argocd:up` installs Argo CD
(`../argocd/install/`) and syncs `perf/` plus the app
(`../argocd/mini-commerce/`: this directory plus a PostSync smoke) from
GitHub.
Guide: [`docs/performance/k8s-runtime.md`](../../docs/performance/k8s-runtime.md).
```

`docs/cli-reference.md` — after the `k8s:down` row, add:

```markdown
| Punch perf platform on minikube: registry + k6 images, Argo Workflows, SeaweedFS (`--no-build` skips images) | `./dev k8s:perf:up` | `pnpm pg:k8s:perf:up` | `task k8s:perf:up` |
| Argo CD syncing the perf platform + app from GitHub, PostSync smoke (`--revision <branch>`) | `./dev argocd:up` | `pnpm pg:argocd:up` | `task argocd:up` |
| Run any `perf:<id>` on Argo Workflows instead of compose (`--config <preset>`, `--produce`, `--base-url`) | `./dev perf:<id> --runtime k8s` | `pnpm pg:perf:<id> --runtime k8s` | — |
```

`CLAUDE.md` — in the Developer loop block, after the `./dev k8s:up ...` line add:

```bash
./dev k8s:perf:up   # Punch perf platform on minikube (Argo Workflows + SeaweedFS + registry)
./dev argocd:up     # Argo CD syncing perf platform + app from GitHub (PostSync smoke)
```

and in the Performance engineering bullet list add:

```markdown
- Kubernetes runtime (Argo Workflows/Argo CD, no Python in cluster): [`docs/performance/k8s-runtime.md`](docs/performance/k8s-runtime.md) — `./dev perf:<id> --runtime k8s`
```

`docs/next-steps/README.md` — append to the Open threads list:

```markdown
7. **[Punch on Kubernetes](punch-k8s.md)** — POC shipped (Argo Workflows +
   Argo CD, local S3/ECR stand-ins); next: on-demand GitHub job against real
   AWS, browser and auth chains.
```

- [ ] **Step 4: Format and verify links**

Run: `npx --no-install prettier --write docs/performance/k8s-runtime.md docs/next-steps/punch-k8s.md >/dev/null && grep -o '](\.\./[^)]*\|](\./[^)]*\|](k8s-runtime.md)' docs/performance/k8s-runtime.md docs/next-steps/punch-k8s.md | sort -u`
Then check each relative target exists: `for f in docs/superpowers/specs/2026-10-13-punch-k8s-native-design.md vendor/punch/k8s/README.md docs/next-steps/punch-k8s.md docs/performance/k8s-runtime.md vendor/punch/docs/decisions/0006-kubernetes-runtime.md; do test -f "$f" && echo "ok $f"; done`
Expected: five `ok` lines.

- [ ] **Step 5: Run the doc contract tests**

Run: `cd scripts && ../.cache/punch-venv/bin/python -m unittest pg.tests.test_perf_ci_docs_contract -v 2>&1 | tail -3`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add docs/performance/k8s-runtime.md docs/next-steps/punch-k8s.md docs/next-steps/README.md \
  docs/performance/orchestrator.md docs/architecture/punch-implementation.md infra/k8s/README.md \
  docs/cli-reference.md CLAUDE.md
git commit -m "docs: document Punch on Kubernetes and its follow-ups"
```

---

### Task 14: Final verification and CI

**Files:** none (memory update outside the repo).

- [ ] **Step 1: Full local gates**

```bash
cd scripts && ../.cache/punch-venv/bin/python -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3; cd ..
.cache/punch-venv/bin/python -m ruff check scripts/pg
(cd vendor/punch && PYTHONPATH=src ../../.cache/punch-venv/bin/python -m unittest discover -s tests -p 'test_*.py' 2>&1 | tail -3)
git -C vendor/punch status --short     # only the pre-existing .github changes
git status --short                     # clean apart from ` m vendor/punch` (its dirty tree)
```

Expected: both suites `OK`; `All checks passed!`; statuses as noted.

- [ ] **Step 2: Push the branch and watch CI (ask first if not already pushed in Task 12)**

Re-run Task 12 Step 1's pre-push checks, then `git push`. Then:

Run: `gh run watch --exit-status $(gh run list --branch feat/punch-k8s-native --limit 1 --json databaseId -q '.[0].databaseId')`
Expected: every job green, including `Kubernetes manifests (kustomize + kubeconform)` and `Python orchestrator (pg) — ruff + tests`. If checkout fails with `not our ref`, Punch was not pushed — see Global Constraints.

- [ ] **Step 3: Update auto-memory**

Update `project_punch_k8s_native.md` in the memory directory: POC shipped on `feat/punch-k8s-native` (commit range), what was verified, and the follow-ups pointer `docs/next-steps/punch-k8s.md`. Keep the `MEMORY.md` index line accurate.

- [ ] **Step 4: Hand off**

Report to the user: the evidence file contents (Tasks 9 and 12), CI run link, and that merging to `main` (and opening a PR, if wanted) is their call. Do not open a PR or merge without being asked.
