# Minikube runbook

Plain `minikube`, `docker`, and `kubectl` steps to run the stack (`postgres`,
`bff`, `otel-collector`, `web`, `visualizer-3d`) on a local minikube cluster
and keep an eye on it. Run everything from the repo root. What each manifest
deploys: [`infra/k8s/README.md`](../infra/k8s/README.md).

## 0. Prerequisites

- Docker Desktop running, with ~4 GB RAM allocated.
- `brew install minikube` (installs `kubectl` too).
- The compose stack stopped (`docker compose -f infra/docker/compose.yaml down`):
  it competes for Docker's RAM and the 3000–3002 ports.

## 1. Start the cluster

```bash
minikube start -p mini-commerce --driver=docker --container-runtime=docker \
  --cpus=4 --memory=3072
kubectl config set-context --current --namespace=mini-commerce
```

`--container-runtime=docker` is required for step 2 (minikube ≥ 1.39
defaults to containerd). `minikube start` switches `kubectl` to this cluster
but resets its namespace to `default`, so re-run the `set-context` line after
every start.

## 2. Build the images inside the cluster

```bash
eval "$(minikube -p mini-commerce docker-env)"
docker build -t mini-commerce/bff:local     -f apps/bff/Dockerfile .
docker build -t mini-commerce/bff-dev:local -f apps/bff/Dockerfile --target dev .
docker build -t mini-commerce/web:local     -f apps/web/Dockerfile \
  --build-arg BFF_INTERNAL_URL=http://bff:3001 \
  --build-arg VISUALIZER_INTERNAL_URL=http://visualizer-3d:80 \
  --build-arg NEXT_PUBLIC_VISUALIZER_URL=http://localhost:3002 .
docker build -t mini-commerce/visualizer-3d:local apps/visualizer-3d
eval "$(minikube -p mini-commerce docker-env --unset)"
```

The manifests use `imagePullPolicy: Never`, so pods only run images built
this way. The first build takes a few minutes.

## 3. Deploy

```bash
kubectl kustomize --load-restrictor LoadRestrictionsNone infra/k8s | kubectl apply -f -
kubectl get pods -w
```

Stop watching (Ctrl+C) once all five pods show `1/1 Running`. The `bff` pod
first runs `prisma migrate deploy` and `prisma db seed` as init containers.

## 4. Open it

In a second terminal:

```bash
kubectl port-forward svc/web 3000:3000 &
kubectl port-forward svc/bff 3001:3001 &
kubectl port-forward svc/visualizer-3d 3002:80 &
```

| URL                   | Service                               |
| --------------------- | ------------------------------------- |
| http://localhost:3000 | web (embeds the visualizer at `/viz`) |
| http://localhost:3001 | bff                                   |
| http://localhost:3002 | visualizer-3d standalone              |

Quick check: `curl localhost:3001/health` returns `"status":"ok"`.
Stop the forwards with `pkill -f "kubectl port-forward"`. A forward is tied
to one pod — re-run it after a redeploy or cluster restart.

## 5. Redeploy after a code change

Rebuild only the changed image (step 2 commands, inside the `docker-env`
block), then restart its deployment:

```bash
kubectl rollout restart deployment/bff
kubectl rollout status deployment/bff
```

| Changed                         | Rebuild                 | Restart                    |
| ------------------------------- | ----------------------- | -------------------------- |
| `apps/bff/src`                  | `bff`                   | `deployment/bff`           |
| `apps/bff/prisma` (schema/seed) | `bff` and `bff-dev`     | `deployment/bff`           |
| `apps/web`                      | `web`                   | `deployment/web`           |
| `apps/visualizer-3d`            | `visualizer-3d`         | `deployment/visualizer-3d` |
| `infra/k8s/*.yaml` only         | nothing — re-run step 3 | applied automatically      |

## 6. Stop, resume, delete

```bash
minikube stop -p mini-commerce                     # pause; images and data are kept
minikube start -p mini-commerce                    # resume, then:
kubectl config set-context --current --namespace=mini-commerce
kubectl get pods -w                                # wait for 1/1 Running again
minikube delete -p mini-commerce                   # remove everything, data included
```

Right after a resume, pods can briefly show `Error` or `0/1` while the
kubelet restarts the containers the stop killed. That is expected.

## Monitor

