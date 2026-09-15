# Real-Stack E2E Certification for Single-Cup Live Order Rain

Status: Proposed

Normative parent:
[Synchronized Single-Cup Order Visualizer and Live Order Rain](synchronized-single-cup-order-visualizer-and-live-rain.md)

## Purpose

Define the executable evidence required to certify the complete product flow:

```text
select one Cup of Coffee
  -> see one foreground cup
  -> Place Order anonymously
  -> foreground cup disappears
  -> exactly one background cup falls
```

The certification also proves that the always-on rain observes an order created
by the one main k6 scenario without exposing k6's in-progress cart, HTTP
requests, or iteration lifecycle in the scene.

## Certification principles

- Tests MUST use the real Web App, BFF, PostgreSQL, and port-`3002` Visualizer
  service.
- Homepage and `/visualizer` MUST exercise the real embedded canonical
  renderer, not a test replacement.
- Assertions MUST use stable semantic identities and read-only diagnostics.
- Screenshots MAY supplement but MUST NOT replace semantic assertions.
- Product-flow proof and performance-scenario proof MUST remain separate test
  cases.
- The only shared outcome is an ordinary persisted order entering the BFF
  projection.
- A passing test MUST NOT require a name, payment transition, Prepare Order
  action, workflow-traffic endpoint, or k6 webhook.

## Definitions

- **Baseline**: captured BFF revision, active selection, placed-order total,
  recent order identities, and per-surface renderer diagnostics before an
  action.
- **Surface set**: standalone port `3002`, homepage embed, and `/visualizer`
  embed.
- **Foreground proof**: all surfaces expose the same non-null selection identity
  and exactly one foreground cup.
- **Rain proof**: each connected surface records exactly one newly spawned rain
  event for a specific new order identity.
- **Healthy idle**: the rain layer is enabled and its domain transport is
  connected, but no synthetic cups are emitted while no order is placed.
- **Eventual bound**: a repository-defined timeout based on readiness and
  transport behavior, not an arbitrary fixed sleep.

## Certification boundary

The suite MUST start or target:

- the Web App;
- the BFF;
- PostgreSQL;
- the canonical `visualizer-3d` service on port `3002`;
- the one supported k6 scenario only for its dedicated test.

The suite MUST NOT:

- stub the BFF snapshot or SSE stream;
- inject Three.js objects directly;
- call diagnostics to mutate state;
- post fabricated order, workflow, or rain events;
- substitute React markup for the canonical renderer;
- require camera coordinates or frame-perfect animation equality.

## CERT-001: Real-stack readiness and renderer identity

### Requirements

- Wait for all product services to report ready.
- Open all three surfaces before capturing the baseline.
- Wait for each renderer's real domain subscription to become connected.
- Record each renderer build/instance identity and last applied BFF revision.
- Prove homepage and `/visualizer` use the same build/instance served by the
  standalone port-`3002` service.
- Fail if a surface loads a second scene implementation or a mock transport.

### Acceptance criteria

- All required services are healthy.
- All surfaces report the same canonical renderer build/instance.
- All surfaces converge on one BFF semantic revision.
- Camera or animation-phase differences do not fail this check.

## CERT-002: Always-on healthy idle and strict catalog

### Requirements

- Begin with an empty cart and no active interactive selection.
- Assert that `GET /products` returns exactly one active product named
  **Cup of Coffee**.
- Assert that all surfaces report:
  - rain enabled;
  - domain transport connected;
  - no foreground selection;
  - no newly spawned rain cup during a quiet observation window.
- The UI MUST expose one product and no quantity or variant controls.

### Acceptance criteria

- Zero application activity does not disable or pause the rain transport.
- Idle time creates zero synthetic cups.
- Exactly one Cup of Coffee can be selected.

## CERT-003: Strict selection and foreground synchronization

### Requirements

- Select Cup of Coffee through the real Web App.
- Capture the resulting selection identity and BFF revision.
- Wait until the full surface set applies that revision or a later one carrying
  the same selection.
- Assert exactly one foreground hero cup per surface.
- Assert that the hero cup is not counted as rain.
- Attempt invalid behavior through the public API:
  - add the cup a second time;
  - request quantity `0` or `2`;
  - add an unknown product;
  - remove, replace, or reset the selected cup.
- Assert each invalid attempt fails without changing the valid one-cup state.
- Assert the UI exposes Place Order as the only normal continuation.

### Acceptance criteria

- All surfaces agree on one active selection identity.
- No surface renders more than one hero cup.
- Invalid attempts cannot broaden or corrupt the cart.
- No order or rain cup exists yet.

## CERT-004: Anonymous Place Order is the terminal action

### Requirements

- Assert the Web App contains no customer/recipient name field.
- Invoke Place Order through the Web App without supplying or synthesizing a
  name, and assert that a request containing a name field is rejected.
- Capture the returned immutable order identity and `placedAt`.
- Assert one order containing one Cup of Coffee at quantity `1` was persisted.
- Assert the cart and correlated active selection were cleared.
- Assert no payment, preparation, fulfillment, or other terminal action was
  invoked.

### Acceptance criteria

- Place Order succeeds anonymously.
- The BFF placed-order total increases by exactly one.
- The exact new order identity appears once in the recent-order projection.
- The product flow returns to its initial state and can be repeated.

## CERT-005: Foreground-to-rain transition

### Requirements

- Correlate the order from CERT-004 with renderer diagnostics.
- Wait for all surfaces to remove the selected foreground identity.
- Wait for exactly one rain spawn for the new `orderId`/`placedAt` pair on each
  connected surface.
