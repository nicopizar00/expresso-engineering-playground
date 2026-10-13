# Punch on Kubernetes (k8s-native) Design

## Status

Approved in conversation on 2026-10-13, section by section (engine, ownership
and layout, template contract, platform and Argo CD, testing and phases), and
as a written spec the same day.

Amended 2026-10-13 during planning: SeaweedFS replaces MinIO (MinIO stopped
publishing images in October 2025 and archived its repository in April 2026;
its quay.io images now return 401), the template gains `workflow` and
`forward` parameters, `requires-hint` uses the `produces` syntax, and runs get
a 900 s deadline.

## Problem

Punch runs one k6 workflow as exactly one `docker compose run`, driven by
Python on the host (`./dev perf:*` → `scripts/pg/k6runner.py` → Punch's
`execute_workflow`). That ties every run to a host process and a Docker
daemon. It cannot run inside a cluster, cannot be synced by Argo CD, and has no
path to a cloud registry (ECR) or object store (S3).

## Goals

- Run Punch workflows on Kubernetes as **native** resources: Argo Workflows
  executes them, Argo CD syncs them from git, S3 holds datasets and evidence,
  an OCI registry holds the images.
- **No Python and no Punch image in the cluster.** Only Punch's core features
  move to Kubernetes; everything else stays local-only Python.
- Local first: minikube, SeaweedFS as the S3 stand-in, the minikube `registry`
  addon as the ECR stand-in. No cloud account.
- Shaped so a later on-demand GitHub job (`workflow_dispatch`) can run it
  against real AWS (ECR, S3, EKS) by changing endpoints, credentials, and
  image names — not manifests.
- Compose stays the default runtime; both runtimes coexist.

## Non-goals

- Retiring or changing the compose runtime, the workflow YAMLs, or the k6
  scenarios.
- Real AWS resources, Terraform, or the on-demand GitHub job (follow-up).
- Browser workflows (`browser-*`) and the auth chain (`http-purchase-registered`
  → `http-auth-login` → `http-me-hot-status`) verified on Kubernetes. They are
  rendered as thin templates but unverified.
- Chain DAGs (one Workflow running a producer → consumer chain). Data moves
  between sequential runs through S3, as host files do today.
- `--data` overrides, `--size-for` sizing, `--config <arbitrary path>`
  (presets only), interactive prompts, the menu, the catalog link check.
- Moving the app images (`bff`, `web`, `visualizer-3d`) into the registry.
- Distributed k6 (k6-operator).

## Decisions

| Topic             | Decision                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration meaning | k8s-native rewrite of Punch's core; not Punch's Python running in a pod.                                                                                                                                                                          |
| Engine            | Argo Workflows (`WorkflowTemplate` per workflow, S3 artifact repository).                                                                                                                                                                         |
| Compose           | Kept as the default runtime.                                                                                                                                                                                                                      |
| AWS stand-ins     | SeaweedFS 4.48 (`weed mini`, S3 API) and the minikube `registry` addon (OCI, ECR-style names). MinIO rejected: images withdrawn, repository archived. LocalStack rejected: since 2026.03 it needs an auth token, and ECR is not in its free tier. |
| Argo CD role      | Sync the perf platform and the app from git; a PostSync hook runs the smoke workflow.                                                                                                                                                             |
| POC scope         | `http-purchase` (smoke) plus `http-cart` → `http-orders` → `http-orders-status`.                                                                                                                                                                  |
| Drift control     | A CI-only parity test compares each k8s entry with its Punch YAML.                                                                                                                                                                                |
| Cluster size      | Recreate the `mini-commerce` profile with 4.5 GB / 4 CPUs (Docker Desktop ≥ 6 GB).                                                                                                                                                                |
| Local wrapper     | `./dev perf:<id> --runtime k8s` is a convenience over `kubectl`; the runtime never needs it.                                                                                                                                                      |

## Feature split

