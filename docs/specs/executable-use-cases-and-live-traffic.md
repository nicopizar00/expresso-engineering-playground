# Executable Use Cases and Live Traffic Visualization

Status: Proposed

## Purpose

This specification defines a single maintained catalog of user-facing use cases that can be executed as load-test workflows and visualized as live traffic in the 3D Visualizer.

The design covers three capabilities:

1. Run and repeat selected use cases from custom load-test configuration.
2. Maintain an official, versioned list of executable use cases shared by the product and load-test tooling.
3. Show live use-case traffic in the 3D Visualizer as coffee cups falling from the sky.

## Current baseline

- The repository contains k6 scenarios for smoke, checkout, read-heavy, load, and stress testing.
- Scenario selection and load profiles are partly hardcoded. The Python performance runner exposes only a subset of the available scripts.
- There is no canonical use-case catalog. Workflows are duplicated in individual scripts and can drift from application behavior.
- The 3D Visualizer consumes domain-state snapshots. It does not receive workflow traffic, use-case identity, iteration outcome, or timing data.
- Cart state is process-local and shared. Cart-changing and purchase workflows are therefore not safe for concurrent virtual users.

The current performance boundary is documented in [`tests/performance/k6/README.md`](../../tests/performance/k6/README.md). The existing visualization stream is implemented by [`visualization.controller.ts`](../../apps/bff/src/modules/visualization/visualization.controller.ts), with the 3D scene in [`scene.js`](../../apps/visualizer-3d/public/scene.js).

## Requirement language

`MUST` identifies behavior required for acceptance. `SHOULD` identifies the preferred behavior unless a documented constraint prevents it. `MAY` identifies optional behavior.

## SPEC-001: Canonical use-case catalog

### Goal

Provide one official, machine-readable source of truth for user-facing workflows.

### Requirements

- The repository MUST contain a root-level `use-cases/` catalog with:
  - `catalog.json` containing the entries.
  - `catalog.schema.json` validating the format.
  - `README.md` presenting the catalog for people and documenting maintenance rules.
- Every use case MUST define:
  - A stable identifier and integer version.
  - Title, domain, business intent, owner, and lifecycle status.
  - Ordered user actions, each with a stable `object.action` identifier (see "User-action identifier convention" below), and expected outcome.
  - Preconditions and required test data.
  - Whether the workflow is enabled for load testing.
  - Its concurrency constraints.
  - Its executable adapter identifier.
  - Its visual identity, such as cup color or lane.
- Use-case identifiers MUST NOT be silently renamed or reused for different behavior.
- A replaced use case MUST be marked deprecated and identify its replacement.
- The catalog MUST describe user-observable behavior. Transport, controller, database, and framework details SHOULD be omitted unless required to understand a constraint.

### Acceptance criteria

- A person can find all supported executable workflows without reading test scripts.
- A tool can validate and enumerate the same workflows from the catalog.
- Duplicate identifiers, invalid versions, and incomplete entries fail validation.
- Every action inside a catalog entry resolves to a unique `object.action` identifier, and a malformed identifier or an oversized metadata field fails validation.

### User-action identifier convention

Each ordered user action MUST carry a stable identifier alongside its plain-language description, distinct from the use-case identifier of the workflow it belongs to.

- Format: `object.action`, lowercase, `[a-z0-9_.]` only, exactly one dot. `object` is the domain entity acted on (`product`, `cart`, `order`, `catalog`). `action` is a snake_case verb, past tense for a completed step (`added`, `viewed`, `placed`), present tense only for a step the use case declares as ongoing.
- The identifier MUST stay stable across catalog versions describing the same real action. A changed real action gets a new identifier rather than a silently redefined one, mirroring the use-case identifier rule above.
- Metadata is OPTIONAL and MAY accompany an action only when an adapter, telemetry consumer, or the Visualizer needs a field beyond the identifier itself (for example `product_id`, `qty`). Metadata MUST be a flat list or object of identifiers and counts, never a full entity payload.
- This identifier is a different namespace from the use-case identifier (`domain.workflow-name`) at the top of a catalog entry: it names one step inside that workflow, not the workflow itself.

Example (subset of `commerce.cart-edit`):

