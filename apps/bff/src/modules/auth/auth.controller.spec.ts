import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AuthController } from "./auth.controller";

const route = (name: keyof AuthController) => {
  const fn = AuthController.prototype[name];
  return {
    path: Reflect.getMetadata(PATH_METADATA, fn),
    method: Reflect.getMetadata(METHOD_METADATA, fn),
    code: Reflect.getMetadata(HTTP_CODE_METADATA, fn),
  };
};

describe("AuthController routes", () => {
  it("is mounted at /auth", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AuthController)).toBe("auth");
  });
  it.each([
    ["register", "register", RequestMethod.POST, 201],
    ["login", "login", RequestMethod.POST, 200],
    ["logout", "logout", RequestMethod.POST, 204],
    ["me", "me", RequestMethod.GET, undefined],
  ] as const)("%s → %s", (name, path, method, code) => {
    expect(route(name)).toEqual({ path, method, code });
  });
});
