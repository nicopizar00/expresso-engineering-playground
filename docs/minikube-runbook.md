# Minikube runbook

Day-to-day use and minimal monitoring of the minikube deployment (`core` +
`web` + `viz`). What gets deployed, and the manual steps behind each
command, live in [`infra/k8s/README.md`](../infra/k8s/README.md).

Every command below targets the `mini-commerce` profile and namespace.
Define this once per shell:

```bash
alias k='kubectl --context mini-commerce -n mini-commerce'
```

## Use

```bash
./dev down            # compose and minikube share Docker's RAM and the ports
./dev k8s:up          # start cluster, build, deploy, wait until ready
./dev k8s:forward     # terminal 1: localhost:3000/3001/3002 (Ctrl+C stops)
./dev smoke           # terminal 2: expect "All 23 smoke checks passed."
```

| Situation                         | Command                                     |
| --------------------------------- | ------------------------------------------- |
| Changed app code                  | `./dev k8s:up` (rebuilds and restarts apps) |
| Changed only `infra/k8s/*.yaml`   | `./dev k8s:up --no-build`                   |
| Done for the day                  | Ctrl+C the forward, then `./dev k8s:down`   |
| Resume (images and data are kept) | `./dev k8s:up --no-build`                   |
| Back to compose                   | `./dev k8s:down`, then `./dev up`           |

## Monitor

### Health at a glance

| Check     | Command                                    | Healthy                                       |
| --------- | ------------------------------------------ | --------------------------------------------- |
| Cluster   | `minikube -p mini-commerce status`         | host, kubelet, apiserver all `Running`        |
| Pods      | `./dev k8s:status`                         | every pod `1/1 Running`, RESTARTS not growing |
| App       | `./dev smoke` (with `k8s:forward` up)      | `All 23 smoke checks passed.`                 |
| Pod usage | `k top pods`                               | well under the limits below                   |
| Node RAM  | `minikube -p mini-commerce ssh -- free -m` | `available` above ~500 MB                     |

`k top` needs the metrics-server addon, enabled once per cluster:
`minikube -p mini-commerce addons enable metrics-server` (metrics appear
after about a minute). Memory limits: `bff`, `web`, `postgres` 512Mi;
`otel-collector` 256Mi; `visualizer-3d` 64Mi.

### Dig in

```bash
k get pods -w                                  # live pod state changes
k logs -f deploy/bff | grep -v /health         # BFF logs minus probe noise
k logs deploy/bff -c migrate-seed              # last migrate + seed run
k logs <pod> --previous                        # output of the crashed container
k get events --sort-by=.lastTimestamp | tail -20
k describe pod <pod>                           # probes, Last State, scheduling
k exec -it postgres-0 -- psql -U playground -d mini_commerce_playground
```

No trace backend runs in minikube: `otel-collector` logs repeated
`Exporting failed ... otlp/tempo` retries, which is expected. For Tempo,
Prometheus and Grafana use the compose stack (`./dev up obs`).

## Troubleshoot

| Symptom                                          | Likely cause                     | Fix                                                                |
| ------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------ |
| `ErrImageNeverPull`                              | Image not built into the cluster | `./dev k8s:up`                                                     |
| bff stuck in `Init:0/2`                          | Postgres not ready               | `k logs deploy/bff -c wait-for-postgres`; check `postgres-0`       |
| bff `Init:CrashLoopBackOff`                      | Migration or seed failed         | `k logs deploy/bff -c migrate-seed`                                |
| `CrashLoopBackOff`                               | App fails at startup             | `k logs <pod> --previous`                                          |
| `OOMKilled` under Last State in `k describe pod` | Memory limit too low             | Raise it in `infra/k8s/<svc>.yaml`, then `./dev k8s:up --no-build` |
| Pod `Pending`                                    | Node out of CPU or RAM           | Events in `k describe pod <pod>`; free Docker RAM (`./dev down`)   |
| `k8s:forward`: `Port N ... is in use`            | Compose stack holds the port     | `./dev down`                                                       |
| `k8s:forward`: `unavailable — retrying`          | Pod restarting or initializing   | Nothing; it reconnects. Watch with `k get pods -w`                 |
| Cluster will not start or behaves oddly          | Broken minikube state            | `minikube -p mini-commerce logs \| tail -50`; last resort below    |

Last resort — destroys the cluster, its images, and the Postgres data:

```bash
minikube delete -p mini-commerce && ./dev k8s:up
```
