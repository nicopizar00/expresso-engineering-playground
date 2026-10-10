# Documentation Hub

Each fact lives in one doc; this hub only points to them. New here? Start
with the [root README](../README.md), then
[local-development.md](local-development.md).

| Need                                      | Doc                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Run the stack, walkthrough, troubleshoot  | [local-development.md](local-development.md)                                               |
| Look up a command                         | [cli-reference.md](cli-reference.md)                                                       |
| What the system does today                | [project-state/current-system.md](project-state/current-system.md)                         |
| Architecture (containers, BFF, web, OTel) | [architecture/README.md](architecture/README.md)                                           |
| Performance workflows (`./dev perf:*`)    | [performance/orchestrator.md](performance/orchestrator.md)                                 |
| Tests, ownership, CI gates                | [quality-strategy/README.md](quality-strategy/README.md)                                   |
| Branching, PRs, definition of done        | [lifecycle/README.md](lifecycle/README.md)                                                 |
| Open threads and shipped iterations       | [next-steps/README.md](next-steps/README.md)                                               |
| Why a decision was made                   | [adr/README.md](adr/README.md)                                                             |
| Design specs                              | [specs/](specs/), [superpowers/specs/](superpowers/specs/)                                 |
| Manual acceptance                         | [uat/walkthrough-uat.md](uat/walkthrough-uat.md), [uat/web-app-uat.md](uat/web-app-uat.md) |
| 3D visualizer art rules                   | [visualizer/art-direction.md](visualizer/art-direction.md)                                 |
| AI assistants (which one, lanes, rules)   | [ai/README.md](ai/README.md)                                                               |

## Authoring rules

- English for all durable content.
- No real company, product, or service names, URLs, IPs, or credentials.
- No AI attribution, generated-by text, or co-author trailers.
- One canonical home per fact; indexes summarize, never restate.
- Diagrams are Mermaid in-source — no PNGs.
- `project-state/` and `architecture/` describe what _is_; ADRs describe
  _why_. When a decision changes, update both.
