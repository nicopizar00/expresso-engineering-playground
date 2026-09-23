# Repository Bloat Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove completed planning artifacts, verified dead code and dependencies, and duplicated Playwright commerce mocks without changing product behavior or test expectations.

**Architecture:** Delete evidence-backed dead weight first, then replace five private Playwright mock implementations with one deliberately narrow in-memory commerce fixture. Preserve production interfaces and scenario assertions, verify each ownership boundary independently, and keep documentation and code line reductions separate.

**Tech Stack:** pnpm 9, Turborepo, TypeScript 5, Next.js 14, NestJS 10, Vitest 1, Playwright, Prisma 6, Python unittest, Docker Compose

**Spec:** `docs/superpowers/specs/2026-09-22-repo-bloat-reduction-design.md`

## Global Constraints

- Preserve every user-visible commerce, developer, performance, and visualizer feature.
- Preserve all BFF HTTP paths, response shapes, status transitions, failure behavior, and mutation ordering.
- Preserve Playwright test names, assertions, viewport coverage, product data, and visualizer HTML mocks.
- Preserve every design file under `docs/superpowers/specs/` and `docs/specs/`.
- Do not consolidate k6 scenarios or split large production components in this pass.
- Do not add a dependency, upgrade an unrelated package, pack lines, or reformat unrelated source.
- Keep all committed content in English and add no AI attribution.
- Report completed-plan deletion separately from maintained-code reduction.

## Review Focus

- A catalog failure must still render the existing product-fetch error state; `purchase.spec.ts` exercises this after fixture migration.
- An add-to-cart failure must stay visible without producing a browser console error; `frontend-certification.spec.ts` exercises this after fixture migration.
- A checkout network interruption must preserve cart context; `checkout-happy-path.spec.ts` exercises this after fixture migration.
- Cart and order status mutations must retain their sequence and response shapes; checkout, frontend-certification, and visual-integrity specs exercise these transitions.
- An API path the fixture does not own must return an explicit 404; Task 5 adds an assertion to `frontend-certification.spec.ts`.

---

### Task 1: Remove completed plans and establish the measurement record

**Files:**

- Delete: `docs/superpowers/plans/2026-09-06-live-workflow-traffic-and-falling-cups.md`
- Delete: `docs/superpowers/plans/2026-09-07-punch-submodule-integration.md`
- Delete: `docs/superpowers/plans/2026-09-07-single-cup-p0-domain-invariant.md`
- Delete: `docs/superpowers/plans/2026-09-08-cart-session-evolution.md`
- Delete: `docs/superpowers/plans/2026-09-08-placed-order-rain.md`
- Delete: `docs/superpowers/plans/2026-09-10-homepage-visualizer-stage.md`
- Delete: `docs/superpowers/plans/2026-09-11-single-page-app.md`
- Delete: `docs/superpowers/plans/2026-09-15-punch-k6-workflow-yaml-csv.md`
- Create: `goal-sloc.md`
- Preserve: `docs/superpowers/specs/**`
- Preserve: `docs/specs/**`

**Interfaces:**

- Consumes: the baseline measurements recorded in the approved design.
- Produces: a repository without completed execution checklists and a durable `goal-sloc.md` milestone log.

- [ ] **Step 1: Prove the historical plans have no inbound references and record the specification inventory**

Run:

```bash
rg -n "docs/superpowers/plans|superpowers/plans/" . -g '!docs/superpowers/plans/**' -g '!vendor/**'
find docs/superpowers/specs docs/specs -type f -name '*.md' -print | sort
```

Expected: the first command prints no inbound references; the second prints every preserved specification.

- [ ] **Step 2: Create the baseline measurement record**

Create `goal-sloc.md` with this exact initial content:

