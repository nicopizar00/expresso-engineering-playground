# Documentation coverage

This ledger records documentation coverage for commit
`800ac16506b91b3d69ca852f9098a106e865692e`. Counts were measured from the
committed tree on 2026-10-14. They will drift as code changes.

The documents describe committed behavior. They do not establish that a
deployment is running or that an external service is reachable.

## Surface coverage

| Surface                                                | Denominator at HEAD | Owner                             | Status                                           |
| ------------------------------------------------------ | ------------------: | --------------------------------- | ------------------------------------------------ |
| Application runtime entry points                       |                   3 | `project-state/current-system.md` | Reviewed                                         |
| Web application routes                                 |                   1 | `architecture/web-entry-point.md` | Reviewed                                         |
| Web application sections                               |                   4 | `architecture/web-entry-point.md` | Reviewed                                         |
| BFF feature modules                                    |                   8 | `architecture/bff-modules.md`     | Reviewed                                         |
| BFF controllers                                        |                  10 | `reference/http-api.md`           | Reviewed                                         |
| BFF HTTP and SSE routes                                |                  20 | `reference/http-api.md`           | Reviewed                                         |
| `./dev` commands                                       |                  30 | `cli-reference.md`                | Reviewed                                         |
| Performance workflows                                  |                   9 | `reference/build-and-deploy.md`   | Reviewed; detailed existing guide review pending |
| Runtime configuration names                            |                  39 | `reference/configuration.md`      | Reviewed                                         |
| Operational CLI flag names, excluding help and aliases |                  13 | `cli-reference.md`                | Reviewed                                         |
| Prisma models                                          |                   7 | `reference/data-and-state.md`     | Reviewed                                         |
| Prisma migrations                                      |                   9 | `reference/data-and-state.md`     | Reviewed                                         |
| Integration families                                   |                  17 | `reference/integrations.md`       | Reviewed                                         |
| pnpm workspace package directories                     |                   9 | `reference/build-and-deploy.md`   | Reviewed                                         |
| Dockerfiles                                            |                   5 | `reference/build-and-deploy.md`   | Reviewed                                         |
| Main Compose services                                  |                   9 | `reference/build-and-deploy.md`   | Reviewed                                         |
| Performance Compose services                           |                   3 | `reference/build-and-deploy.md`   | Reviewed                                         |
| CI jobs                                                |                  10 | `reference/build-and-deploy.md`   | Reviewed                                         |
| Kubernetes performance workflows                       |                   9 | `reference/build-and-deploy.md`   | Reviewed                                         |
| Argo CD Applications                                   |                   2 | `reference/build-and-deploy.md`   | Reviewed                                         |

Scheduled jobs have a denominator of zero. No application scheduler or
Kubernetes `CronJob` is wired at this commit. Queue consumers also have a
denominator of zero. Visualization changes use an in-process observable and
server-sent events.

## Count commands

These commands reproduce the committed-tree survey. Here, `HEAD` denotes the
pinned commit above. The fresh review inspected an immutable export of that
commit and the reviewed reference inventories. Working implementation changes
and ignored files did not contribute to the denominators.

```sh
git rev-parse HEAD
git ls-tree -r --name-only HEAD
git grep -n -E '@Controller' HEAD 'apps/bff/src/modules/**/*.controller.ts'
git grep -n -E '@(Get|Post|Put|Patch|Delete|Sse)' HEAD 'apps/bff/src/modules/**/*.controller.ts'
git show HEAD:scripts/pg/cli.py
git show HEAD:apps/bff/prisma/schema.prisma
git ls-tree -r --name-only HEAD apps/bff/prisma/migrations
git show HEAD:infra/docker/compose.yaml
git show HEAD:infra/docker/compose.performance.yaml
git show HEAD:pnpm-workspace.yaml
git ls-tree -r --name-only HEAD apps packages tests
git ls-tree -r --name-only HEAD | rg '(^|/)(Dockerfile|[^/]+\.Dockerfile)$'
git show HEAD:.github/workflows/ci.yml
git ls-tree -r --name-only HEAD infra/k8s/perf/punch/workflows
git grep -n '^kind: Application$' HEAD infra/argocd/applications
git show HEAD:.gitmodules
git ls-tree HEAD vendor/punch
```

Configuration discovery started from this candidate search, then inspected
every matching first-party runtime or deployment file with
`git show HEAD:<path>`:

```sh
git grep -l -E 'process\.env|os\.environ|getenv\(|\$\{|env\(|NEXT_PUBLIC_|VIZ_API_|BASE_URL|OTEL_|K6_|DATABASE_URL|POSTGRES_' HEAD ':!docs/**' ':!**/*.spec.*' ':!**/*.test.*' ':!vendor/**'
```

