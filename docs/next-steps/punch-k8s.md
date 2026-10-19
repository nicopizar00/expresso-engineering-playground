# Punch on Kubernetes

Status: POC on `main` (merge `b194a40`). Punch jobs run natively on Argo
Workflows in minikube, with SeaweedFS (S3) and the minikube registry (ECR) as
local stand-ins, synced by Argo CD with a PostSync smoke.
Operation: [`../performance/k8s-runtime.md`](../performance/k8s-runtime.md).
POC design: [spec](../superpowers/specs/2026-10-13-punch-k8s-native-design.md).
Target CI design (GitHub workflows for single jobs and Punch workflows, per-run
artifacts, what is not possible, weak points):
[Punch guide](../../vendor/punch/docs/architecture/orchestrator-to-kubernetes.md).
Anchor: `git grep -n "TODO(next-steps/punch-k8s)"`.

## Verified

- `http-purchase` (and as the PostSync smoke).
- `http-cart --produce carts` → `http-orders --produce orders` →
  `http-orders-status`, through `s3://punch-artifacts/datasets/`. These are
  manual runs; the CI design runs a Punch workflow inside one Argo Workflow instead.
- Preflight failure naming producers; a failed producer leaves the previous
  dataset untouched.
- `./dev argocd:up`: both Applications healthy, PostSync smoke passes; a
  missing `http-purchase` template fails the sync; re-syncs recover.
- Compose runtime unchanged (`./dev perf:http-purchase --config 1-iteration`).

## Found during acceptance

- Argo's init container writes inputs as the pod user: pods now run as the
  k6 image user (uid 12345), or `/scripts/data` is unreadable.
- SeaweedFS keeps an empty `datasets/` folder after all its objects are
  deleted, and Argo then fails an optional _directory_ input. The template
  loads the one required dataset as a single file instead, so a job on
  k8s reads at most one required dataset (true of every job today).
- Argo Workflows' full-validation CRDs (~12 MB) pushed kube-apiserver and Argo
  CD's application controller into OOM churn on the 4.5 GB cluster; the
  platform installs the release's minimal CRDs.
- Punch's remote requires pull requests on `main`; this work's Punch commits
  were pushed directly under the owner's bypass.

## Follow-ups

In dependency order. Items 1 to 6 build the target CI design; the guide's
"Not possible as stated, and the redesign" table holds the reasons.

1. **Templates ready for Punch workflows** (Punch and the thin templates): read
   `inputs.parameters` instead of `workflow.parameters`; declare the dataset
   input and expose the step's outputs; write outputs under `runs/<run>/`
   instead of the shared `datasets/` key.
2. **Punch workflow WorkflowTemplates**: one Argo DAG per Punch workflow, named
   `<first>-to-<last>`, each step passing its dataset with `from:` and
   producing the next step's dataset. Generated from the catalog and pinned
   by a drift test beside `scripts/pg/tests/test_k8s_jobs.py`. The
   catalog has 9 workflows today.
3. **Dropdown generator**: write the `choice` options for `perf-job.yml`
   (the 6 jobs without `requires`) and `perf-workflow.yml` (the 9 workflows)
   from the catalog; a test fails on drift. GitHub reads the options as
   literal YAML.
4. **GitHub workflows** `perf-job.yml` and `perf-workflow.yml`: dispatch and
   schedule (each cron line selects its entry through
   `github.event.schedule`); size producers on the runner; OIDC to an AWS
   role and the EKS kubeconfig; wait until the Argo CD Application's
   `status.sync.revision` equals the commit and is `Healthy`; create the
   Argo Workflow; poll; job summary and evidence, with artifact names that
   carry the entry; one `concurrency` group per target environment. CI never
   applies manifests.
5. **Commit-tagged images**: replace `localhost:5000/...:local`. Decide
   between committing the tag for Argo CD to sync and passing the image as an
   Argo Workflow parameter (any submitter could then run any image).
6. **Real bucket and lifetime**: an S3 bucket through IRSA; a lifecycle rule
   on `runs/`; Argo `ttlStrategy` and `podGC: OnPodCompletion`; no
   `artifactGC`, so evidence outlives the Argo Workflow object.
7. **Sizing on k8s**: the runner sizes each producer for its next step and
   passes the generated k6 config as a parameter that `k6-run.sh` writes to a
   file.
8. **Optional datasets**: an optional input slot to wire `owned-orders`.
   It unblocks the 2 workflows through `http-purchase-registered`
   (`→ http-auth-login → http-me-hot-status`).
9. **Name limits in Punch**: cap the loader at 57 characters (Argo's 63 minus
   `generateName`'s 6) and reserve the `punch-` prefix for Punch's templates.
10. **Browser jobs on k8s**: `browser-cart`, `browser-purchase`
    (Chromium in a pod, `/dev/shm` 512 Mi) are rendered but unverified.
11. **k6 practice gaps**: the guide's "Weak points against k6 practice"
    table: CPU and memory requests and limits, dedicated nodes for k6 pods,
    streamed metrics, the 900 s cap against soak tests,
    `net.ipv4.ip_local_port_range`, `safe-to-evict`, and a `base-url` that
    skips ingress.
12. **App images in the registry**: move `bff`/`web`/`visualizer-3d` off
    node-local `:local` tags.
13. **Argo CD diff noise**: `ignoreDifferences` for the `postgres`
    StatefulSet so `mini-commerce` reports Synced.
14. **Second required dataset**: a second input slot in `punch-k6-run` if a
    job ever needs two; no workflow needs one today.