```markdown
# Repository Simplification Record

## Baseline

- Tracked raw lines: 57,408.
- Selected maintained-code raw lines (`ts`, `tsx`, `js`, `mjs`, `py`, `css`, `html`, `sh`): 22,932.
- Documentation raw lines: 21,893.
- Completed implementation-plan lines: 13,543 across eight files.
- Detected duplicated lines: 692 across maintained code and tests.

## Milestones

| Milestone | Documentation delta | Maintained-code delta | Verification                                                                                   |
| --------- | ------------------: | --------------------: | ---------------------------------------------------------------------------------------------- |
| Baseline  |                   0 |                     0 | 117 BFF tests, 48 Python tests, 19 selected Playwright tests passed; 1 Playwright test skipped |

## Final audit

Final measurements and the structural-versus-cosmetic classification are recorded after implementation verification.
```

- [ ] **Step 3: Delete only the eight completed plans**

Use `apply_patch` to delete the eight historical files listed in this task. Keep the active `2026-09-22-repo-bloat-reduction.md` plan until Task 6 has completed.

- [ ] **Step 4: Verify specifications were preserved**

Run:

```bash
git diff --name-status -- docs/superpowers/specs docs/specs
find docs/superpowers/plans -maxdepth 1 -type f -name '*.md' -print | sort
```

Expected: the first command has no output; the second lists only `docs/superpowers/plans/2026-09-22-repo-bloat-reduction.md`.

- [ ] **Step 5: Commit the documentation milestone**

```bash
git add goal-sloc.md docs/superpowers/plans
git commit -m "chore: remove completed implementation plans"
```

### Task 2: Remove backend placeholders and unused dependency declarations

**Files:**

- Delete: `apps/bff/src/modules/customers/customers.module.ts`
- Delete: `apps/bff/src/modules/notifications/notifications.module.ts`
- Modify: `apps/bff/src/app.module.ts`
- Modify: `apps/bff/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/architecture/bff-modules.md`

**Interfaces:**

- Consumes: the current Nest composition root in `apps/bff/src/app.module.ts` and workspace manifests.
- Produces: the same runtime module graph with no empty placeholder files and no unused direct dependency declarations.

- [ ] **Step 1: Capture the backend proof before deletion**

From the repository root, run:

```bash
rg -n "CustomersModule|NotificationsModule|customers\.module|notifications\.module" apps packages tests -g '!**/dist/**'
```

Then from `apps/bff`, run:

```bash
node_modules/.bin/vitest run
node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters
```

Expected: only the two empty module files, future-facing comments, and the composition-root comment reference the classes; 117 tests pass; TypeScript exits 0.

- [ ] **Step 2: Delete the empty modules and remove the stale composition-root comment**

Use `apply_patch` to delete both module files. In `apps/bff/src/app.module.ts`, delete this line:

```ts
// Not yet wired here: CustomersModule, NotificationsModule (placeholders only).
```

- [ ] **Step 3: Make architecture documentation describe future domains, not shipping files**

In `docs/architecture/bff-modules.md`:

1. Delete the `placeholder` Mermaid class definition.
2. Delete the `Customers` and `Notifications` nodes.
3. Replace dependency rule 3 with:

```markdown
3. **Future domains start with an ADR, not an empty module.** Customer and
   notification capabilities remain planned namespaces. Add their source
   modules only when the matching domain ships with behavior and tests.
```

- [ ] **Step 4: Remove unused direct dependencies without upgrading the lockfile**

Run from the repository root:

```bash
pnpm --filter @mini-commerce/bff remove -D @types/supertest supertest tsconfig-paths
pnpm remove -Dw next
pnpm install --offline --frozen-lockfile
```

Expected: the four direct declarations disappear; the existing `next` dependency remains in `apps/web/package.json`; install exits 0 without changing unrelated resolved versions.

- [ ] **Step 5: Verify the backend boundary**

From `apps/bff`, run:

```bash
node_modules/.bin/prisma generate
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
pnpm build
```

Then run from the repository root:

```bash
rg -n "CustomersModule|NotificationsModule|customers\.module|notifications\.module" apps packages tests -g '!**/dist/**'
```

Expected: generation, typecheck, all 117 tests, and build pass; the final search has no shipping-source hits.

- [ ] **Step 6: Commit the backend milestone**

```bash
git add apps/bff/src apps/bff/package.json package.json pnpm-lock.yaml docs/architecture/bff-modules.md
git commit -m "refactor: remove backend placeholder weight"
```