```json
{
  "id": "commerce.cart-edit",
  "version": 1,
  "actions": [
    { "id": "product.selected", "description": "Select an available product." },
    { "id": "cart.item_added", "description": "Add the product to the cart.", "metadata": ["product_id", "qty"] },
    { "id": "cart.viewed", "description": "Review the cart." },
    { "id": "cart.item_updated", "description": "Change item quantity or remove an item.", "metadata": ["product_id", "qty"] },
    { "id": "cart.verified", "description": "Verify the updated cart." }
  ]
}
```

## SPEC-002: Catalog governance and drift prevention

### Goal

Keep the catalog official, current, and executable as the application changes.

### Requirements

- A change to user-facing workflow behavior MUST update the catalog in the same change set.
- Every active, load-enabled catalog entry MUST resolve to exactly one executable adapter.
- Every load-test workflow adapter MUST reference an existing catalog identifier and supported version.
- Load configuration MUST NOT reference missing or deprecated use cases.
- Continuous integration MUST validate the catalog, adapter references, and configuration examples.
- Human-readable catalog documentation SHOULD be generated from the machine-readable source to prevent duplicate maintenance.
- Catalog ownership MUST be explicit so review can be requested from the responsible product or domain team.

### Acceptance criteria

- CI rejects a catalog entry without an adapter when `loadEnabled` is true.
- CI rejects an adapter whose use-case identifier or version is unknown.
- CI rejects load configuration that selects a deprecated use case.
- The official list and the executable list cannot pass CI while disagreeing.

## SPEC-003: Custom load campaign configuration

### Goal

Allow operators to select, mix, and repeat use cases without modifying load-test source code.

### Requirements

- The load runner MUST accept a versioned campaign configuration file.
- The configuration MUST support:
  - Run identifier and target environment.
  - Selected use-case identifiers and versions.
  - Relative traffic weights or an explicit iteration sequence.
  - Executor type, duration, iterations, virtual users, arrival rate, and ramp stages as applicable.
  - Think-time policy.
  - Test-data or fixture references.
  - Per-use-case and campaign-level thresholds.
  - Run tags.
  - Visualization enablement and event-sampling limits.
- Operators MUST be able to change the selected workflows and load profile without editing scenario scripts.
- The runner MUST validate the entire campaign before generating traffic.
- Unknown, disabled, deprecated, incompatible, or concurrency-unsafe selections MUST fail preflight with an actionable message.
- Environment variables MAY override explicitly documented deployment values such as the target URL, but MUST NOT create an undocumented second configuration model.

### Example

```json
{
  "schemaVersion": 1,
  "runId": "morning-rush",
  "target": "http://host.docker.internal:3001",
  "profile": {
    "executor": "ramping-arrival-rate",
    "stages": [
      { "duration": "30s", "target": 10 },
      { "duration": "2m", "target": 50 },
      { "duration": "30s", "target": 0 }
    ]
  },
  "useCases": [
    { "id": "commerce.catalog-browse", "version": 1, "weight": 60 },
    { "id": "commerce.purchase", "version": 1, "weight": 25 },
    { "id": "commerce.order-lookup", "version": 1, "weight": 15 }
  ],
  "visualization": {
    "enabled": true,
    "maxEventsPerSecond": 20
  }
}
```

### Acceptance criteria

- Two different valid campaign files can run different workflow mixes through the same runner entry point.
- A profile change takes effect without a script change.
- Invalid configuration fails before any request reaches the system under test.

## SPEC-004: Executable complex workflows

### Goal

Execute each catalog use case as an ordered, stateful workflow rather than as unrelated endpoint calls.

### Requirements

- A workflow adapter MUST implement the ordered actions defined by its catalog entry.
- One iteration MUST maintain a workflow context for captured values such as product, cart, and order identifiers.
- An action MAY branch based on user-observable results when the branch is declared by the use case.
- Each required action MUST define its success check.
- A failed required action MUST fail the workflow iteration and prevent invalid dependent actions from running.
- The runner MUST measure workflow success, failure, and total duration in addition to request-level metrics.
- The runner MUST tag workflow metrics with run identifier, use-case identifier, and use-case version.
- The same adapter MUST be reusable under smoke, load, stress, or custom profiles.

### Acceptance criteria

- A purchase iteration can browse the catalog, select a product, add it to the cart, place an order, capture the order identifier, and verify that order.
- Failure of checkout is reported as a failed purchase workflow, not merely as an isolated failed request.
- Metrics can be grouped by stable use-case identifier and version.

