import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AppModule } from "./app.module";

// The whole public route table, derived from decorator metadata on every
// controller AppModule actually registers (walked through module imports),
// so a new controller can't add routes this test never sees. Adding, moving,
// or removing a route fails here until the spec's route map (and the list
// below) say so.
type Ctor = new (...args: never[]) => unknown;

function registeredControllers(root: Ctor): Ctor[] {
  const seen = new Set<unknown>();
  const controllers: Ctor[] = [];
  const visit = (entry: unknown) => {
    // Dynamic modules ({ module, controllers?, imports? }) carry their own
    // metadata alongside the class's.
    const mod = (entry as { module?: Ctor })?.module ?? entry;
    if (!mod || seen.has(mod)) return;
    seen.add(mod);
    const dynamic = entry as { controllers?: Ctor[]; imports?: unknown[] };
    controllers.push(
      ...((Reflect.getMetadata("controllers", mod) as Ctor[] | undefined) ??
        []),
      ...(dynamic.controllers ?? []),
    );
    for (const child of [
      ...((Reflect.getMetadata("imports", mod) as unknown[] | undefined) ?? []),
      ...(dynamic.imports ?? []),
    ]) {
      visit(child);
    }
  };
  visit(root);
  return controllers;
}

const CONTROLLERS = registeredControllers(AppModule);

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
  it("finds every module's controllers", () => {
    expect(CONTROLLERS.length).toBe(10);
  });

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
