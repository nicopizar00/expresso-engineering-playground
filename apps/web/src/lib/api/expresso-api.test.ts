import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expressoApi } from "./expresso-api";

type Call = { method: string; path: string };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://bff.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      calls.push({
        method: init?.method ?? "GET",
        path: u.pathname + u.search,
      });
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("expressoApi routes", () => {
  it.each([
    ["getProducts", () => expressoApi.getProducts(), "GET", "/products"],
    [
      "getProductById",
      () => expressoApi.getProductById("prod_espresso"),
      "GET",
      "/products/prod_espresso",
    ],
    [
      "checkout",
      () =>
        expressoApi.checkout({
          cartId: "cart_1",
        } as Parameters<typeof expressoApi.checkout>[0]),
      "POST",
      "/orders",
    ],
    ["getOrders", () => expressoApi.getOrders(), "GET", "/orders"],
    [
      "getMyOrders",
      () => expressoApi.getMyOrders(),
      "GET",
      "/orders?owner=session",
    ],
    ["getMe", () => expressoApi.getMe(), "GET", "/me"],
    [
      "getAccountOrders",
      () => expressoApi.getAccountOrders(),
      "GET",
      "/me/orders",
    ],
    ["getHotStatus", () => expressoApi.getHotStatus(), "GET", "/me/hot-status"],
  ] as const)("%s", async (_name, call, method, path) => {
    await call();
    expect(calls).toEqual([{ method, path }]);
  });
});