### Task 3: Remove unused frontend implementations and public surface

**Files:**

- Modify: `apps/web/src/components/system/ErrorBanner.tsx`
- Modify: `apps/web/src/components/system/LoadingSkeleton.tsx`
- Modify: `apps/web/src/components/system/README.md`
- Modify: `apps/web/src/lib/api/expresso-api.ts`
- Modify: `apps/web/src/lib/api/mock-data.ts`
- Modify: `apps/web/src/lib/performance/mock-performance-data.ts`
- Modify: `apps/web/src/lib/performance/performance-adapter.ts`
- Modify: `apps/bff/src/modules/visualization/visualization.types.ts`

**Interfaces:**

- Consumes: Knip candidates confirmed by repository-wide reference searches.
- Produces: the same used UI and adapter functions with dead implementations removed and internal-only types no longer exported.

- [ ] **Step 1: Reconfirm every dead export before editing**

Run:

```bash
rg -n "ErrorBanner|InlineError|configurePerformanceAdapter|getAdapterConfig|hasActiveScenario|getCurrentScenario|ExpressoApi|SceneAssetRef|SceneAssetParams|VisualizationItemType|shouldSimulateEmpty|MOCK_PRODUCTS|clearMockCart|PERFORMANCE_SCENARIOS|SERVICE_DISPLAY_NAMES" apps packages tests -g '!**/dist/**' -g '!**/.next/**'
```

Expected: the implementations have no external consumers; identifiers retained for internal use appear only in their defining file.

- [ ] **Step 2: Remove unused error components while preserving `PageErrorState`**

In `ErrorBanner.tsx`, keep the imports `AlertTriangle` and `RefreshCw`, delete `WifiOff` and `ServerCrash`, and delete:

- `ErrorVariant`
- `ErrorBannerProps`
- `variantConfig`
- `ErrorBanner`
- `InlineError`

The file must begin with:

```tsx
import { AlertTriangle, RefreshCw } from "lucide-react";

export function PageErrorState({
```

In `apps/web/src/components/system/README.md`, replace the component list entry with:

```markdown
- `LoadingSkeleton`, `EmptyState`, `PageErrorState` — design-system primitives.
```

- [ ] **Step 3: Narrow internal-only exports**

Make these declarations module-private by removing only their `export` keyword:

```ts
// apps/web/src/components/system/LoadingSkeleton.tsx
function LoadingSkeleton(
function ProductCardSkeleton(

// apps/web/src/lib/api/mock-data.ts
function shouldSimulateEmpty(
const MOCK_PRODUCTS
function clearMockCart(

// apps/web/src/lib/performance/mock-performance-data.ts
const PERFORMANCE_SCENARIOS
const SERVICE_DISPLAY_NAMES

// apps/bff/src/modules/visualization/visualization.types.ts
interface SceneAssetRef
type SceneAssetParams
type VisualizationItemType
```

Keep every internal call unchanged.

- [ ] **Step 4: Remove unused API type exports**

In `expresso-api.ts`, remove `OrderLine` and `OrderManageAction` from the contract import and re-export lists. Delete:

```ts
export type ExpressoApi = typeof expressoApi;
```

Keep `expressoApi` and all of its methods unchanged.

- [ ] **Step 5: Remove the unused performance adapter configuration subsystem**

From `performance-adapter.ts`:

1. Remove `isScenarioRunning` and `getActiveScenario` from the import list.
2. Delete `PerformanceAdapterConfig`, `DEFAULT_CONFIG`, `config`, `configurePerformanceAdapter`, and `getAdapterConfig`.
3. Delete `hasActiveScenario` and `getCurrentScenario`.
4. Preserve `fetchPerformanceSnapshot`, `fetchScenarios`, `runScenario`, `haltScenario`, and all formatting/color helpers.

- [ ] **Step 6: Verify the frontend boundary and affected runtime path**

Run:

```bash
apps/web/node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters -p apps/web/tsconfig.json
pnpm --filter @mini-commerce/web lint
pnpm exec playwright test tests/frontend-certification.spec.ts
```

