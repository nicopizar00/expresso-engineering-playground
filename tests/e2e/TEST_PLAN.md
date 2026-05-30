# Expresso Playwright Test Plan

## Application Metadata

- Target URL: `E2E_BASE_URL` with fallback to `http://localhost:3100`.
- Authentication: no login required for storefront flows.
- Stack observed in repo: Next.js 14, React 18, Node/BFF APIs through `/api/bff`.
- Test language: TypeScript with Playwright.
- First automation slice: MVC-01, Catalog to cart to checkout to order management.

## Most Valuable Cases

| Rank | Flow | Business value | Primary success signal |
| --- | --- | --- | --- |
| MVC-01 | Catalog browse -> add to cart -> checkout -> order detail -> order action | Direct revenue path and core product proof | Shopper can place an order and see/manage its persisted status |
| MVC-02 | Order lookup/list -> order detail -> status transition/cancel | Retention and operational trust after purchase | User can find an order and valid actions update visible status |
| MVC-03 | Performance playground -> scenario selection -> service health inspection | Developer confidence and system observability | Reviewer can run scenarios and inspect metrics without backend ambiguity |

## MVC-01 Flow Map

1. Open Product Catalog.
2. Confirm product list and category filters render.
3. Add an in-stock product to the cart.
4. Open the cart drawer and verify line item, quantity, and subtotal.
5. Continue to checkout from the cart drawer.
6. Verify checkout summary and disabled submit state before required input.
7. Enter customer name and place order.
8. Land on order detail with success banner, customer, total, line items, and `Pending` status.
9. Trigger `Start Preparing` and verify the status changes to `Preparing`.

## MVC-01 Edge Cases

| Risk area | Edge case | Expected behavior | Automation approach |
| --- | --- | --- | --- |
| Catalog API | `GET /catalog/products` fails or returns empty | Error or empty state with recovery path | Planned negative spec with route fulfillment |
| Cart mutation | Add-to-cart request fails | Cart count does not increment; user-facing error should be added | Planned after toast/error UX exists |
| Cart state | Cart is empty on direct `/checkout` visit | Checkout redirects or shows empty-cart guidance | Planned direct checkout spec |
| Form validation | Customer name is blank | `Place Order` remains disabled | Covered in MVC-01 spec |
| Checkout API | Network drop during `POST /checkout` | User remains on checkout and sees retryable error | Covered with `route.abort()` |
| Checkout API | 400 or 409 response | Domain-specific alert shown | Planned API-status matrix |
| Responsive layout | Mobile viewport cannot access cart/checkout | Same journey works on mobile Chrome profile | Covered in MVC-01 spec |
| Order action | Manage-order request fails | Status remains unchanged and error is visible | Planned negative order-action spec |

## Coverage Matrix

| Area | Happy path | Negative path | Responsive | Network mocking |
| --- | --- | --- | --- | --- |
| Catalog | MVC-01 | Planned API empty/error | Desktop, mobile | `GET /catalog/products` |
| Cart drawer | MVC-01 | Planned mutation failure | Desktop, mobile | `GET /cart`, `POST /cart/items` |
| Checkout | MVC-01 | Blank name, network drop | Desktop, mobile | `POST /checkout` |
| Order detail | MVC-01 | Planned not found/manage failure | Desktop, mobile | `GET /orders/:id`, `POST /orders/:id/manage` |
| Orders list/lookup | MVC-02 planned | Empty list, invalid ID | Desktop, mobile | `GET /orders` |
| Performance playground | MVC-03 planned | Scenario stop/error states | Desktop, mobile | Frontend fixtures only |

## Risk Analysis

- The E2E package currently has a placeholder Playwright setup. The scripts below assume `@playwright/test` and a future `playwright.config.ts` are wired in `tests/e2e`.
- Tests mock `/api/bff` at the browser boundary for deterministic CI. A smaller nightly suite should also run against the real Docker stack to catch contract and infrastructure drift.
- The product cards have strong accessible names for add-to-cart buttons, but repeated item names across page regions can become ambiguous. Specs scope assertions to drawer, checkout, or order regions where possible.
- Order management is available to all users in the playground. A production app should split shopper and staff authorization flows.

## Execution Model

Recommended CLI once Playwright is installed in `tests/e2e`:

```bash
pnpm --filter @mini-commerce/e2e exec playwright test tests/checkout-happy-path.spec.ts --workers=4
```

Recommended config traits for the next iteration:

- `fullyParallel: true`
- projects for Desktop Chrome and Mobile Chrome
- `baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100"`
- `trace: "retain-on-failure"`, `screenshot: "only-on-failure"`, `video: "retain-on-failure"`
- `webServer` that starts `pnpm pg:dev` or targets an already running stack
