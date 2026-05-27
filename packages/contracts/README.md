# @mini-commerce/contracts

Source of truth for **wire-level** contracts between deployables.

## What lives here

- **TypeScript wire-format interfaces** for the current BFF HTTP surface,
  consumed by `apps/web`.

## Planned additions

- **OpenAPI** documents for the BFF HTTP surface.
- **JSON Schema** for future domain events.
- **Pact** consumer/provider verification under `tests/contract`.

## Why a dedicated package

When a module is eventually extracted out of `apps/bff` into its own
service (Phase 3 of the architecture vision), the contract becomes the
**only** thing that has to remain stable. Co-locating it here means the
contract is versioned independently of any one deployable.

## Next iteration TODOs

- [ ] Add `openapi/bff.yaml` describing the public BFF surface.
- [ ] Add `events/*.schema.json` for catalog and order events.
- [ ] Decide whether generated OpenAPI types replace or validate the current
  TypeScript interfaces.