Run the first two commands from the repository root and the Playwright command
from `tests/e2e`. Also run `node_modules/.bin/tsc --noEmit` from `apps/bff` to
check the narrowed visualization types. Expected: both TypeScript checks and
lint exit 0; all four frontend-certification cases pass.

- [ ] **Step 7: Commit the frontend milestone**

```bash
git add apps/web/src apps/bff/src/modules/visualization/visualization.types.ts
git commit -m "refactor: remove unused frontend surface"
```

### Task 4: Make formatting ignore generated output consistently

**Files:**

- Create: `.prettierignore`
- Modify: `apps/bff/package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/config/package.json`
- Modify: `packages/contracts/package.json`
- Modify: `packages/shared-types/package.json`
- Modify: `packages/test-utils/package.json`
- Modify: `tests/contract/package.json`
- Modify: `tests/e2e/package.json`
- Modify: `tests/integration/package.json`

**Interfaces:**

- Consumes: every workspace package's existing `prettier --check .` script.
- Produces: one shared ignore policy referenced from all package working directories.

- [ ] **Step 1: Capture the known formatter failure with generated trees present**

Run:

```bash
pnpm build
pnpm format
```

Expected before the change: build succeeds; format reports generated files below `apps/bff/dist/` and/or `apps/web/.next/`.

- [ ] **Step 2: Add the shared ignore policy**

Create `.prettierignore` with:

```gitignore
**/.next/
**/dist/
**/node_modules/
**/coverage/
tests/e2e/playwright-report/
tests/e2e/test-results/
tests/performance/k6/data/
tests/performance/k6/reports/
vendor/
```

- [ ] **Step 3: Point package format scripts at the shared policy**

In all nine package manifests listed above, change:

```json
"format": "prettier --check ."
```

to:

```json
"format": "prettier --check . --ignore-path ../../.prettierignore"
```

In `packages/config/package.json`, also change:

```json
"format:write": "prettier --write . --ignore-path ../../.prettierignore"
```

- [ ] **Step 4: Verify generated output is ignored without hiding tracked source**

Run:

```bash
pnpm format
pnpm --filter @mini-commerce/bff exec prettier --check src --ignore-path ../../.prettierignore
pnpm --filter @mini-commerce/web exec prettier --check app src --ignore-path ../../.prettierignore
```

Expected: all commands pass while the generated build trees from Step 1 remain present.

- [ ] **Step 5: Commit the formatter milestone**

```bash
git add .prettierignore apps/*/package.json packages/*/package.json tests/*/package.json
git commit -m "chore: ignore generated formatter inputs"
```

### Task 5: Consolidate Playwright commerce API mocks

**Files:**

- Create: `tests/e2e/fixtures/commerce-api.ts`
- Modify: `tests/e2e/tests/checkout-happy-path.spec.ts`
- Modify: `tests/e2e/tests/frontend-certification.spec.ts`
- Modify: `tests/e2e/tests/homepage-workspace.spec.ts`
- Modify: `tests/e2e/tests/purchase.spec.ts`
- Modify: `tests/e2e/tests/visual-integrity.spec.ts`

**Interfaces:**

- Consumes: `Page` and `Route` from Playwright plus each spec's `Product[]` fixture.
- Produces: `installCommerceApiMock(page: Page, options: CommerceApiMockOptions): Promise<void>` and shared `Money`, `Product`, `CartItem`, `Cart`, `OrderStatus`, and `Order` test types.

- [ ] **Step 1: Re-run the characterization suite before changing test infrastructure**

From `tests/e2e`, run:

```bash
pnpm exec playwright test tests/checkout-happy-path.spec.ts tests/frontend-certification.spec.ts tests/homepage-workspace.spec.ts tests/purchase.spec.ts tests/visual-integrity.spec.ts
```

Expected: 19 pass and one mobile test is intentionally skipped.

- [ ] **Step 2: Create the focused commerce fixture**

Create `tests/e2e/fixtures/commerce-api.ts` with:

