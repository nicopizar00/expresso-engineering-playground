import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "./auth.service";
import { MeController } from "./me.controller";

describe("MeController", () => {
  it("is GET /me", () => {
    expect(Reflect.getMetadata(PATH_METADATA, MeController)).toBe("me");
    const fn = MeController.prototype.me;
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe("/");
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(RequestMethod.GET);
  });

  it("delegates to AuthService.me (guest → user:null, not 401)", async () => {
    const auth = { me: vi.fn().mockResolvedValue({ user: null }) };
    const controller = new MeController(auth as unknown as AuthService);
    const req = {} as Request;
    const res = {} as Response;
    await expect(controller.me(req, res)).resolves.toEqual({ user: null });
    expect(auth.me).toHaveBeenCalledWith(req, res);
  });
});
