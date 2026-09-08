import { expect, type Locator, type Page } from '@playwright/test';

export class CartDrawer {
  constructor(readonly page: Page) {}

  dialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Cart' });
  }

  productRow(productName: string): Locator {
    return this.dialog()
      .getByRole('listitem')
      .filter({ hasText: productName });
  }

  productName(productName: string): Locator {
    return this.productRow(productName).getByText(productName, { exact: true });
  }

  quantity(productName: string): Locator {
    return this.productRow(productName).getByText(/^Qty: \d+$/).first();
  }

  lineTotal(productName: string): Locator {
    return this.productRow(productName).getByText(/\d+\.\d{2} USD/).first();
  }

  subtotal(): Locator {
    return this.dialog().getByText(/\d+\.\d{2} USD/).last();
  }

  emptyCartState(): Locator {
    return this.dialog()
      .getByRole('status')
      .filter({ hasText: /Your cart is empty/i });
  }

  checkoutControl(): Locator {
    return this.dialog()
      .getByRole('link', { name: /Proceed to Checkout/i })
      .or(this.dialog().getByRole('button', { name: /Proceed to Checkout/i }))
      .first();
  }

  async clickCheckout(): Promise<void> {
    const checkoutControl = this.checkoutControl();
    await expect(checkoutControl).toBeVisible();
    await expect(checkoutControl).toBeEnabled();
    await checkoutControl.click();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