```ts
import type { Page, Route } from "@playwright/test";

export type Money = {
  amountMinor: number;
  currency: string;
};

export type Product = {
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: "drink" | "food" | "accessory";
  price: Money;
  inventory: number;
};

export type CartItem = {
  itemId: string;
  productId: string;
  name: string;
  unitPrice: Money;
  quantity: number;
  lineTotal: Money;
};

export type Cart = {
  cartId: string;
  items: CartItem[];
  itemCount: number;
  total: Money;
  updatedAt: string;
};

export type OrderStatus = "pending" | "preparing" | "prepared" | "cancelled";

export type Order = {
  orderId: string;
  customerName: string | null;
  status: OrderStatus;
  lines: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: Money;
    lineTotal: Money;
  }>;
  total: Money;
  placedAt: string;
  updatedAt: string;
};

export type CommerceApiMockOptions = {
  products: readonly Product[];
  failCatalog?: boolean;
  failAddToCart?: boolean;
  checkoutFailure?: "network-drop";
};

const NOW = "2026-05-29T12:00:00.000Z";

export async function installCommerceApiMock(
  page: Page,
  options: CommerceApiMockOptions,
): Promise<void> {
  const currency = options.products[0]?.price.currency ?? "USD";
  let itemSequence = 1;
  let cartItems: CartItem[] = [];
  const orders = new Map<string, Order>();

  const money = (amountMinor: number): Money => ({ amountMinor, currency });
  const currentCart = (): Cart => ({
    cartId: "cart_e2e",
    items: cartItems,
    itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    total: money(
      cartItems.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0),
    ),
    updatedAt: NOW,
  });

  await page.addInitScript(() => {
    localStorage.removeItem("expresso_demo_mode");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const path = pathname.startsWith("/api/bff")
      ? pathname.slice("/api/bff".length) || "/"
      : pathname;

    if (
      method === "GET" &&
      (path === "/catalog/products" || path === "/api/products")
    ) {
      return options.failCatalog
        ? fulfillJson(route, 500, { message: "Catalog unavailable" })
        : fulfillJson(route, 200, { items: options.products });
    }

    const productMatch = path.match(/^\/catalog\/products\/([^/]+)$/);
    if (method === "GET" && productMatch?.[1]) {
      const product = options.products.find(
        (item) => item.productId === decodeURIComponent(productMatch[1]!),
      );
      return product
        ? fulfillJson(route, 200, product)
        : fulfillJson(route, 404, { message: "Product not found" });
    }

    if (method === "GET" && path === "/health") {
      return fulfillJson(route, 200, {
        status: "ok",
        service: "bff",
        version: "e2e",
        uptimeSeconds: 120,
        checks: { db: "ok" },
      });
    }

    if (method === "GET" && path === "/cart") {
      return fulfillJson(route, 200, currentCart());
    }

    if (method === "POST" && path === "/cart/items") {
      if (options.failAddToCart) {
        return fulfillJson(route, 500, { message: "cart unavailable" });
      }
      const body = request.postDataJSON() as {
        productId?: string;
        quantity?: number;
      } | null;
      const product = options.products.find(
        (item) => item.productId === body?.productId,
      );
      if (!product) {
        return fulfillJson(route, 404, { message: "Product not found" });
      }
      cartItems = upsertCartItem(
        cartItems,
        product,
        body?.quantity ?? 1,
        money,
        itemSequence++,
      );
      return fulfillJson(route, 201, currentCart());
    }

    const cartItemMatch = path.match(/^\/cart\/items\/([^/]+)$/);
    if (cartItemMatch?.[1] && method === "PATCH") {
      const itemId = decodeURIComponent(cartItemMatch[1]);
      const body = request.postDataJSON() as { quantity?: number } | null;
      cartItems = cartItems.map((item) => {
        if (item.itemId !== itemId) return item;
        const quantity = body?.quantity ?? item.quantity;
        return {
          ...item,
          quantity,
          lineTotal: money(item.unitPrice.amountMinor * quantity),
        };
      });
      return fulfillJson(route, 200, currentCart());
    }

    if (cartItemMatch?.[1] && method === "DELETE") {
      const itemId = decodeURIComponent(cartItemMatch[1]);
      cartItems = cartItems.filter((item) => item.itemId !== itemId);
      return fulfillJson(route, 200, currentCart());
    }

    if (method === "POST" && path === "/checkout") {
      if (options.checkoutFailure === "network-drop") {
        return route.abort("failed");
      }
      const cart = currentCart();
      if (cart.items.length === 0) {
        return fulfillJson(route, 400, { message: "Cart is empty" });
      }
      const body = request.postDataJSON() as { customerName?: string } | null;
      const order: Order = {
        orderId: `ord_e2e_${String(orders.size + 1).padStart(3, "0")}`,
        customerName: body?.customerName ?? null,
        status: "pending",
        lines: cart.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        total: cart.total,
        placedAt: NOW,
        updatedAt: NOW,
      };
      orders.set(order.orderId, order);
      cartItems = [];
      return fulfillJson(route, 201, {
        orderId: order.orderId,
        cartId: cart.cartId,
        customerName: order.customerName,
        status: order.status,
        total: order.total,
        placedAt: order.placedAt,
      });
    }

    if (method === "GET" && path === "/orders") {
      return fulfillJson(route, 200, { items: Array.from(orders.values()) });
    }

    const orderMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderMatch?.[1] && method === "GET") {
      const order = orders.get(decodeURIComponent(orderMatch[1]));
      return order
        ? fulfillJson(route, 200, order)
        : fulfillJson(route, 404, { message: "Order not found" });
    }

    const manageMatch = path.match(/^\/orders\/([^/]+)\/manage$/);
    if (manageMatch?.[1] && method === "POST") {
      const orderId = decodeURIComponent(manageMatch[1]);
      const order = orders.get(orderId);
      if (!order) {
        return fulfillJson(route, 404, { message: "Order not found" });
      }
      const body = request.postDataJSON() as {
        action?: "update_status" | "mark_prepared" | "cancel";
        nextStatus?: OrderStatus;
      } | null;
      const previousStatus = order.status;
      const status =
        body?.action === "mark_prepared"
          ? "prepared"
          : body?.action === "cancel"
            ? "cancelled"
            : (body?.nextStatus ?? order.status);
      const updated = { ...order, status, updatedAt: NOW };
      orders.set(orderId, updated);
      return fulfillJson(route, 202, {
        orderId,
        action: body?.action,
        previousStatus,
        status,
        acceptedAt: updated.updatedAt,
      });
    }

    return fulfillJson(route, 404, {
      message: `Unhandled mock route ${method} ${path}`,
    });
  });
}

function upsertCartItem(
  items: CartItem[],
  product: Product,
  quantity: number,
  money: (amountMinor: number) => Money,
  sequence: number,
): CartItem[] {
  const existing = items.find((item) => item.productId === product.productId);
  if (!existing) {
    return [
      ...items,
      {
        itemId: `ci_e2e_${String(sequence).padStart(3, "0")}`,
        productId: product.productId,
        name: product.name,
        unitPrice: product.price,
        quantity,
        lineTotal: money(product.price.amountMinor * quantity),
      },
    ];
  }
  return items.map((item) => {
    if (item.productId !== product.productId) return item;
    const nextQuantity = item.quantity + quantity;
    return {
      ...item,
      quantity: nextQuantity,
      lineTotal: money(item.unitPrice.amountMinor * nextQuantity),
    };
  });
}

function fulfillJson(
  route: Route,
  status: number,
  body: unknown,
): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 3: Migrate checkout and certification specs**

In both specs, import `installCommerceApiMock` and `type Product` from `../fixtures/commerce-api`, delete their private commerce types and route handlers, and keep their product arrays.

Use these calls:

```ts
// checkout-happy-path.spec.ts
await installCommerceApiMock(page, { products });
await installCommerceApiMock(page, {
  products,
  checkoutFailure: "network-drop",
});