- Assert the BFF revision and placed-order total converge on all surfaces.
- Replay an unchanged snapshot or tolerate a duplicate SSE delivery and assert
  no duplicate rain spawn.

### Acceptance criteria

- The foreground cup disappears.
- Exactly one background cup falls per surface for the order.
- The order is never represented as two rain events on one surface.
- No request or action before successful Place Order created a rain cup.

## CERT-006: Repeatability

### Requirements

- Repeat the complete interactive sequence once:
  select, observe foreground, and Place Order.
- Use a new selection identity and expect a new order identity.
- Preserve the same strict one-cup constraints.

### Acceptance criteria

- The second flow begins only after the first returned to idle.
- The placed-order total increases by exactly one again.
- Each surface sees one additional rain identity and no duplicate of the first.

## CERT-007: k6 separation and final-order rain

### Requirements

- Reset to an empty cart and no active Web App selection.
- Start exactly one VU and one iteration of `single-cup-order`.
- Assert the scenario uses ordinary catalog, cart, and Place Order APIs only.
- Assert it does not call an interactive-selection endpoint or a
  workflow-traffic/performance callback.
- During catalog and cart steps, assert:
  - no active foreground identity appears;
  - no rain identity appears.
- After its successful Place Order, capture the persisted order identity.
- Assert that identity enters the same BFF placed-order projection and creates
  exactly one rain spawn per connected surface.

### Acceptance criteria

- k6 creates one order and no foreground hero.
- k6 iteration/request identity never appears in product diagnostics.
- Its successful final order creates exactly one background cup per surface.
- The product test remains functional when k6/Punch is absent.

## CERT-008: Failure and idempotency behavior

### Requirements

- Attempt Place Order with an empty or invalid cart and assert failure.
- Assert failed placement changes neither placed-order total nor rain
  identities.
- Retry one successful Place Order using the same idempotency key, when
  supported.
- Assert the retry does not create another order or rain event.

### Acceptance criteria

- Failure creates zero orders and zero cups.
- An idempotent retry preserves exactly-one order and exactly-one rain event.
- Error handling requests never become rain.

## CERT-009: Reconnect, replay, and bounded rendering

### Requirements

- Record seen rain identities and placed-order total.
- Reconnect one surface's domain transport and reapply the current snapshot.
- Assert semantic convergence without respawning already seen identities.
- Create a bounded burst of valid orders using the supported one-VU flow.
- Assert active and queued Three.js objects never exceed configured limits.
- Assert every new order identity is eventually accounted for and no order is
  silently sampled under the declared supported rate.

### Acceptance criteria

- Reconnect does not duplicate rain.
- The final BFF total and each surface's observed identities agree.
- Renderer bounds hold without disabling the rain layer.
- Completed animation objects may be recycled without losing historical count.

## CERT-010: Testability and evidence contract

### Requirements

Each surface MUST expose read-only diagnostics containing:

- renderer build/instance identity;
- transport state and last applied BFF revision;
- active selection identity or `null`;
- placed-order total and recent order identities;
- seen rain identities;
- spawned, active, queued, completed, and dropped rain counts;
- configured object and queue limits.

On failure, the suite MUST retain:

- failing step and URL;
- order and selection identities, if any;
- BFF snapshot/revision;
- renderer diagnostics for all surfaces;
- relevant browser console/network failures;
- k6 summary only for CERT-007;
- screenshots or traces when available.

Diagnostics MUST be production-inert and MUST NOT expose a state mutation hook.

## CERT-011: Isolation and cleanup

### Requirements

- Test data MUST be isolated by a deterministic database reset, namespace, or
  equivalent repository-supported mechanism.
- Tests MUST not assume historic order count is zero without first establishing
  a controlled baseline.
- Cleanup MUST terminate test-owned browsers and processes.
- Cleanup MUST NOT delete unrelated developer data or processes.
- A failed test MUST preserve enough evidence to diagnose the failure before
  cleanup removes transient state.

## Certification matrix

| Product requirement | Required proof |
| --- | --- |
| One product, one cup | CERT-002, CERT-003 |
| Anonymous terminal Place Order | CERT-004, CERT-008 |
| Foreground selection synchronization | CERT-003, CERT-005 |
| One order creates one rain cup | CERT-005, CERT-006 |
| Rain always connected | CERT-002, CERT-009 |
| Same port-3002 renderer | CERT-001 |
| k6/product separation | CERT-007 |
| Replay and capacity safety | CERT-008, CERT-009 |
| Actionable evidence | CERT-010, CERT-011 |

## Pass and status rules

- **Pass**: every required acceptance criterion passes against the real stack.
- **Fail**: any required criterion fails, any mock/fabricated event is used, or
  any surface cannot prove its renderer identity.
- **Blocked**: the suite cannot start a required real service. Blocked is not a
  pass and the infrastructure cause MUST be reported.
- **Flaky**: a rerun changes the result without a code/configuration change.
  Flaky is not a pass until its cause is resolved.

## Delivery sequence

1. Add stable diagnostics without adding test-only state mutation.
2. Certify renderer identity and healthy idle.
3. Certify strict selection and anonymous Place Order.
4. Certify exact foreground-to-rain transition and repeatability.
5. Certify the separate one-scenario k6 path.
6. Certify retry, reconnect, replay, bounds, evidence, and cleanup.

## Out of scope

- Payment-provider behavior.
- Prepare Order or fulfillment status.
- Generic HTTP-request visualization.
- k6 iteration visualization or performance webhooks.
- Multiple products or quantities.
- Frame-perfect visual comparison.
- Synthetic scene-event injection.
