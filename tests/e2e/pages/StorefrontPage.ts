import type { Locator, Page } from "@playwright/test";

const DEFAULT_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export class StorefrontPage {
  constructor(
    readonly page: Page,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  async gotoCatalog(): Promise<void> {
    await this.page.goto(this.url("/"));
  }

  catalogHeading(): Locator {
    return this.page.getByRole("heading", { name: "Catalog", exact: true });
  }

  categoryTab(label: string): Locator {
    return this.page.getByRole("tab", {
      name: new RegExp(`^${escapeRegExp(label)}\\b`),
    });
  }

  productHeading(productName: string): Locator {
    return this.page.getByRole("heading", { name: productName });
  }

  addToCartButton(productName: string): Locator {
    return this.page.getByRole("button", {
      name: `Add ${productName} to cart`,
    });
  }

  cartButton(): Locator {
    return this.page.getByRole("button", {
      name: /Shopping cart with \d+ items/,
    });
  }

  cartDialog(): Locator {
    return this.page.getByRole("dialog", { name: "Cart" });
  }

  cartLineItem(productName: string): Locator {
    return this.cartDialog().getByText(productName, { exact: true });
  }

  proceedToCheckoutLink(): Locator {
    return this.cartDialog().getByRole("button", {
      name: /Proceed to Checkout/i,
    });
  }

  // Checkout is inline in the homepage's cart panel now — there is no
  // dedicated "Checkout" page/heading to land on. `checkoutPanel()` is the
  // wrapper that shows up in place of what used to be route navigation.
  checkoutPanel(): Locator {
    return this.page.getByTestId("cart-checkout-panel");
  }

  checkoutSummaryHeading(): Locator {
    return this.page.getByRole("heading", { name: "Order Summary" });
  }

  checkoutLineItem(productName: string): Locator {
    return this.checkoutPanel().getByText(productName, { exact: true });
  }

  placeOrderButton(): Locator {
    return this.page.getByRole("button", { name: "Place Order" });
  }

  checkoutAlert(): Locator {
    return this.page.getByRole("alert").filter({ hasText: /\S/ }).first();
  }

  orderDetailsHeading(): Locator {
    return this.page.getByRole("heading", { name: "Order Details" });
  }

  orderSuccessAlert(): Locator {
    return this.page
      .getByRole("alert")
      .filter({ hasText: "Order placed successfully!" });
  }

  visibleOrderId(orderId: string): Locator {
    return this.page.getByText(orderId, { exact: true });
  }

  orderLineItem(productName: string): Locator {
    return this.page.getByText(productName, { exact: true });
  }

  orderStatus(
    status: "Pending" | "Preparing" | "Prepared" | "Cancelled",
  ): Locator {
    return this.page.getByText(status, { exact: true });
  }

  startPreparingButton(): Locator {
    return this.page.getByRole("button", { name: "Start Preparing" });
  }

  markPreparedButton(): Locator {
    return this.page.getByRole("button", { name: "Mark as Prepared" });
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

  async placeOrder(): Promise<void> {
    await this.placeOrderButton().click();
  }

  async startPreparingOrder(): Promise<void> {
    await this.startPreparingButton().click();
  }

  // Order placement no longer navigates to /orders/:id — the Orders section
  // stays on "/" and renders the order detail view in place. Read the order
  // id straight out of the detail view's DOM (the mono paragraph right next
  // to the "Order Details" heading) instead of parsing the URL.
  async currentOrderId(): Promise<string> {
    const text = await this.orderDetailsHeading()
      .locator("xpath=following-sibling::p[1]")
      .textContent();
    if (!text?.trim()) {
      throw new Error(
        "Expected an order id next to the Order Details heading, found none",
      );
    }
    return text.trim();
  }

  private url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
