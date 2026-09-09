import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

const SESSION_COOKIE = "sid";

// Cart/session evolution: resolves the caller's session id from the `sid`
// cookie, minting and setting one if absent. Manual cookie parsing (no
// `cookie-parser` middleware) — the BFF only ever needs to read this one
// cookie, so a small dependency-free parse is simpler than wiring a
// library for it. `res.cookie()` for *setting* is already available via
// `@nestjs/platform-express` (Express), no new dependency needed there
// either.
@Injectable()
export class SessionService {
  resolveSessionId(req: Request, res: Response): string {
    const existing = this.readCookie(req.headers.cookie, SESSION_COOKIE);
    if (existing) {
      return existing;
    }
    const sessionId = randomUUID();
    // path: '/' (not a narrower prefix like '/api/bff') — the BFF only
    // ever sees its own bare route paths ('/cart/items', '/checkout'),
    // never the '/api/bff' prefix the browser uses through the Next.js
    // proxy (the rewrite strips it before the request arrives here). Both
    // the proxied browser and direct callers (scripts/pg/smoke.py, k6)
    // need path '/' to see this cookie on the paths they actually request.
    // Derived from the actual inbound request scheme, not NODE_ENV: the
    // BFF's Docker image hardcodes NODE_ENV=production even for local
    // `./dev up` (standard Node runtime-image practice), which would make
    // an env-based check always true and break cookie delivery over the
    // plain HTTP this playground actually serves locally. req.protocol
    // reflects reality regardless of how NODE_ENV is set at build time.
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: req.protocol === "https",
    });
    return sessionId;
  }

  private readCookie(
    header: string | undefined,
    name: string,
  ): string | undefined {
    if (!header) {
      return undefined;
    }
    const prefix = `${name}=`;
    for (const part of header.split(";")) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        const value = trimmed.slice(prefix.length);
        return value.length > 0 ? decodeURIComponent(value) : undefined;
      }
    }
    return undefined;
  }
}
