import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { SessionService } from "./session.service";

function makeReq(cookieHeader?: string): Request {
  return { headers: { cookie: cookieHeader } } as unknown as Request;
}

function makeRes() {
  return { cookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
  };
}

describe("SessionService", () => {
  it("mints and sets a new session id when no cookie is present", () => {
    const service = new SessionService();
    const req = makeReq(undefined);
    const res = makeRes();

    const sessionId = service.resolveSessionId(req, res);

    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
    expect(res.cookie).toHaveBeenCalledOnce();
    expect(res.cookie).toHaveBeenCalledWith(
      "sid",
      sessionId,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("returns the existing session id unchanged when the cookie is present", () => {
    const service = new SessionService();
    const req = makeReq("sid=existing-session-id; other=value");
    const res = makeRes();

    const sessionId = service.resolveSessionId(req, res);

    expect(sessionId).toBe("existing-session-id");
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("finds the sid cookie regardless of position among other cookies", () => {
    const service = new SessionService();
    const req = makeReq("other=value; sid=middle-session-id; third=z");
    const res = makeRes();

    expect(service.resolveSessionId(req, res)).toBe("middle-session-id");
  });

  it("mints a new id when the sid cookie is present but empty", () => {
    const service = new SessionService();
    const req = makeReq("sid=; other=value");
    const res = makeRes();

    const sessionId = service.resolveSessionId(req, res);

    expect(sessionId.length).toBeGreaterThan(0);
    expect(res.cookie).toHaveBeenCalledOnce();
  });
});
