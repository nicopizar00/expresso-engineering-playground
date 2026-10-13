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
- `./dev argocd:up`: both Applications healthy, PostSync smoke passes; a
  missing `http-purchase` template fails the sync; re-syncs recover.
- Compose runtime unchanged (`./dev perf:http-purchase --config 1-iteration`).

## Found during acceptance

- Argo's init container writes inputs as the pod user: pods now run as the
  k6 image user (uid 12345), or `/scripts/data` is unreadable.
- SeaweedFS keeps an empty `datasets/` folder after all its objects are
  deleted, and Argo then fails an optional _directory_ input. The template
  loads the one required dataset as a single file instead, so a workflow on
  k8s reads at most one required dataset (true of every workflow today).
- Argo Workflows' full-validation CRDs (~12 MB) pushed kube-apiserver and Argo
  CD's application controller into OOM churn on the 4.5 GB cluster; the
  platform installs the release's minimal CRDs.
- Punch's remote requires pull requests on `main`; this work's Punch commits
  were pushed directly under the owner's bypass.

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
7. **Argo CD diff noise** — `ignoreDifferences` for the `postgres`
   StatefulSet so `mini-commerce` reports Synced.
8. **Second required dataset** — a second input artifact slot in
   `punch-k6-run` if a workflow ever needs two.