## SPEC-005: Iteration, selection, and reporting

### Goal

Make campaigns repeatable and their results comparable.

### Requirements

- The runner MUST select workflows according to the configured weights or sequence.
- Each selected workflow MUST be repeatable for the configured campaign lifetime.
- Test-data selection SHOULD avoid accidental contention unless contention is the purpose of the campaign.
- A run MUST produce a stable summary containing:
  - Campaign and run identifiers.
  - Catalog and use-case versions.
  - Iteration counts by use case.
  - Success and failure counts by use case.
  - Workflow-duration statistics by use case.
  - Threshold results.
- Reports MUST preserve enough identity to compare runs that used the same workflow versions.

### Acceptance criteria

- Reported iteration totals match the workflow events emitted for the run, subject only to documented visualization sampling.
- Results clearly separate catalog browsing, purchasing, order lookup, and other selected workflows.

## SPEC-006: Concurrency safety

### Goal

Prevent misleading or destructive load runs when application state is not isolated per simulated user.

### Requirements

- Each catalog entry MUST declare whether it is concurrency-safe and any maximum virtual-user limit.
- Preflight MUST reject a campaign that exceeds a selected use case's declared limit.
- `commerce.cart-edit` and `commerce.purchase` MUST initially declare a maximum of one virtual user while cart state remains shared.
- A dedicated order MUST be assigned to each concurrent fulfillment iteration.
- The concurrency restriction MAY be removed only after cart state is isolated per session or simulated user and verified under concurrent execution.

### Acceptance criteria

- A purchase campaign requesting more than one virtual user is rejected under the current cart model.
- Read-only use cases can still execute concurrently.
- The failure message identifies the constrained use case and its allowed limit.

## SPEC-007: Live workflow traffic event contract

### Goal

Expose measured workflow traffic to the 3D Visualizer without changing the application requests being measured.

### Requirements

- The load runner MUST emit workflow lifecycle data through a telemetry path separate from the system-under-test request path.
- Emitting visualization data MUST NOT add an application request to each measured workflow.
- The event stream MUST support short-window aggregation at high traffic rates.
- Each traffic event or aggregate MUST include:
  - Run identifier.
  - Use-case identifier and version.
  - Event timestamp.
  - Count represented by the event.
  - Outcome: started, succeeded, or failed.
  - Workflow duration when complete.
- The live feed MUST distinguish workflow traffic from the existing domain-state snapshot feed.
- Disconnecting the Visualizer MUST NOT interrupt or fail the load campaign.
- Reconnecting clients SHOULD receive current run metadata and only new traffic, not replay the full animation history.

### Acceptance criteria

- A running campaign produces traffic events tagged with the configured use cases.
- Disabling visualization leaves load behavior and measured application traffic unchanged.
- Visualizer disconnection has no effect on campaign completion.

## SPEC-008: Falling coffee-cup visualization

### Goal

Represent live use-case traffic as coffee cups falling from the sky in the 3D Visualizer.

### Requirements

- When a workflow starts or completes, the Visualizer MUST create a corresponding falling-cup representation according to the configured event semantics.
- Different use cases MUST be distinguishable through a stable combination of color, lane, label, or cup treatment defined by the catalog.
- Successful and failed outcomes MUST have visibly different landing or terminal treatments.
- At low rates, one cup SHOULD represent one workflow iteration.
- At high rates, one cup MAY represent multiple iterations and MUST expose the represented count.
- The visible fall rate MUST track observed workflow throughput within the configured sampling or aggregation limit.
- A heads-up display MUST show the active run, selected use-case mix, current throughput, and failures.
- Users MUST be able to pause or resume animation and clear current traffic objects without stopping the campaign.
- Existing product, cart, and order state visualization MUST remain available and visually distinct from traffic animation.

### Acceptance criteria

- Starting a mixed campaign causes visually distinct cups to fall for each selected use case.
- A failed workflow produces a visible failure treatment and increments the failure display.
- The displayed run and use-case identifiers match the campaign configuration.
- Pausing animation does not pause the load campaign or telemetry collection.

## SPEC-009: Visualization scale and resilience

### Goal

Keep live traffic understandable and the browser responsive under sustained load.

### Requirements

