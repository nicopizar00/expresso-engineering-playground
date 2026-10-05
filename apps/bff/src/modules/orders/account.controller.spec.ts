import "reflect-metadata";
import { UnauthorizedException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthSessionService } from "../../core/auth/auth-session.service";
import { AccountController } from "./account.controller";
import type { OrdersService } from "./orders.service";

const req = {} as Request;
const res = {} as Response;

function make(
  user: { id: number; username: string; email: string } | null,
  items: unknown[] = [],
) {
  const orders = { listForAccount: vi.fn().mockResolvedValue(items) };
  const sessions = { resolveUser: vi.fn().mockResolvedValue(user) };
  return {
    controller: new AccountController(
      orders as unknown as OrdersService,
      sessions as unknown as AuthSessionService,
    ),
    orders,
  };
}

describe("AccountController", () => {
  it("is mounted at /account with GET orders", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AccountController)).toBe(
      "account",
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, AccountController.prototype.orders),
    ).toBe("orders");
  });

  it("401s when signed out", async () => {
    const { controller } = make(null);
    await expect(controller.orders(req, res)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("returns items and latest = items[0]", async () => {
    const a = { orderId: "ord_002" };
    const b = { orderId: "ord_001" };
    const { controller, orders } = make(
      { id: 1, username: "ana", email: "ana@example.test" },
      [a, b],
    );
    await expect(controller.orders(req, res)).resolves.toEqual({
      items: [a, b],
      latest: a,
    });
    expect(orders.listForAccount).toHaveBeenCalledWith({
      id: 1,
      username: "ana",
      email: "ana@example.test",
    });
  });

  it("returns latest null with no orders", async () => {
    const { controller } = make({
      id: 1,
      username: "ana",
      email: "ana@example.test",
    });
    await expect(controller.orders(req, res)).resolves.toEqual({
      items: [],
      latest: null,
    });
  });
});
