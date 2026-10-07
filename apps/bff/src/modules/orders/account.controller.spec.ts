import "reflect-metadata";
import { UnauthorizedException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AuthSessionService } from "../../core/auth/auth-session.service";
import { AccountController } from "./account.controller";
import type { HotStatusService } from "./hot-status.service";
import type { OrdersService } from "./orders.service";

const req = {} as Request;
const res = {} as Response;

function make(
  user: { id: number; username: string; email: string } | null,
  items: unknown[] = [],
  hot: unknown = { hotCount: 0, nextCoolsAt: null, serverTime: "x" },
) {
  const orders = { listForAccount: vi.fn().mockResolvedValue(items) };
  const sessions = { resolveUser: vi.fn().mockResolvedValue(user) };
  const hotStatus = { forUser: vi.fn().mockResolvedValue(hot) };
  return {
    controller: new AccountController(
      orders as unknown as OrdersService,
      sessions as unknown as AuthSessionService,
      hotStatus as unknown as HotStatusService,
    ),
    orders,
    hotStatus,
  };
}

describe("AccountController", () => {
  it("is mounted at /me with GET orders", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AccountController)).toBe("me");
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

  it("mounts GET hot-status", () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AccountController.prototype.hotStatus),
    ).toBe("hot-status");
  });

  it("hot-status 401s when signed out (no, forged, or expired cookie)", async () => {
    const { controller, hotStatus } = make(null);
    await expect(controller.hotStatus(req, res)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(hotStatus.forUser).not.toHaveBeenCalled();
  });

  it("hot-status returns the service snapshot for the signed-in user", async () => {
    const snap = {
      hotCount: 2,
      nextCoolsAt: "2026-10-05T12:05:00.000Z",
      serverTime: "2026-10-05T12:00:00.000Z",
    };
    const { controller, hotStatus } = make(
      { id: 1, username: "ana", email: "ana@example.test" },
      [],
      snap,
    );
    await expect(controller.hotStatus(req, res)).resolves.toEqual(snap);
    expect(hotStatus.forUser).toHaveBeenCalledWith({
      id: 1,
      username: "ana",
      email: "ana@example.test",
    });
  });
});
