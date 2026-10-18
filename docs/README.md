# Documentation hub

> Status: Reviewed against HEAD 800ac16 by a fresh reader.

Each fact lives in one doc; this hub only points to them. New here? Start
with the [root README](../README.md), then
[local-development.md](local-development.md).

| Need                                                    | Doc                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Run the stack, walkthrough, troubleshoot                | [local-development.md](local-development.md)                                               |
| Look up a command                                       | [cli-reference.md](cli-reference.md)                                                       |
| Look up HTTP, config, data, integrations, or builds     | [reference/README.md](reference/README.md)                                                 |
| Run on minikube, monitor, troubleshoot                  | [minikube-runbook.md](minikube-runbook.md)                                                 |
| What the system does today                              | [project-state/current-system.md](project-state/current-system.md)                         |
| Architecture (containers, BFF, web, OTel)               | [architecture/README.md](architecture/README.md)                                           |
| Trace checkout, visualization, or performance execution | [architecture/processes.md](architecture/processes.md)                                     |
| Performance jobs (`./dev perf:*`)                       | [performance/orchestrator.md](performance/orchestrator.md)                                 |
| Punch engine docs (reference guide)                     | [architecture/punch-implementation.md](architecture/punch-implementation.md)               |
| Tests, ownership, CI gates                              | [quality-strategy/README.md](quality-strategy/README.md)                                   |
| Branching, PRs, definition of done                      | [lifecycle/README.md](lifecycle/README.md)                                                 |
| Open threads and shipped iterations                     | [next-steps/README.md](next-steps/README.md)                                               |
| Why a decision was made                                 | [adr/README.md](adr/README.md)                                                             |
| Design specs                                            | [specs/](specs/), [superpowers/specs/](superpowers/specs/)                                 |
| Manual acceptance                                       | [uat/walkthrough-uat.md](uat/walkthrough-uat.md), [uat/web-app-uat.md](uat/web-app-uat.md) |
| 3D visualizer art rules                                 | [visualizer/art-direction.md](visualizer/art-direction.md)                                 |
| Check documentation coverage and evidence gaps          | [coverage.md](coverage.md), [findings.md](findings.md), [unknowns.md](unknowns.md)         |

## Authoring rules

- English for all durable content.
- No credentials or secrets.
- No AI attribution, generated-by text, or co-author trailers.
- One canonical home per fact; indexes summarize, never restate.
- Diagrams are Mermaid source in Markdown; do not add PNG copies.
- `project-state/` and `architecture/` describe current behavior. ADRs record
  decisions. Update descriptive pages when behavior changes; supersede accepted
  ADRs with a new decision rather than rewriting their history.
