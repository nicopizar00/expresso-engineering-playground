import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { PrismaService } from "../../prisma.service";
import { hashToken } from "./auth-session";
import { AuthSessionService } from "./auth-session.service";

const DAY = 24 * 60 * 60 * 1000;
const USER = {
  id: 7,
  username: "ana",
  email: "ana@example.test",
  passwordHash: "x",
  createdAt: new Date(),
};

function makePrisma() {
  return {
    authSession: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}
function makeRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}
const req = (cookie?: string) =>
  ({
    headers: cookie ? { cookie } : {},
    protocol: "http",
  }) as unknown as Request;

describe("AuthSessionService", () => {
  it("start stores only the token hash and sets the auth cookie", async () => {
    const prisma = makePrisma();
    const svc = new AuthSessionService(
      prisma as unknown as PrismaService,
      30 * DAY,
    );
    const res = makeRes();
    await svc.start(7, req(), res);

    const [name, token, opts] = res.cookie.mock.calls[0]!;
    expect(name).toBe("auth");
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 30 * DAY,
    });
    const data = prisma.authSession.create.mock.calls[0]![0].data;
    expect(data.userId).toBe(7);
    expect(data.tokenHash).toBe(hashToken(token));
    expect(data.tokenHash).not.toBe(token);
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      30 * DAY - 5000,
    );
  });

  it("resolveUser returns null without touching the DB when no cookie", async () => {
    const prisma = makePrisma();
    const svc = new AuthSessionService(prisma as unknown as PrismaService, DAY);
    await expect(svc.resolveUser(req(), makeRes())).resolves.toBeNull();
    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
  });

  it("resolveUser returns the user for a live session", async () => {
    const prisma = makePrisma();
    prisma.authSession.findUnique.mockResolvedValue({
      id: 1,
      tokenHash: hashToken("tok"),
      userId: 7,
      expiresAt: new Date(Date.now() + DAY),
      user: USER,
    });
    const svc = new AuthSessionService(prisma as unknown as PrismaService, DAY);
    await expect(svc.resolveUser(req("auth=tok"), makeRes())).resolves.toEqual({
      id: 7,
      username: "ana",
      email: "ana@example.test",
    });
    expect(prisma.authSession.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("tok") },
      include: { user: true },
    });
  });

  it("resolveUser clears the cookie for an unknown token", async () => {
    const prisma = makePrisma();
    prisma.authSession.findUnique.mockResolvedValue(null);
    const svc = new AuthSessionService(prisma as unknown as PrismaService, DAY);
    const res = makeRes();
    await expect(svc.resolveUser(req("auth=forged"), res)).resolves.toBeNull();
    expect(res.clearCookie).toHaveBeenCalledWith("auth", { path: "/" });
  });

  it("resolveUser deletes an expired session and clears the cookie", async () => {
    const prisma = makePrisma();
    prisma.authSession.findUnique.mockResolvedValue({
      id: 1,
      tokenHash: hashToken("old"),
      userId: 7,
      expiresAt: new Date(Date.now() - 1),
      user: USER,
    });
    const svc = new AuthSessionService(prisma as unknown as PrismaService, DAY);
    const res = makeRes();
    await expect(svc.resolveUser(req("auth=old"), res)).resolves.toBeNull();
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
      where: { id: 1 },
    });
    expect(res.clearCookie).toHaveBeenCalledWith("auth", { path: "/" });
  });

  it("end deletes the row and clears the cookie, and is idempotent", async () => {
    const prisma = makePrisma();
    prisma.authSession.deleteMany.mockResolvedValue({ count: 0 });
    const svc = new AuthSessionService(prisma as unknown as PrismaService, DAY);
    const res = makeRes();
    await svc.end(req("auth=tok"), res);
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("tok") },
    });
    expect(res.clearCookie).toHaveBeenCalledWith("auth", { path: "/" });
    await svc.end(req(), makeRes()); // no cookie: no throw
  });
});