| Punch core feature                                         | Kubernetes-native replacement                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Run one workflow (`k6 run <script> --config`)              | `punch-k6-run` step in the existing k6 image                                                                     |
| Load-shape presets (`tests/performance/k6/options/*.json`) | ConfigMap `punch-k6-options` mounted at `/punch/options/`                                                        |
| Environment forward (`BASE_URL`, …)                        | Template parameters `base-url` and `extra-env`                                                                   |
| Dataset preflight (≥ 1 row, producer hint)                 | Shell guard in the k6 container before `k6 run`                                                                  |
| `[DATA]` stdout harvest with `--produce` opt-in            | Shell after `k6` exits, over teed stdout only                                                                    |
| Atomic publication                                         | Files written only after full validation; optional output artifact; one S3 object per dataset                    |
| Run evidence (`punch-run.json`)                            | Workflow status (phase, node messages, exit codes), output parameter `datasets`, archived logs and reports in S3 |
| Dataset handoff                                            | S3 `datasets/<dataset>.csv`                                                                                      |

Stays local-only Python: `punch menu`, confirmation and delete-consumed
prompts, catalog link validation, `--size-for`, `--data`, the compose runtime.

## Ownership

| Owner                                                     | Adds                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Punch (`vendor/punch/k8s/`, pure YAML + one shell script) | `WorkflowTemplate punch-k6-run`; `k6-run.sh` (mounted from a ConfigMap); executor ServiceAccount + Role + RoleBinding; example `artifact-repositories` ConfigMap; `README.md`; shell-script tests in Punch's unittest suite; ADR "second runtime: Argo Workflows".                                                         |
| Expresso                                                  | Nine thin `WorkflowTemplate`s; perf platform kustomization (Argo Workflows, SeaweedFS, artifact repository, options ConfigMap, image mapping); Argo CD install and Applications; the PostSync overlay; `./dev k8s:perf:up`, `./dev argocd:up`, `./dev perf:<id> --runtime k8s`; parity test; `k8s-manifests` CI job; docs. |

The Punch base is consumer-agnostic: image names are placeholders
(`k6-scenarios`, `k6-scenarios-browser`) that a consumer maps with kustomize
`images:`; scenario paths, presets, and datasets arrive as parameters.

## Cluster layout

All in the existing `mini-commerce` minikube profile, so k6 reaches
`bff.mini-commerce.svc.cluster.local` directly.

| Namespace       | Holds                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `mini-commerce` | App (`infra/k8s`, unchanged)                                                                                   |
| `argo`          | Argo Workflows controller and UI server (pinned v4.1.5, `--auth-mode=server`)                                  |
| `punch`         | `punch-k6-run`, nine thin templates, Workflow runs, `artifact-repositories`, `punch-k6-options`, executor RBAC |
| `aws-local`     | SeaweedFS `weed mini` (S3 stand-in, `:8333`); bucket `punch-artifacts` created at startup via `S3_BUCKET`      |
| `kube-system`   | minikube `registry` addon (ECR stand-in), `localhost:5000` on the node                                         |
| `argocd`        | Argo CD (pinned v3.5.5); dex, notifications, ApplicationSet scaled to 0                                        |

## Template contract

### `punch-k6-run` (Punch)

Two step templates, `k6` and `k6-browser`, run the same `k6-run.sh`.
`k6-browser` adds a memory-backed `/dev/shm` volume (512 Mi, matching the
compose `shm_size`). Both run in the consumer's k6 image, which already ships
busybox `sh`, `grep`, `sed`, `awk`, and `tee` (verified: both images are
Alpine, uid 12345). Both templates set `serviceAccountName: punch-executor`,
`activeDeadlineSeconds: 900` (a run stuck in `ImagePullBackOff` fails instead
of hanging an Argo CD hook), and `archiveLocation.archiveLogs: true`.

Input parameters:

