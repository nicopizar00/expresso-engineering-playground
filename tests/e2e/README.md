# tests/e2e

End-to-end tests for the mini-commerce playground, powered by
[Playwright](https://playwright.dev/).

## Scope

- **Golden paths only.** Load catalog → add to cart → checkout → manage order.
- **No regression coverage here.** Unit and integration tests own that.
- Runs against an ephemeral stack started from `infra/docker/compose.yaml`.

## Layout (next iteration)

```
tests/e2e/
├── playwright.config.ts
├── tests/
│   ├── catalog-browse.spec.ts
│   ├── checkout-happy-path.spec.ts
│   └── order-management.spec.ts
└── fixtures/
```

## Why a separate workspace package

E2E tests have their own dependency footprint (browsers, Playwright) that
should not leak into application packages.

## Next iteration TODOs

- [ ] Add Playwright with TypeScript config.
- [ ] Wire `webServer` to spin up `apps/web` + `apps/bff` for the run.
- [ ] Add a single `@smoke` tagged test that CI runs on every PR.