// frontend-certification.spec.ts
await installCommerceApiMock(page, { products });
await installCommerceApiMock(page, { products, failAddToCart: true });
```

At the end of the certification test that covers shell navigation, add the explicit unknown-route check:

```ts
const unknownStatus = await page.evaluate(async () => {
  const response = await fetch("/api/bff/unhandled-fixture-probe");
  return response.status;
});
expect(unknownStatus).toBe(404);
```

Run from `tests/e2e`:

```bash
pnpm exec playwright test tests/checkout-happy-path.spec.ts tests/frontend-certification.spec.ts
```

Expected: all six cases pass.

- [ ] **Step 4: Migrate homepage and purchase specs**

In `homepage-workspace.spec.ts`, import the shared installer and `Product`, delete its private money/cart helpers, and reduce `installHomeMocks` to:

```ts
async function installHomeMocks(page: Page): Promise<void> {
  await installCommerceApiMock(page, { products });
  await page.route(/\/viz\/index\.html(\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/html",
      status: 200,
      body: [
        "<!doctype html>",
        "<html><head><title>Mock Visualizer</title>",
        "<style>html,body{margin:0;height:100%;background:#111;color:#fff;font-family:sans-serif;}",
        ".scene{position:absolute;inset:0;background:radial-gradient(circle at 30% 40%, #d4a574, #2a1810 70%);}",
        ".label{position:absolute;left:12px;bottom:12px;font-size:12px;opacity:.8;}",
        "</style></head>",
        "<body>",
        '<div class="scene"></div>',
        '<canvas width="640" height="480" aria-label="mock 3D scene"></canvas>',
        '<p class="label">live · 4 items</p>',
        "</body></html>",
      ].join(""),
    }),
  );
}
```

In `purchase.spec.ts`, import the shared installer as `installCommerceRoutes` and replace its private installer with:

```ts
async function installCommerceApiMock(
  page: Page,
  mode: ApiMockMode = "happy",
): Promise<void> {
  await installCommerceRoutes(page, {
    products,
    failCatalog: mode === "product-fetch-fails",
  });
}
```

Delete the duplicated types and cart helpers from both specs. Run from `tests/e2e`:

```bash
pnpm exec playwright test tests/homepage-workspace.spec.ts tests/purchase.spec.ts
```

Expected: six pass and one mobile test is intentionally skipped.

- [ ] **Step 5: Migrate visual-integrity without moving visual behavior**

Import the shared installer and `Product`, delete the private commerce state/types/helpers, and keep `cartButton`, `addProductAndOpenCheckout`, product data, and the visualizer route local. Start `installVisualMocks` with:

```ts
async function installVisualMocks(page: Page): Promise<void> {
  await installCommerceApiMock(page, { products });
  await page.route(/\/viz\/index\.html(\?.*)?$/, (route) =>
    route.fulfill({
      body: [
        "<!doctype html>",
        "<html><head><title>Mock Visualizer</title></head>",
        '<body style="margin:0;font-family:sans-serif;background:#fff;color:#111;">',
        '<main style="min-height:360px;display:grid;place-items:center;">',
        '<canvas width="640" height="360" aria-label="mock 3D scene"></canvas>',
        "<p>live · 4 items</p>",
        "</main>",
        "</body></html>",
      ].join(""),
      contentType: "text/html",
      status: 200,
    }),
  );
}
```

Run from `tests/e2e`:

```bash
pnpm exec playwright test tests/visual-integrity.spec.ts
```

Expected: all seven visual-integrity cases pass.

- [ ] **Step 6: Verify the complete fixture boundary and duplication reduction**

Run:

```bash
pnpm --filter @mini-commerce/e2e typecheck
pnpm --filter @mini-commerce/e2e lint
pnpm exec playwright test tests/checkout-happy-path.spec.ts tests/frontend-certification.spec.ts tests/homepage-workspace.spec.ts tests/purchase.spec.ts tests/visual-integrity.spec.ts
```

Run those commands from `tests/e2e`. Then run the duplication check from the repository root:

```bash
pnpm dlx jscpd@latest --min-lines 10 --min-tokens 60 --reporters console --ignore '**/node_modules/**,**/vendor/**,**/.next/**,**/dist/**' tests/e2e
```

Expected: typecheck and lint pass; 19 Playwright tests pass with one intentional skip; the repeated commerce types and route-handler clones no longer appear.

- [ ] **Step 7: Commit the fixture milestone**

```bash
git add tests/e2e/fixtures/commerce-api.ts tests/e2e/tests
git commit -m "refactor: share Playwright commerce fixture"
```

### Task 6: Run final verification, measure honestly, and close the active plan

**Files:**

- Modify: `goal-sloc.md`
- Delete after all prior steps pass: `docs/superpowers/plans/2026-09-22-repo-bloat-reduction.md`

**Interfaces:**

- Consumes: all five verified implementation milestones.
- Produces: final proof, honest reduction accounting, and no leftover implementation plans.

- [ ] **Step 1: Run static, formatting, unit, and build gates**

Run from the repository root:

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm build
pnpm test
pnpm pg:test
```