Integration discovery used this candidate search and then verified wiring and
failure behavior in the owning source files:

```sh
git grep -n -E 'https?://|wss?://|fetch\(|PrismaClient|DATABASE_URL|OTEL_|PROMETHEUS|TEMPO|GRAFANA|image:|repository:|kind: (Application|Workflow)|apiVersion: argoproj|registry' HEAD ':!pnpm-lock.yaml' ':!docs/**' ':!**/*.spec.*' ':!**/*.test.*'
```

## Document status

`Reviewed` requires a fresh reader who checks the document against `HEAD`.
Author self-review does not change a status from `Drafted` to `Reviewed`.

| Document                               | Kind                      | Status                   | Review evidence                                                                                                                                               |
| -------------------------------------- | ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                            | Reference index           | Reviewed                 | Fresh reader checked links and authoring boundaries.                                                                                                          |
| `project-state/current-system.md`      | Descriptive               | Reviewed                 | Fresh reader traced topology, sessions, checkout, caches, visualization, and deployment wiring.                                                               |
| `architecture/README.md`               | Reference index           | Reviewed                 | Fresh reader checked linked owners, diagram routing, and historical decision boundary.                                                                        |
| `architecture/processes.md`            | Descriptive               | Reviewed                 | Fresh reader traced all three diagrams; distinguished local validation from cluster submission and the Punch gitlink boundary.                                |
| `architecture/web-entry-point.md`      | Descriptive               | Reviewed                 | Fresh reader checked the single route, four sections, rewrites, embed messaging, cookie flow, demo mode, and failure behavior.                                |
| `architecture/bff-modules.md`          | Descriptive               | Reviewed                 | Fresh reader checked eight feature modules, three core modules, 26 import edges, route ownership, state, events, and startup behavior.                        |
| `architecture/containers.md`           | Descriptive               | Reviewed                 | Fresh reader checked nine Compose services, CLI target and profile boundaries, request topology, telemetry edges, watch scope, and five Kubernetes workloads. |
| `architecture/observability.md`        | Descriptive               | Existing, review pending | No fresh review recorded for this campaign.                                                                                                                   |
| `architecture/orchestrator-python.md`  | Descriptive               | Existing, review pending | No fresh review recorded for this campaign.                                                                                                                   |
| `architecture/punch-implementation.md` | Reference index           | Existing, review pending | No fresh review recorded for this campaign; internal sources require the pinned submodule.                                                                    |
| `performance/orchestrator.md`          | Descriptive and reference | Existing, review pending | Workflow denominator verified in the build reference; detailed engine claims require separate review.                                                         |
| `reference/README.md`                  | Reference index           | Reviewed                 | Fresh reader checked all links and reconciled inventory counts with reviewed leaves and committed sources.                                                    |
| `reference/http-api.md`                | Reference                 | Reviewed                 | Fresh reader checked all 20 controller routes, validation, response shapes, cookies, and failure behavior.                                                    |
| `reference/configuration.md`           | Reference                 | Reviewed                 | Fresh reader reconciled 39 unique direct-read keys, defaults, parsing, and deployment inputs.                                                                 |
| `reference/data-and-state.md`          | Descriptive and reference | Reviewed                 | Fresh reader checked seven models, nine migrations, cache behavior, seed state, and idempotency boundaries.                                                   |
| `reference/integrations.md`            | Reference                 | Reviewed                 | Fresh reader checked all 17 families, activation, wiring, and failure claims.                                                                                 |
| `reference/build-and-deploy.md`        | Reference                 | Reviewed                 | Fresh reader checked workspace, Docker, Compose, CI, Kubernetes workflow, and Argo Application counts and build behavior.                                     |
| `cli-reference.md`                     | Reference                 | Reviewed                 | Fresh reader checked all 30 commands, 13 operational flags, parser behavior, and launchers.                                                                   |
| `coverage.md`                          | Reference ledger          | Reviewed                 | Fresh reader reconciled denominators, owner status, review banners, and remaining work.                                                                       |
| `findings.md`                          | Working note              | Reviewed                 | Fresh reader verified source locations and separated inferred concurrency behavior from reproduced results.                                                   |
| `unknowns.md`                          | Working note              | Reviewed                 | Fresh reader checked the gitlink SHA and the parent-source, deployment, capacity, and ownership evidence boundaries.                                          |

## Outstanding work

- Review the existing architecture and performance owners marked review pending
  before treating their detailed claims as freshly verified.
- Inspect the pinned Punch checkout before documenting internal dataset
  replacement, deletion, and cluster artifact guarantees.
