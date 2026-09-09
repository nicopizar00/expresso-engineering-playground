import { expect, test } from '@playwright/test';
import { StorefrontPage } from '../pages/StorefrontPage';

// Exercises the REAL BFF — no route mocking. Requires `./dev up` running
// (Postgres + BFF healthy) before this spec executes; it is not covered
// by webServer in playwright.config.ts (that only starts the web app).
//
// Proves cart/session evolution: two independent browser contexts (each
// gets its own cookie jar from Playwright) can each hold and check out
// their own Cup of Coffee at the same time, with neither seeing a 409
// from the other's cart — which would happen today if the cart were
// still one global singleton.
test.describe('Session isolation (real BFF)', () => {
  test('two independent browser sessions can shop concurrently without colliding', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      const storefrontA = new StorefrontPage(await contextA.newPage());
      const storefrontB = new StorefrontPage(await contextB.newPage());

      await storefrontA.gotoCatalog();
      await storefrontB.gotoCatalog();

      await expect(storefrontA.catalogHeading()).toBeVisible();
      await expect(storefrontB.catalogHeading()).toBeVisible();

      // Session A adds the one product.
      await storefrontA.addProductToCart('Cup of Coffee');
      await expect(storefrontA.cartButton()).toHaveAccessibleName(
        'Shopping cart with 1 items',
      );

      // Session B is a completely independent browser context — this
      // would 409 today if the cart were still a single global singleton.
      await storefrontB.addProductToCart('Cup of Coffee');
      await expect(storefrontB.cartButton()).toHaveAccessibleName(
        'Shopping cart with 1 items',
      );

      // Session A checks out independently.
      await storefrontA.openCart();
      await storefrontA.proceedToCheckoutFromCartDrawer();
      await expect(storefrontA.placeOrderButton()).toBeEnabled();
      await storefrontA.placeOrder();
      await expect(storefrontA.orderSuccessAlert()).toBeVisible();
      const orderIdA = storefrontA.currentOrderId();

      // Session B's cart was never touched by A's checkout and can still
      // check out on its own.
      await storefrontB.openCart();
      await storefrontB.proceedToCheckoutFromCartDrawer();
      await expect(storefrontB.placeOrderButton()).toBeEnabled();
      await storefrontB.placeOrder();
      await expect(storefrontB.orderSuccessAlert()).toBeVisible();
      const orderIdB = storefrontB.currentOrderId();

      expect(orderIdA).not.toBe(orderIdB);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