| Parameter       | Example (`http-orders`)                           | Meaning                                                                     |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| `workflow`      | `http-orders`                                     | Workflow id, used in messages                                               |
| `script`        | `/scripts/scenarios/http-orders/http-orders.js`   | k6 entry in the image                                                       |
| `config`        | `5-iterations`                                    | Preset name → `--config /punch/options/<config>.json`                       |
| `base-url`      | `http://bff.mini-commerce.svc.cluster.local:3001` | `BASE_URL`                                                                  |
| `forward`       | `EXPECT_TEMPERATURE ORDER_COOL_DOWN_SECONDS`      | Names `extra-env` may set (Punch's `forward` minus `BASE_URL`)              |
| `extra-env`     | `EXPECT_TEMPERATURE=hot`                          | `K=V` pairs, each passed as `-e K=V`; a name outside `forward` exits 2      |
| `requires`      | `carts`                                           | Space-separated datasets that must exist with ≥ 1 row                       |
| `requires-hint` | `carts=browser-cart,http-cart`                    | Producers per required dataset (`<ds>=<wf>,<wf>`; space-separated)          |
| `produces`      | `orders=orderId`                                  | Declared datasets and their columns (`<ds>=<col>,<col>`; space-separated)   |
| `produce`       | `""` or `orders`                                  | Datasets this run opts into (comma-separated, or `all`); undeclared exits 2 |

Container environment: `K6_LOG_OUTPUT=stdout`, `K6_LOG_FORMAT=raw`
(as in compose), and `DATA_<DATASET>_CSV=/scripts/data/<dataset>.csv` for each
required dataset (same name rule as Punch's `data_env_name`).

Artifacts:

| Direction | Path                  | S3 key                            | Notes                                                         |
| --------- | --------------------- | --------------------------------- | ------------------------------------------------------------- |
| In        | `/scripts/data`       | `datasets/`                       | Optional — the first run has no datasets                      |
| Out       | `/punch/out/datasets` | `datasets/`                       | Optional, `archive: none`; only written files replace objects |
| Out       | `/scripts/reports`    | `runs/{{workflow.name}}/reports/` | `emptyDir`; scenarios' `handleSummary` writes here            |
| Logs      | —                     | `runs/{{workflow.name}}/…`        | `archiveLogs: true`                                           |

Output parameter `datasets` comes from `/punch/out/rows.txt`
(e.g. `orders=5`, default empty), so row counts appear in the Workflow status.

### `k6-run.sh` behavior

0. **Validate.** Every `produce` entry must be declared in `produces`, and
   every `extra-env` name must be in `forward`; otherwise exit 2 before k6.
1. **Preflight.** For each dataset in `requires`, the file must exist and hold
   at least one row after the header. Otherwise print
   `<workflow> requires "<ds>"; produce it with: <hint> (--produce <ds>)` and
   exit 1 before k6 starts.
2. **Run.** `k6 run <script> --config /punch/options/<config>.json -e …`,
   stdout teed to `/punch/out/stdout.log`; stderr goes only to the pod log, so
   it is never harvested. k6's exit code is preserved.
3. **Harvest** (only if k6 exited 0; the scan runs even when nothing is
   opted in, as Punch's does). For each stdout line matching
   `^\[DATA <ds>\] ?(.*)$`: an undeclared `<ds>` fails the run; for an
   opted-in `<ds>`, a payload whose comma-separated field count differs from
   the declared column count fails the run; lines for declared but not
   opted-in datasets are ignored (they stay in the log). Each opted-in
   dataset with zero rows fails the run. Only after every check passes are
   `<ds>.csv` files (header from `produces`, then rows) moved into
   `/punch/out/datasets/` and `rows.txt` written.
4. **Exit** with k6's exit code, 2 for a validation failure, or 1 for a
   preflight or harvest failure.

Contract constraint: harvested payloads are plain comma-separated values with
no quoting. Current datasets (ids, uuids, tokens, usernames, emails) satisfy
it. Punch's Python harvester remains the full-CSV implementation for compose.

### Thin templates (Expresso)

`infra/k8s/perf/punch/workflows/<id>.yaml`, one per Punch YAML, same id
everywhere. Each is a `WorkflowTemplate` with `entrypoint: main`, workflow
arguments for `config`, `produce`, `base-url`, and `extra-env`, and a
single step `templateRef: { name: punch-k6-run, template: k6 | k6-browser }`
passing the parameters above. Defaults:

- `config`: basename of the Punch YAML's `spec.k6.config`.
- `base-url`: `bff.mini-commerce.svc.cluster.local:3001` for service `k6`,
  `web.mini-commerce.svc.cluster.local:3000` for `k6-browser`.
- `forward`: the Punch YAML's `environment.forward` without `BASE_URL`.
- `requires-hint`: the catalog's producers of each required dataset, in
  `producers_of` order.

Optional datasets (`spec.data.optional`) are not wired in the POC: no
`DATA_<DATASET>_CSV` is set for them, and `http-auth-login`'s behavior on
k8s stays unverified (follow-up).

### Running a workflow

```bash
kubectl -n punch create -f - <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata: { generateName: http-orders- }
spec:
  workflowTemplateRef: { name: http-orders }
  arguments: { parameters: [ { name: produce, value: orders } ] }
EOF
# or: argo -n punch submit --from workflowtemplate/http-orders -p produce=orders --wait
```

`./dev perf:<id> --runtime k8s [--config <preset>] [--produce <ds>]` creates
the same Workflow with `kubectl`, streams the k6 container's log, polls
`.status.phase`, prints the `datasets` output and the run's S3 prefix, and
exits 0 on `Succeeded`, 1 otherwise. Ctrl+C patches `spec.shutdown: Stop`.
The `argo` CLI is optional.

## Platform

### Expresso layout

```text
infra/k8s/                    app base — unchanged
infra/k8s/argocd-app/         overlay: ../ + postsync-smoke.yaml
infra/k8s/perf/
  kustomization.yaml          resources: argo-workflows/, aws-local/, punch/
  argo-workflows/             ns argo: pinned v4.1.5 install URL + argo-server --auth-mode=server
  aws-local/                  ns aws-local: SeaweedFS Deployment, Service, 2 Gi PVC, credentials Secret
  punch/                      ns punch:
    kustomization.yaml          resources: ../../../../vendor/punch/k8s, artifact-repositories.yaml, workflows/
                                configMapGenerator punch-k6-options ← tests/performance/k6/options/*.json
                                configurations: vendor/punch/k8s/kustomizeconfig.yaml
                                images: k6-scenarios, k6-scenarios-browser
                                  → localhost:5000/mini-commerce/k6[-browser]:local
    artifact-repositories.yaml  default S3 repository: SeaweedFS endpoint, bucket punch-artifacts
    workflows/*.yaml            nine thin templates
infra/k8s/argocd/
  kustomization.yaml          Argo CD install (pinned remote), argocd-cm patch,
                              scale-to-0 patches (dex, notifications, ApplicationSet)
  applications/               punch-platform (path infra/k8s/perf),
                              mini-commerce (path infra/k8s/argocd-app)
```

The options ConfigMap reads files outside `infra/k8s/perf/`, so every render
uses `--load-restrictor LoadRestrictionsNone`, as `infra/k8s` already does.
Kustomize `images:` needs a `configurations:` fieldSpec for
`WorkflowTemplate` container images; Punch ships it as
`k8s/kustomizeconfig.yaml` and the consumer's kustomization lists it (a
base's `configurations:` does not apply to its overlay — verified). Generated
ConfigMaps and Secrets that CRDs reference by name disable the hash suffix.

### Images (ECR stand-in)

`./dev k8s:perf:up`:

1. `minikube addons enable registry`.
2. Builds `infra/docker/k6.Dockerfile` and `k6-browser.Dockerfile` into the
   node's Docker daemon (`minikube docker-env`, as `k8s:up` does), tags them
   `localhost:5000/mini-commerce/k6:local` and `…/k6-browser:local`, pushes.
3. `kubectl apply --server-side` of the rendered `infra/k8s/perf` (Argo
   CRDs exceed the client-side annotation limit); a second pass covers
   resources whose CRDs registered in the first.
4. Waits for the Argo controller, the Argo server, and SeaweedFS.

Pods pull with `imagePullPolicy: Always` (mutable `:local` tag). Real ECR:
`kustomize edit set image k6-scenarios=<acct>.dkr.ecr.<region>.amazonaws.com/mini-commerce/k6:<sha>`
and `IfNotPresent`.

### S3 stand-in

SeaweedFS `chrislusf/seaweedfs:4.48` running `weed mini -dir=/data`, single
replica, S3 on `:8333`. Credentials come from a `secretGenerator` with
local-only defaults (same convention as the Postgres secret; not real
credentials) as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`; `S3_BUCKET`
creates `punch-artifacts` at startup, so no bucket Job is needed. The same
literals are generated in namespace `punch` for Argo's artifact repository.
Bucket layout:

```text
punch-artifacts/
  datasets/<dataset>.csv      current published dataset (k8s store; separate from host files)
  runs/<workflow-name>/       archived logs, reports/
```

Real S3: the same `artifact-repositories` shape with the AWS endpoint, a real
bucket, and IRSA instead of access keys.

### Argo CD

`./dev argocd:up [--revision <branch>]` applies `infra/k8s/argocd`, waits for
Argo CD, then creates `punch-platform`, waits for it to be Healthy, then
creates `mini-commerce`.

- Source: `https://github.com/nicopizar00/expresso-engineering-playground.git`
  (public), default revision `main`. Argo CD fetches submodules by default, so
  `vendor/punch/k8s` resolves. Only pushed commits sync; test a branch with
  `--revision`.
- `argocd-cm`: `kustomize.buildOptions: --load-restrictor LoadRestrictionsNone`.
- Sync policy: automated, `selfHeal: false` (so `k8s:up`'s
  `rollout restart` does not fight Argo CD), `prune: false`; sync options
  `ServerSideApply=true`, `SkipDryRunOnMissingResource=true`.
- PostSync hook (`infra/k8s/argocd-app/postsync-smoke.yaml`): a `Workflow` in
  namespace `punch`, `generateName: postsync-smoke-`,
  `workflowTemplateRef: http-purchase`, `config=1-iteration`, annotations
  `argocd.argoproj.io/hook: PostSync` and
  `argocd.argoproj.io/hook-delete-policy: BeforeHookCreation`. PostSync runs
  only after every app resource is Healthy; Argo CD's built-in `Workflow`
  health check makes a failed smoke fail the sync.
- App images stay `:local`, built into the node by `./dev k8s:up`; Argo CD
  syncs manifests only.

### Cluster resize

`scripts/pg/k8s.py`: `CLUSTER_MEMORY_MB = 4608`, `CLUSTER_CPUS = 4`. The
existing profile must be recreated once with `minikube delete -p
mini-commerce` (destructive: Postgres data and built images; the seed restores
data). The implementation asks before running it. Docker Desktop needs at
least 6 GB.

## Error handling

| Failure                                                                     | Behavior                                                                                            |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Required dataset missing or header-only                                     | Preflight exits 1 with the producer hint; k6 never starts; Workflow `Failed`.                       |
| k6 non-zero (thresholds, crash)                                             | No harvest; no dataset files; previous S3 objects untouched; Workflow `Failed` with k6's exit code. |
| Undeclared `[DATA]` tag, column mismatch, zero rows for an opted-in dataset | Exit 1, no files; previous objects untouched.                                                       |
| Unknown preset in `config`                                                  | k6 fails to read `--config`; Workflow `Failed`.                                                     |
| S3 endpoint (SeaweedFS) unreachable                                         | Argo artifact load/save error; node `Error`; Workflow `Failed`.                                     |
| Image not in registry                                                       | `ImagePullBackOff`; the wrapper reports the pod reason after the controller marks the node failed.  |
| Ctrl+C in the wrapper                                                       | `spec.shutdown: Stop`; the wrapper prints the run name and exits 130.                               |
| PostSync smoke fails                                                        | Argo CD sync `Failed`; the hook Workflow remains for inspection until the next sync.                |

## Testing

- **Punch (unittest, CI tooling only):** `k6-run.sh` under `sh` with a fake
  `k6` on `PATH`. Covers preflight missing/empty; harvest happy path;
  undeclared tag; column mismatch; zero rows; stderr `[DATA]` ignored; k6
  failure leaves no files; no `produce` leaves no files; `all` opts into every
  declared dataset.
- **Expresso parity test** (`scripts/pg/tests/test_k8s_workflows.py`): for
  every Punch YAML, a thin template exists and matches script, default config,
  service → template (`k6`/`k6-browser`), `base-url` per service, forwarded
  names, `requires`, `requires-hint` (catalog producers), and `produces`
  (dataset + columns). Every thin template has a Punch YAML.
- **CI job `k8s-manifests`:** `kubectl kustomize --load-restrictor
LoadRestrictionsNone` for `infra/k8s`, `infra/k8s/perf`,
  `infra/k8s/argocd-app`, `infra/k8s/argocd`, validated with a pinned
  `kubeconform` plus Argo CRD schemas.
- **Local acceptance** (evidence in the PR):
  1. `./dev k8s:up` + `./dev k8s:perf:up`: controller and SeaweedFS ready, nine
     templates listed.
  2. `./dev perf:http-purchase --runtime k8s --config 1-iteration`:
     `Succeeded`; reports and logs under `runs/` in SeaweedFS.
  3. Chain: `http-orders` with no carts fails preflight with the hint;
     `http-cart --produce carts` writes `datasets/carts.csv`;
     `http-orders --produce orders`; `http-orders-status` `Succeeded`.
  4. Atomicity: `http-cart --produce carts` with an unreachable `base-url`
     fails and `datasets/carts.csv`'s ETag is unchanged.
  5. Argo CD: both apps Synced/Healthy, PostSync smoke `Succeeded`; a smoke
     pointed at a bad `base-url` fails the sync.
  6. Regression: compose `./dev perf:http-purchase --config 1-iteration`,
     `pnpm pg:test`, Punch tests, and CI green after push.

## Phases

| Phase                     | Delivers                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 spike (throwaway)      | Argo S3 directory artifacts under an optional prefix with `archive: none` replace only written objects and upload nothing for an empty directory; SeaweedFS `weed mini` serves S3 with the configured credentials and bucket; the minikube `registry` addon serves `localhost:5000` images to pods. If directory artifacts misbehave, fall back to one artifact per dataset (every workflow today requires ≤ 1 and produces ≤ 1). |
| P1 Punch                  | `k8s/` base, `k6-run.sh`, its tests, ADR, `k8s/README.md`, boundaries row. Pushed to Punch's remote before the outer pointer bump.                                                                                                                                                                                                                                                                                                |
| P2 Expresso perf platform | Cluster resize, registry, SeaweedFS, Argo Workflows, thin templates, `k8s:perf:up`, `--runtime k8s`, parity test, `k8s-manifests` CI job.                                                                                                                                                                                                                                                                                         |
| P3 Argo CD                | Install, Applications, PostSync smoke overlay, `argocd:up`.                                                                                                                                                                                                                                                                                                                                                                       |
| P4 Docs                   | `docs/performance/k8s-runtime.md`; updates to `orchestrator.md`, `punch-implementation.md`, `infra/k8s/README.md`, `docs/cli-reference.md`, `CLAUDE.md`; `docs/next-steps/punch-k8s.md`.                                                                                                                                                                                                                                          |

## Follow-ups

Recorded in `docs/next-steps/punch-k8s.md`:

- On-demand GitHub job (`workflow_dispatch`: workflow, config, produce) against
  real AWS: OIDC role → ECR push (sha tag) → EKS kubeconfig → create Workflow →
  wait → upload evidence.
- Verify browser workflows and the auth chain (optional datasets) on k8s.
- Chain DAG templates.
- App images in the registry.
- Sizing (`--size-for`) on k8s.

## Repository hygiene

- `vendor/punch` has uncommitted `.github` changes that predate this work;
  they stay out of every commit.
- Committed content carries no AI attribution, secrets, or real credentials.