Then run `node_modules/.bin/vitest run` from `apps/bff`. Expected: every command exits 0; the direct Vitest run reports 117 passing tests and is not a Turbo cache replay.

- [ ] **Step 2: Run the affected browser regression suite**

From `tests/e2e`, run:

```bash
pnpm exec playwright test tests/checkout-happy-path.spec.ts tests/frontend-certification.spec.ts tests/homepage-workspace.spec.ts tests/purchase.spec.ts tests/visual-integrity.spec.ts
```

Expected: 19 pass and one test is intentionally skipped.

- [ ] **Step 3: Exercise the real stack when Docker is available**

Run:

```bash
docker info
./dev up full
./dev smoke
pnpm test:integration
pnpm test:e2e
```

Expected when Docker is available: smoke passes all current endpoint checks, integration tests pass, and the complete Playwright suite passes. If `docker info` fails because the daemon is unavailable, record these three checks as unavailable rather than claiming they passed.

- [ ] **Step 4: Re-measure maintained code, documentation, and duplication**

Run:

```bash
git ls-files | xargs wc -l | tail -1
git ls-files 'docs/**' | xargs wc -l | tail -1
git ls-files '*.ts' '*.tsx' '*.js' '*.mjs' '*.py' '*.css' '*.html' '*.sh' | xargs wc -l | tail -1
pnpm dlx jscpd@latest --min-lines 10 --min-tokens 60 --reporters console --ignore '**/node_modules/**,**/vendor/**,**/.next/**,**/dist/**' apps packages tests scripts
```