- The traffic adapter MUST enforce a configurable maximum visual event rate.
- Aggregation MUST preserve counts by use case and outcome.
- The Visualizer MUST bound the number and lifetime of rendered cup objects.
- Reuse through object pooling SHOULD be preferred to repeated unbounded allocation.
- A backlog MUST be bounded; old visual events MAY be compacted or discarded after their counts are reflected in the display.
- Telemetry loss or throttling MUST be visible as a degraded-data state and MUST NOT be presented as zero system traffic.

### Acceptance criteria

- A campaign above the visual event-rate limit remains responsive and shows aggregated counts.
- Rendered object count does not grow without bound during a long campaign.
- Event-stream interruption is shown as stale or disconnected rather than as a healthy idle run.

## SPEC-010: Initial official use-case list

The first catalog version MUST include the following use cases.

### `commerce.catalog-browse`

Intent: Explore products and view a selected product.

Main user actions:

1. List the product catalog.
2. Select an available product.
3. View the product details.

Expected outcome: The selected product is available and its details are displayed.

Concurrency: Safe for concurrent execution.

### `commerce.cart-edit`

Intent: Build and modify a shopping cart.

Main user actions:

1. Select an available product.
2. Add the product to the cart.
3. Review the cart.
4. Change item quantity or remove an item.
5. Verify the updated cart.

Expected outcome: The cart reflects the user's changes.

Concurrency: Maximum one virtual user until cart state is session-isolated.

### `commerce.purchase`

Intent: Complete a purchase and verify the resulting order.

Main user actions:

1. Browse the catalog.
2. Select a product.
3. Add the product to the cart.
4. Review the cart.
5. Place the order.
6. Capture the new order identifier.
7. View the order and verify its contents.

Expected outcome: An order is created with the selected item and the cart is cleared according to product behavior.

Concurrency: Maximum one virtual user until cart state is session-isolated.

### `commerce.order-lookup`

Intent: Review existing orders and inspect one order.

Main user actions:

1. List available orders.
2. Select an order.
3. View its details and status.

Expected outcome: The selected order is found and its details are displayed.

Concurrency: Safe when valid seeded order identifiers are available.

### `commerce.order-fulfillment`

Intent: Progress or cancel an order through its supported lifecycle.

Main user actions:

1. Select an eligible order.
2. Start preparation.
3. Mark the order prepared, or cancel it when cancellation is allowed.
4. Verify the resulting status.

Expected outcome: The order reaches the requested valid state.

Concurrency: Each iteration requires a dedicated order.

### `visualization.observe-state`

Intent: View the current commerce state in the 3D Visualizer.

Main user actions:

1. Open the Visualizer.
2. View products, cart contents, recent orders, and aggregate state.
3. Confirm that the scene reflects the latest available snapshot.

Expected outcome: The current domain state is represented in the scene.

Concurrency: Safe for concurrent read-only observation.

### `visualization.subscribe-live`

Intent: Keep the 3D Visualizer connected while commerce activity occurs.

Main user actions:

1. Open the Visualizer.
2. Subscribe to live updates.
3. Observe state and workflow traffic over time.
4. Recover from a temporary stream interruption.

Expected outcome: The scene remains current and reports connection degradation accurately.

Concurrency: Safe for multiple observers, subject to service capacity.

Health checks are campaign preflight operations, not user-facing use cases, and MUST remain outside this catalog.

## SPEC-011: Delivery sequence

Implementation SHOULD proceed in this order:

1. Add the catalog, schema, documentation, and validation.
2. Extract current k6 flows into adapters identified by catalog entries.
3. Add the custom campaign runner and stable reporting.
4. Enforce current concurrency constraints during preflight.
5. Add the separate workflow telemetry path and live traffic feed.
6. Add falling cups, aggregation, sampling, and object-lifetime controls to the Visualizer.
7. Isolate cart state per session before enabling concurrent cart and purchase campaigns.

## Out of scope

- Replacing k6 as the load-generation engine.
- Treating individual HTTP endpoints as official user-facing use cases.
- Sending per-iteration visualization requests through the system under test.
- Removing the existing domain-state visualization.
- Enabling concurrent purchase traffic before cart isolation is complete.
- Emitting per-action (sub-workflow) live telemetry events. SPEC-007's event contract stays workflow-level only; the `object.action` identifier exists for catalog and adapter step identity, not a new telemetry granularity.
