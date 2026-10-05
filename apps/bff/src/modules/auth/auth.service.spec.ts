import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { AuthSessionService } from "../../core/auth/auth-session.service";
import { hashPassword } from "../../core/auth/password";
import { AuthService } from "./auth.service";

const req = {} as Request;
const res = {} as Response;

async function make(existing?: {
  username: string;
  email: string;
  password: string;
}) {
  const user = existing && {
    id: 1,
    username: existing.username,
    email: existing.email,
    passwordHash: await hashPassword(existing.password),
    createdAt: new Date(),
  };
  const prisma = {
    user: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 2,
        createdAt: new Date(),
        ...data,
      })),
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        if (!user) return null;
        if (where.username && where.username === user.username) return user;
        if (where.email && where.email === user.email) return user;
        return null;
      }),
    },
  };
  const sessions = {
    start: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    resolveUser: vi.fn().mockResolvedValue(null),
  };
  const svc = new AuthService(
    prisma as unknown as PrismaService,
    sessions as unknown as AuthSessionService,
  );
  return { svc, prisma, sessions };
}

describe("AuthService.register", () => {
  it("normalizes, hashes, stores, and signs in", async () => {
    const { svc, prisma, sessions } = await make();
    const out = await svc.register(
      {
        username: " Ana ",
        email: "Ana@Example.TEST",
        password: "espresso-demo",
      },
      req,
      res,
    );
    expect(out).toEqual({ username: "ana", email: "ana@example.test" });
    const data = prisma.user.create.mock.calls[0]![0].data;
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(sessions.start).toHaveBeenCalledWith(2, req, res);
  });

  it.each([
    [
      { username: "x", email: "ana@example.test", password: "espresso-demo" },
      "username",
    ],
    [{ username: "ana", email: "nope", password: "espresso-demo" }, "email"],
    [
      { username: "ana", email: "ana@example.test", password: "short" },
      "password",
    ],
  ])("rejects invalid input %#", async (dto, field) => {
    const { svc } = await make();
    await expect(svc.register(dto, req, res)).rejects.toMatchObject({
      response: { field },
    });
    await expect(svc.register(dto, req, res)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    [["username"], "username"],
    [["email"], "email"],
    ["User_username_key", "username"],
    ["User_email_key", "email"],
  ])("maps P2002 target %j to a 409 on %s", async (target, field) => {
    const { svc, prisma } = await make();
    prisma.user.create.mockRejectedValue({ code: "P2002", meta: { target } });
    const err = await svc
      .register(
        {
          username: "ana",
          email: "ana@example.test",
          password: "espresso-demo",
        },
        req,
        res,
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toEqual({ message: `${field} taken`, field });
  });

  it("rethrows other database errors", async () => {
    const { svc, prisma } = await make();
    prisma.user.create.mockRejectedValue(new Error("db down"));
    await expect(
      svc.register(
        {
          username: "ana",
          email: "ana@example.test",
          password: "espresso-demo",
        },
        req,
        res,
      ),
    ).rejects.toThrow("db down");
  });
});

describe("AuthService.login", () => {
  const ana = {
    username: "ana",
    email: "ana@example.test",
    password: "espresso-demo",
  };

  it("signs in by username, case-insensitively", async () => {
    const { svc, sessions } = await make(ana);
    await expect(
      svc.login({ identifier: " ANA ", password: "espresso-demo" }, req, res),
    ).resolves.toEqual({
      username: "ana",
      email: "ana@example.test",
    });
    expect(sessions.start).toHaveBeenCalledWith(1, req, res);
  });

  it("signs in by email", async () => {
    const { svc } = await make(ana);
    await expect(
      svc.login(
        { identifier: "Ana@Example.test", password: "espresso-demo" },
        req,
        res,
      ),
    ).resolves.toMatchObject({
      username: "ana",
    });
  });

  it.each([
    { identifier: "ana", password: "wrong-password" },
    { identifier: "nobody", password: "espresso-demo" },
    { identifier: "not-an-email@", password: "espresso-demo" },
  ])("returns a generic 401 for %j", async (dto) => {
    const { svc, sessions } = await make(ana);
    const err = await svc.login(dto, req, res).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe("invalid credentials");
    expect(sessions.start).not.toHaveBeenCalled();
  });
});

describe("AuthService.me / logout", () => {
  it("me maps the resolved user to the public shape", async () => {
    const { svc, sessions } = await make();
    sessions.resolveUser.mockResolvedValue({
      id: 1,
      username: "ana",
      email: "ana@example.test",
    });
    await expect(svc.me(req, res)).resolves.toEqual({
      user: { username: "ana", email: "ana@example.test" },
    });
    sessions.resolveUser.mockResolvedValue(null);
    await expect(svc.me(req, res)).resolves.toEqual({ user: null });
  });

  it("logout ends the session", async () => {
    const { svc, sessions } = await make();
    await svc.logout(req, res);
    expect(sessions.end).toHaveBeenCalledWith(req, res);
  });
});