Record the exact results in `goal-sloc.md`. Compute:

```text
structural percentage = 100 * structural lines removed / all lines removed
cosmetic percentage = 100 * cosmetic lines removed / all lines removed
```

Classify completed-plan deletion, dead-code deletion, dependency/config deletion, and de-duplication as structural. This plan contains no standalone comment trimming, whitespace removal, line packing, or formatter-driven cosmetic reduction, so the cosmetic numerator should be zero.

- [ ] **Step 5: Update the retrospective with final evidence**

Use `apply_patch` to replace the final-audit paragraph in `goal-sloc.md`.
Record the observed final totals and their arithmetic differences from 57,408
tracked lines, 22,932 maintained-code lines, and 692 duplicated lines. State
the fixed completed-plan delta of -13,543 lines, the computed structural
percentage, a cosmetic percentage of 0%, only the verification commands that
actually passed, any unavailable Docker checks, and this stop condition:
remaining candidates are excluded production-component and k6 refactors, so
this pass does not expand into them.

- [ ] **Step 6: Inspect the complete diff and remove the now-completed active plan**

Run:

```bash
git diff --check
git diff --stat origin/main...HEAD
git status --short
```

Verify no specification is deleted and no unrelated file changed. Then use `apply_patch` to delete `docs/superpowers/plans/2026-09-22-repo-bloat-reduction.md`; it is now a completed execution checklist.

- [ ] **Step 7: Commit the final evidence**

```bash
git add goal-sloc.md docs/superpowers/plans
git commit -m "chore: record repository simplification results"
```

- [ ] **Step 8: Perform the final branch proof**

Run:

```bash
git status --short --branch
git log --oneline --decorate origin/main..HEAD
find docs/superpowers/plans -maxdepth 1 -type f -name '*.md' -print
find docs/superpowers/specs docs/specs -type f -name '*.md' -print | sort
```

Expected: the branch is clean, the milestone commits are present, no implementation-plan Markdown remains, and all specification files remain.
