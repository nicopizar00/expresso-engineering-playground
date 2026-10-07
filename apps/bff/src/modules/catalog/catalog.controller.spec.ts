import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { CatalogController } from "./catalog.controller";

describe("CatalogController routes", () => {
  it("is mounted at /products", () => {
    expect(Reflect.getMetadata(PATH_METADATA, CatalogController)).toBe(
      "products",
    );
  });

  it.each([
    ["list", "/", RequestMethod.GET],
    ["get", ":id", RequestMethod.GET],
  ] as const)("%s → %s", (name, path, method) => {
    const fn = CatalogController.prototype[name];
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(method);
  });
});
