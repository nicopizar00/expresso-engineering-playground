# tests/integration

Cross-module integration tests for the BFF, powered by Vitest.

## Scope

Tests that exercise more than one module of `apps/bff` together, or that
involve real infrastructure dependencies (PostgreSQL via testcontainers,
in-memory message bus, etc.). They sit between unit tests (inside each
package) and E2E tests (in `tests/e2e`).

## Examples (planned)

- `booking → orders` — confirming a booking creates the right order record.
- `booking → notifications` — confirming a booking emits a notification event.
- `trips → booking` — holding a leg locks availability.

## Next iteration TODOs

- [ ] Add Vitest + testcontainers wiring.
- [ ] Add a Postgres fixture using the same image as `infra/docker/compose.yaml`.
- [ ] Add the first three integration tests listed above.
