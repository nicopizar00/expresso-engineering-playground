import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AssetsController } from "./modules/assets/assets.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { MeController } from "./modules/auth/me.controller";
import { CartController } from "./modules/cart/cart.controller";
import { CatalogController } from "./modules/catalog/catalog.controller";
import { CheckoutController } from "./modules/checkout/checkout.controller";
import { HealthController } from "./modules/health/health.controller";
import { AccountController } from "./modules/orders/account.controller";
import { OrdersController } from "./modules/orders/orders.controller";
import { VisualizationController } from "./modules/visualization/visualization.controller";

// The whole public route table, derived from decorator metadata. Adding,
// moving, or removing a route fails here until the spec's route map (and
// this list) say so.
const CONTROLLERS = [
  AssetsController,
  AuthController,
  MeController,
  CartController,
  CatalogController,
  CheckoutController,
  HealthController,
  AccountController,
  OrdersController,
  VisualizationController,
];

const trim = (s: unknown) => String(s ?? "").replace(/^\/+|\/+$/g, "");

function routeTable(): string[] {
  const routes: string[] = [];
  for (const controller of CONTROLLERS) {
    const base = trim(Reflect.getMetadata(PATH_METADATA, controller));
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === "constructor" || typeof handler !== "function") continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;
      const sub = trim(Reflect.getMetadata(PATH_METADATA, handler));
      const path = "/" + [base, sub].filter(Boolean).join("/");
      routes.push(`${RequestMethod[method as RequestMethod]} ${path}`);
    }
  }
  return routes.sort();
}

describe("BFF route table", () => {
  it("matches the REST route map exactly", () => {
    expect(routeTable()).toEqual(
      [
        "GET /health",
        "GET /products",
        "GET /products/:id",
        "GET /cart",
        "POST /cart/items",
        "PATCH /cart/items/:itemId",
        "DELETE /cart/items/:itemId",
        "POST /orders",
        "GET /orders",
        "GET /orders/:id",
        "GET /orders/:id/status",
        "GET /me",
        "GET /me/orders",
        "GET /me/hot-status",
        "POST /auth/register",
        "POST /auth/login",
        "POST /auth/logout",
        "GET /visualization",
        "GET /visualization/events",
        "POST /assets/refresh",
      ].sort(),
    );
  });
});
