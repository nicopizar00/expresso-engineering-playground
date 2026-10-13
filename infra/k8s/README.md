# Kubernetes (minikube)

Deploys the compose `core` + `web` + `viz` profiles to a local minikube
cluster: `postgres`, `bff`, `otel-collector`, `web`, `visualizer-3d`.
Service names match compose, so `infra/observability/otel-collector-config.yaml`
and the web proxy rewrites are reused unchanged. The observability backends
(`tempo`, `prometheus`, `grafana`) and `prisma-studio` are not deployed.

Port-forwards reuse the compose host ports, so stop compose first
(`./dev down`) — and `./dev smoke` runs against the cluster unchanged.
Day-to-day use, monitoring, and troubleshooting:
[`docs/minikube-runbook.md`](../../docs/minikube-runbook.md).

## Prerequisites

- Docker Desktop with ~4 GB RAM allocated (the cluster takes 3 GB)
- `brew install minikube` (pulls `kubectl` too)

## Commands

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

| URL                   | Service                               |
| --------------------- | ------------------------------------- |
| http://localhost:3000 | web (embeds the visualizer at `/viz`) |
| http://localhost:3001 | bff                                   |
| http://localhost:3002 | visualizer-3d standalone              |

## What `k8s:up` runs

The equivalent manual steps, from the repo root — useful when debugging one
step in isolation:

```bash
# 1. Cluster. --container-runtime=docker: minikube ≥ 1.39 defaults to
#    containerd, which has no `docker-env` for step 2.
minikube start -p mini-commerce --driver=docker --container-runtime=docker \
  --cpus=4 --memory=3072

# 2. Build images straight into the cluster's Docker daemon
eval "$(minikube -p mini-commerce docker-env)"
docker build -t mini-commerce/bff:local     -f apps/bff/Dockerfile .
docker build -t mini-commerce/bff-dev:local -f apps/bff/Dockerfile --target dev .
docker build -t mini-commerce/web:local     -f apps/web/Dockerfile \
  --build-arg BFF_INTERNAL_URL=http://bff:3001 \
  --build-arg VISUALIZER_INTERNAL_URL=http://visualizer-3d:80 \
  --build-arg NEXT_PUBLIC_VISUALIZER_URL=http://localhost:3002 .
docker build -t mini-commerce/visualizer-3d:local apps/visualizer-3d
eval "$(minikube -p mini-commerce docker-env --unset)"

# 3. Apply (load restrictor off: the otel config lives in infra/observability/)
kubectl kustomize --load-restrictor LoadRestrictionsNone infra/k8s \
  | kubectl --context mini-commerce apply -f -
kubectl --context mini-commerce -n mini-commerce rollout restart \
  deploy/bff deploy/web deploy/visualizer-3d
kubectl --context mini-commerce -n mini-commerce rollout status deploy/bff
```

`bff-dev` is the BFF dev stage. The `bff` pod runs it as an init container
for `prisma migrate deploy` + `prisma db seed` (both idempotent), mirroring
what `./dev up` does in a one-off container.

After a cluster restart the API reports pre-stop pod readiness until the
kubelet resyncs, so `rollout status` alone can pass too early. `k8s:up`
therefore waits until every pod turns Ready after the cluster start before
it applies anything.

## Teardown

```bash
./dev k8s:down                                                   # stop, keep everything
kubectl --context mini-commerce delete namespace mini-commerce   # drop app + Postgres PVC
minikube delete -p mini-commerce                                 # remove the cluster entirely
```
