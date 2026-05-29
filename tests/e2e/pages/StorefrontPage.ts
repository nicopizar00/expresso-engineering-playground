import type { Locator, Page } from '@playwright/test';

const DEFAULT_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export class StorefrontPage {
  constructor(
    readonly page: Page,
    private readonly baseUrl: string = DEFAULT_BASE_URL
  ) {}

  async gotoCatalog(): Promise<void> {
    await this.page.goto(this.url('/'));
  }

  catalogHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Product Catalog' });
  }

  categoryTab(label: string): Locator {
    return this.page.getByRole('tab', {
      name: new RegExp(`^${escapeRegExp(label)}\\b`),
    });
  }

  productHeading(productName: string): Locator {
    return this.page.getByRole('heading', { name: productName });
  }

  addToCartButton(productName: string): Locator {
    return this.page.getByRole('button', {
      name: `Add ${productName} to cart`,
    });
  }

  cartButton(): Locator {
    return this.page.getByRole('button', {
      name: /Shopping cart with \d+ items/,
    });
  }

  cartDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Cart' });
  }

  cartLineItem(productName: string): Locator {
    return this.cartDialog().getByText(productName, { exact: true });
  }

  proceedToCheckoutLink(): Locator {
    return this.cartDialog().getByRole('link', {
      name: /Proceed to Checkout/i,
    });
  }

  checkoutHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Checkout' });
  }

  checkoutSummaryHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Order Summary' });
  }

  checkoutLineItem(productName: string): Locator {
    return this.page.getByText(productName, { exact: true });
  }

  customerNameInput(): Locator {
    return this.page.getByLabel('Your Name');
  }

  placeOrderButton(): Locator {
    return this.page.getByRole('button', { name: 'Place Order' });
  }

  checkoutAlert(): Locator {
    return this.page.getByRole('alert');
  }

  orderDetailsHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Order Details' });
  }

  orderSuccessAlert(): Locator {
    return this.page
      .getByRole('alert')
      .filter({ hasText: 'Order placed successfully!' });
  }

  visibleOrderId(orderId: string): Locator {
    return this.page.getByText(orderId, { exact: true });
  }

  orderCustomer(customerName: string): Locator {
    return this.page.getByText(customerName, { exact: true });
  }

  orderLineItem(productName: string): Locator {
    return this.page.getByText(productName, { exact: true });
  }

  orderStatus(status: 'Pending' | 'Preparing' | 'Prepared' | 'Cancelled'): Locator {
    return this.page.getByText(status, { exact: true });
  }

  startPreparingButton(): Locator {
    return this.page.getByRole('button', { name: 'Start Preparing' });
  }

  markPreparedButton(): Locator {
    return this.page.getByRole('button', { name: 'Mark as Prepared' });
  }

  async filterProductsByCategory(label: string): Promise<void> {
    await this.categoryTab(label).click();
  }

  async addProductToCart(productName: string): Promise<void> {
    await this.addToCartButton(productName).click();
  }

  async openCart(): Promise<void> {
    await this.cartButton().click();
  }

  async proceedToCheckoutFromCartDrawer(): Promise<void> {
    await this.proceedToCheckoutLink().click();
  }

  async fillCustomerName(customerName: string): Promise<void> {
    await this.customerNameInput().fill(customerName);
  }

  async placeOrder(): Promise<void> {
    await this.placeOrderButton().click();
  }

  async startPreparingOrder(): Promise<void> {
    await this.startPreparingButton().click();
  }

  currentOrderId(): string {
    const match = this.page.url().match(/\/orders\/([^/?#]+)/);
    if (!match?.[1]) {
      throw new Error(`Expected an order detail URL, received ${this.page.url()}`);
    }
    return decodeURIComponent(match[1]);
  }

  private url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
