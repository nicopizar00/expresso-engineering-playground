# Punch on Kubernetes

Punch workflows also run natively on Kubernetes: Argo Workflows executes
them, S3 holds datasets and evidence, an OCI registry holds the k6 images,
and Argo CD syncs everything from git. No Python and no Punch image run in
the cluster. The compose runtime (`./dev perf:<id>`) is unchanged and stays
the default. Design: [spec](../superpowers/specs/2026-10-13-punch-k8s-native-design.md);
Punch's contract: [`vendor/punch/k8s/README.md`](../../vendor/punch/k8s/README.md).

## What runs where

| Namespace       | Holds                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `mini-commerce` | The app (`infra/k8s`)                                                                                       |
| `argo`          | Argo Workflows v4.1.5 controller + UI (`--auth-mode=server`, minimal CRDs)                                  |
| `punch`         | `punch-k6-run`, nine thin templates (`infra/k8s/perf/punch/workflows/`), runs, presets, artifact repository |
| `aws-local`     | SeaweedFS 4.48 — S3 stand-in, bucket `punch-artifacts`                                                      |
| `kube-system`   | minikube `registry` addon — ECR stand-in at `localhost:5000`                                                |
| `argocd`        | Argo CD v3.5.5                                                                                              |

## Prerequisites

- Docker Desktop with at least 6 GB of memory; the `mini-commerce` minikube
  profile at 4.5 GB (`./dev k8s:up` warns when an older, smaller profile is
  running; recreate it with `minikube delete -p mini-commerce`, which deletes
  its Postgres data and images).
- `kubectl`, `minikube`. The `argo` CLI is optional.

## Quick start

Two front ends drive the same manifests: `./dev` (Python, below) and
[`./k8s`](#bash-only-k8s) (bash + kubectl only).

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
values cannot contain spaces. A workflow reads at most one required dataset
on k8s. `--data`, `--size-for`, prompts, and the menu are compose-only. Ctrl+C stops the run (`spec.shutdown: Stop`).

## Bash only: `./k8s`

`./k8s` at the repository root does the same Kubernetes and Argo work in
plain bash + kubectl (no Python), for machines or CI jobs without the
orchestrator. It uses the same manifests and names; `./k8s help` lists
everything.

```bash
./k8s up                      # minikube + app images + core/web/viz
./k8s perf:up                 # registry + k6 images, Argo Workflows, SeaweedFS, templates
./k8s verify                  # the POC check: preflight, cart → orders → status through S3,
                              # atomic publish (resets s3://punch-artifacts/datasets/)
./k8s run http-cart --produce carts
./k8s evidence <run>          # status, S3 artifacts, k6 summary of one run
./k8s ui argo|argocd|s3       # port-forward and open a UI
./k8s argocd:up --revision main
./k8s status | forward | s3 <aws-cli args> | down
```

`scripts/pg/tests/test_k8s_cli.py` keeps its images, cluster size, registry,
and S3 credentials in step with the Python orchestrator.

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

| Local                                   | AWS                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `localhost:5000/mini-commerce/k6:local` | `<acct>.dkr.ecr.<region>.amazonaws.com/mini-commerce/k6:<sha>` via `kustomize edit set image k6-scenarios=...` |
| SeaweedFS + `s3-credentials`            | S3 bucket + IRSA; `artifact-repositories` shaped like `vendor/punch/k8s/examples/artifact-repositories.yaml`   |
| minikube                                | EKS; Argo CD or a GitHub job applies the same kustomizations                                                   |

The on-demand GitHub job is the next step: [`../next-steps/punch-k8s.md`](../next-steps/punch-k8s.md).

## Troubleshooting

| Symptom                                                  | Fix                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `no matches for kind "WorkflowTemplate"` on apply        | CRDs were still registering; apply again (`k8s:perf:up` does this).                                                                    |
| Run `Failed` after ~15 min, pod `ImagePullBackOff`       | Images not in the registry: `./dev k8s:perf:up` (without `--no-build`).                                                                |
| `requires "carts"; produce it with: ...`                 | Run the named producer with `--produce carts` first.                                                                                   |
| `unknown preset`                                         | `--config` takes a preset name on k8s, not a path.                                                                                     |
| Pods `OOMKilled` / evicted                               | The cluster is undersized: see Prerequisites.                                                                                          |
| API timeouts / controller restarts after an Argo CD sync | Memory pressure. The platform uses Argo's minimal CRDs because the full ones (~12 MB) overloaded the 4.5 GB cluster; keep it that way. |
| `mini-commerce` shows OutOfSync but Healthy              | Benign: the `postgres` StatefulSet and the hook Workflow differ in server-filled fields.                                               |
