# Kubernetes (minikube)

Deploys the compose `core` + `web` + `viz` profiles to a local minikube
cluster: `postgres`, `bff`, `otel-collector`, `web`, `visualizer-3d`.
Service names match compose, so `infra/observability/otel-collector-config.yaml`
and the web proxy rewrites are reused unchanged. The observability backends
(`tempo`, `prometheus`, `grafana`) and `prisma-studio` are not deployed.

`bff-dev` is the BFF dev stage. The `bff` pod runs it as an init container
for `prisma migrate deploy` + `prisma db seed` (both idempotent), mirroring
what `./dev up` does in a one-off container.

**Manual steps** (plain `minikube` / `docker` / `kubectl`), monitoring, and
troubleshooting: [`docs/minikube-runbook.md`](../../docs/minikube-runbook.md).

## Automated: `./dev k8s:*`

The orchestrator wraps the runbook's steps. Port-forwards reuse the compose
host ports, so stop compose first — and `./dev smoke` then runs against the
cluster unchanged.

```bash
./dev down            # free compose's RAM and ports
./dev k8s:up          # start cluster, build images into it, apply, wait for rollouts
./dev k8s:forward     # localhost:3000/3001/3002 → web/bff/visualizer-3d (Ctrl+C stops)
./dev smoke           # in another terminal
./dev k8s:status      # pods + services
./dev k8s:down        # minikube stop — images and Postgres data are kept
```

`pnpm pg:k8s:*` and `task k8s:*` are equivalent aliases.

| Command               | Notes                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `k8s:up [--no-build]` | Creates the `mini-commerce` minikube profile on first run. Rebuilds every image and restarts the app deployments. `--no-build` only applies manifests (manifest-only changes, or a restart after `k8s:down`). |
| `k8s:forward`         | Retries a forward until its pod is ready, so it survives pod replacement and slow init (migrate + seed). Exits when the cluster stops.                                                                        |
| `k8s:down`            | Non-destructive. Remove everything with `minikube delete -p mini-commerce`.                                                                                                                                   |

After a cluster restart the API reports pre-stop pod readiness until the
kubelet resyncs, so `rollout status` alone can pass too early. `k8s:up`
therefore waits until every pod turns Ready after the cluster start before
it applies anything.

## Perf platform and Argo CD

`./dev k8s:perf:up` adds the Punch perf platform (`perf/`: Argo Workflows,
SeaweedFS as the S3 stand-in, the registry addon as the ECR stand-in, and
Punch's templates). `./dev argocd:up` installs Argo CD
(`../argocd/install/`) and syncs `perf/` plus the app
(`../argocd/mini-commerce/`: this directory plus a PostSync smoke) from
GitHub.
Guide: [`docs/performance/k8s-runtime.md`](../../docs/performance/k8s-runtime.md).

`./k8s` (repository root) does the same in bash + kubectl only, plus
`./k8s verify` (the POC check) and `./k8s evidence <run>`.
