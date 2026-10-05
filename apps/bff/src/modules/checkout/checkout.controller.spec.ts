import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthSessionService } from "../../core/auth/auth-session.service";
import type { SessionService } from "../../core/session/session.service";
import { CheckoutController } from "./checkout.controller";
import type { CheckoutService } from "./checkout.service";

const RECEIPT = {
  orderId: "ord_001",
  cartId: "cart_1",
  customerName: null,
  total: { amountMinor: 180, currency: "EUR" },
  placedAt: "2026-10-05T10:00:00.000Z",
};

function makeController() {
  const checkout = { checkout: vi.fn().mockResolvedValue(RECEIPT) };
  const session = { resolveSessionId: vi.fn().mockReturnValue("sid") };
  // An unknown, forged, or expired token resolves to null, never throws.
  const auth = { resolveUser: vi.fn().mockResolvedValue(null) };
  const controller = new CheckoutController(
    checkout as unknown as CheckoutService,
    session as unknown as SessionService,
    auth as unknown as AuthSessionService,
  );
  return { controller, checkout, auth };
}

describe("CheckoutController", () => {
  it("treats a stale or forged auth cookie as guest instead of failing", async () => {
    const { controller, checkout, auth } = makeController();
    const req = { headers: { cookie: "auth=forged" } } as unknown as Request;
    const res = {} as Response;
    const body = { cartId: "cart_1" };

    await expect(controller.create(body, req, res)).resolves.toEqual(RECEIPT);

    expect(auth.resolveUser).toHaveBeenCalledWith(req, res);
    expect(checkout.checkout).toHaveBeenCalledWith("sid", body, null);
  });

  it("is POST /checkout with a 201", () => {
    const handler = CheckoutController.prototype.create;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("/");
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(201);
  });
});
