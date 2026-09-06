# Use-case catalog

Single official source of truth for user-facing workflows, shared by the
product surface and the load-test tooling. Defined by
[`docs/specs/executable-use-cases-and-live-traffic.md`](../docs/specs/executable-use-cases-and-live-traffic.md)
(SPEC-001 and SPEC-002).

## Files

| File | Purpose |
|---|---|
| `catalog.json` | The catalog itself. Machine-readable, versioned. |
| `catalog.schema.json` | JSON Schema validating `catalog.json`. |
| `README.md` | This file — human-readable presentation and maintenance rules. |

## Current use cases

| id | domain | title | loadEnabled | concurrency |
|---|---|---|---|---|
| `commerce.catalog-browse` | commerce | Catalog browse | yes | safe |
| `commerce.cart-edit` | commerce | Cart edit | yes | max 1 VU (shared cart state) |
| `commerce.purchase` | commerce | Purchase | yes | max 1 VU (shared cart state) |
| `commerce.order-lookup` | commerce | Order lookup | yes | safe |
| `commerce.order-fulfillment` | commerce | Order fulfillment | yes | safe, one dedicated order per iteration |
| `visualization.observe-state` | visualization | Observe state | yes | safe |
| `visualization.subscribe-live` | visualization | Subscribe live | yes | safe |

`commerce.cart-edit` and `commerce.purchase` stay capped at one virtual user
until cart state is isolated per session (SPEC-006). Don't raise
`maxVirtualUsers` for either without that isolation landing first.

## Identifier conventions

- **Use-case id**: `domain.workflow-name` — lowercase, one dot, kebab-case
  workflow segment (e.g. `commerce.cart-edit`). Stable for the life of the
  workflow; a replaced use case is marked `"status": "deprecated"` and points
  at its replacement via `"replacedBy"`, it is never renamed or reused for
  different behavior.
- **Action id**: `object.action` — lowercase, one dot, snake_case on both
  sides (e.g. `cart.item_added`). A different namespace from the use-case id
  above: it names one ordered step inside a workflow, not the workflow
  itself. Past tense for a completed step, present tense only when the use
  case declares the step as ongoing. `metadata` on an action is optional and,
  when present, is a flat list of identifier/count field names — never a
  full entity payload. Full convention:
  [`executable-use-cases-and-live-traffic.md`](../docs/specs/executable-use-cases-and-live-traffic.md#spec-001-canonical-use-case-catalog)
  ("User-action identifier convention").

## Maintenance rules (SPEC-002)

- A change to user-facing workflow behavior MUST update `catalog.json` in
  the same change set — don't let a behavior change land without its
  catalog entry.
- Every active, load-enabled entry MUST resolve to exactly one executable
  adapter (`adapter` field). An adapter, in turn, MUST reference an existing
  catalog id and version — never invent an adapter for an id that isn't
  here, and never point a campaign config at a deprecated id.
- CI validates `catalog.json` against `catalog.schema.json`, and validates
  that adapters and campaign configs only reference ids/versions that exist
  and are active here.
- Ownership is explicit per entry (`owner`) so review can be routed to the
  right domain team.
- The catalog describes user-observable behavior only. Leave out transport,
  controller, database, and framework details unless one is required to
  understand a constraint (e.g. the shared-cart concurrency cap above).

## Adapters

Adapter ids currently declared in the catalog (`k6.<workflow-slug>`, second
segment of the use-case id) are the target identifiers for SPEC-011's
delivery step 2 ("extract current k6 flows into adapters identified by
catalog entries"). The k6 scenario library at
[`tests/performance/k6/`](../tests/performance/k6/) does not yet expose one
script per adapter id — that extraction is pending, tracked by the spec
above, not implied to already exist.
