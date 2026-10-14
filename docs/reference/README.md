# System reference

> Status: Reviewed against HEAD 800ac16 by a fresh reader.

This index routes maintainers and operators to exhaustive contracts measured
from commit `800ac16506b91b3d69ca852f9098a106e865692e`. These documents describe
committed behavior. They do not prove that an external deployment is running.

| Need                                           | Reference                               |                                                             Measured coverage |
| ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------: |
| Call the BFF                                   | [HTTP API](http-api.md)                 |                                                        20 HTTP and SSE routes |
| Configure a runtime or workflow                | [Configuration](configuration.md)       |                                               39 first-party direct-read keys |
| Understand persisted and in-memory state       | [Data and state](data-and-state.md)     |                                              7 Prisma models and 9 migrations |
| Trace external boundaries and failure behavior | [Integrations](integrations.md)         |                                                       17 integration families |
| Build artifacts or deploy a topology           | [Build and deploy](build-and-deploy.md) |     9 workspace packages, 5 Dockerfiles, 10 CI jobs, and deployment manifests |
| Invoke repository commands                     | [CLI reference](../cli-reference.md)    | 30 `./dev` commands and 13 operational flag names, excluding help and aliases |

The [coverage ledger](../coverage.md) records denominators, count commands,
review status, and outstanding work. [Findings](../findings.md) records behavior
that may require an owner decision. [Unknowns](../unknowns.md) records claims
that the committed parent tree cannot establish.
