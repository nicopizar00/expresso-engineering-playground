# tests/contract

Consumer-driven contract tests using [Pact](https://docs.pact.io/).

## Roles

- **Consumer** — `apps/web` (and any future client of the BFF).
- **Provider** — `apps/bff`.
- **Source of truth** — schemas in `packages/contracts`.

## Why contract tests

Contract tests are the cheap way to catch the class of bugs that would
otherwise only surface in E2E: a provider rename, a removed field, a changed
status code. They run in seconds and gate cross-boundary changes before E2E
ever has to run.

## Layout (next iteration)

```
tests/contract/
├── consumer/                 # consumer tests producing pacts
│   └── bff-client.pact.test.ts
├── provider/                 # provider verification against the BFF
│   └── bff.provider.test.ts
└── pacts/                    # generated; gitignored
```

## Phase 3 relevance

When a domain module is extracted out of `apps/bff` into its own service,
the same pacts continue to apply — the new service just becomes a new
provider in the same Pact broker. This is the main reason contract tests
land in the structural skeleton.