| Check     | Command                                    | Healthy                                       |
| --------- | ------------------------------------------ | --------------------------------------------- |
| Cluster   | `minikube -p mini-commerce status`         | host, kubelet, apiserver all `Running`        |
| Pods      | `kubectl get pods`                         | every pod `1/1 Running`, RESTARTS not growing |
| API       | `curl localhost:3001/health`               | `"status":"ok"` (needs step 4)                |
| Pod usage | `kubectl top pods`                         | well under each pod's memory limit            |
| Node RAM  | `minikube -p mini-commerce ssh -- free -m` | `available` above ~500 MB                     |

`kubectl top` needs the metrics-server addon, enabled once per cluster:
`minikube -p mini-commerce addons enable metrics-server` (metrics appear
after about a minute).

```bash
kubectl get pods -w                              # live pod state changes
kubectl logs -f deploy/bff | grep -v /health     # BFF logs minus probe noise
kubectl logs deploy/bff -c migrate-seed          # last migrate + seed run
kubectl logs <pod> --previous                    # output of the crashed container
kubectl get events --sort-by=.lastTimestamp | tail -20
kubectl describe pod <pod>                       # probes, Last State, scheduling
kubectl exec -it postgres-0 -- psql -U playground -d mini_commerce_playground
```

No trace backend runs in minikube, so `otel-collector` logs repeated
`Exporting failed ... otlp/tempo` retries. That is expected.

## Troubleshoot

| Symptom                                        | Likely cause                        | Fix                                                                        |
| ---------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `No resources found in default namespace`      | Namespace reset by `minikube start` | `kubectl config set-context --current --namespace=mini-commerce`           |
| `ErrImageNeverPull`                            | Image not built inside the cluster  | Step 2, then `kubectl rollout restart deployment/<name>`                   |
| `docker-env` error about the container runtime | Cluster created with containerd     | `minikube delete -p mini-commerce`, then step 1                            |
| bff stuck in `Init:0/2`                        | Postgres not ready                  | `kubectl logs deploy/bff -c wait-for-postgres`; check `postgres-0`         |
| bff `Init:CrashLoopBackOff`                    | Migration or seed failed            | `kubectl logs deploy/bff -c migrate-seed`                                  |
| `CrashLoopBackOff`                             | App fails at startup                | `kubectl logs <pod> --previous`                                            |
| `OOMKilled` under Last State in `describe`     | Memory limit too low                | Raise it in `infra/k8s/<svc>.yaml`, then step 3                            |
| Pod `Pending`                                  | Node out of CPU or RAM              | Events in `kubectl describe pod <pod>`; free Docker RAM                    |
| `port-forward`: `address already in use`       | Compose or an old forward holds it  | `pkill -f "kubectl port-forward"`; stop compose                            |
| `port-forward`: `lost connection to pod`       | Pod was replaced                    | Re-run the step 4 command for that service                                 |
| Cluster will not start or behaves oddly        | Broken minikube state               | `minikube -p mini-commerce logs \| tail -50`; last resort: delete + step 1 |

## Further reading

Advanced settings (cluster sizing, drivers, addons, resource limits,
debugging) are covered by the official docs:

- minikube: [Get started](https://minikube.sigs.k8s.io/docs/start/) ·
  [Docker driver](https://minikube.sigs.k8s.io/docs/drivers/docker/) ·
  [Configuration](https://minikube.sigs.k8s.io/docs/handbook/config/) ·
  [Pushing images](https://minikube.sigs.k8s.io/docs/handbook/pushing/) ·
  [Accessing apps](https://minikube.sigs.k8s.io/docs/handbook/accessing/) ·
  [Persistent volumes](https://minikube.sigs.k8s.io/docs/handbook/persistent_volumes/) ·
  [Addons](https://minikube.sigs.k8s.io/docs/commands/addons/) ·
  [Troubleshooting](https://minikube.sigs.k8s.io/docs/handbook/troubleshooting/)
- Kubernetes: [kubectl quick reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/) ·
  [Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/) ·
  [Port forwarding](https://kubernetes.io/docs/tasks/access-application-cluster/port-forward-access-application-cluster/) ·
  [Deployments and rollouts](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) ·
  [Resource requests and limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) ·
  [Resource metrics (`kubectl top`)](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/) ·
  [Debug pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/) ·
  [Debug running pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)

The repo's `./dev k8s:*` commands automate steps 1–4 and 6; see
[`infra/k8s/README.md`](../infra/k8s/README.md).
