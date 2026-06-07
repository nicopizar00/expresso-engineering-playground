import { expect, type Locator, type Page } from "@playwright/test";
import { CartDrawer } from "./CartDrawer";

const DEFAULT_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export class CatalogPage {
  readonly cartDrawer: CartDrawer;

  constructor(
    readonly page: Page,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {
    this.cartDrawer = new CartDrawer(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url("/"));
  }

  heading(): Locator {
    return this.page.getByRole("heading", { name: "Catalog", exact: true });
  }

  productName(productName: string): Locator {
    return this.page.getByRole("heading", { name: productName });
  }

  productDescription(description: string | RegExp): Locator {
    return this.page.getByText(description);
  }

  addToCartButton(productName: string): Locator {
    return this.page.getByRole("button", {
      name: new RegExp(`^Add ${escapeRegExp(productName)} to cart$`, "i"),
    });
  }

  cartButton(): Locator {
    return this.page.getByRole("button", {
      name: /Shopping cart with \d+ items/i,
    });
  }

  getApiStatus(): Locator {
    return this.page.getByRole("button", { name: /API status:/i });
  }

  errorState(): Locator {
    return this.page.getByRole("alert").filter({ hasText: /\S/ }).first();
  }

  async addItemToCart(productName: string): Promise<void> {
    const addButton = this.addToCartButton(productName);
    await expect(addButton).toBeVisible();
    await expect(addButton).toBeEnabled();
    await addButton.click();
  }

  async openCart(): Promise<CartDrawer> {
    const cartButton = this.cartButton();
    await expect(cartButton).toBeVisible();
    await expect(cartButton).toBeEnabled();
    await cartButton.click();
    await expect(this.cartDrawer.dialog()).toBeVisible();
    return this.cartDrawer;
  }

  private url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
