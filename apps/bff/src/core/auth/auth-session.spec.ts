import { describe, expect, it } from "vitest";
import { hashToken, newToken, parseSessionTtlDays } from "./auth-session";

describe("parseSessionTtlDays", () => {
  it("defaults to 30", () => {
    expect(parseSessionTtlDays(undefined)).toBe(30);
    expect(parseSessionTtlDays("")).toBe(30);
  });
  it("accepts positive integers up to 365", () => {
    expect(parseSessionTtlDays("1")).toBe(1);
    expect(parseSessionTtlDays("365")).toBe(365);
  });
  it.each(["0", "-1", "1.5", "abc", "366", " 7"])("throws on %j", (raw) => {
    expect(() => parseSessionTtlDays(raw)).toThrow(/AUTH_SESSION_TTL_DAYS/);
  });
});

describe("tokens", () => {
  it("newToken is 32 random bytes in base64url", () => {
    const t = newToken();
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(newToken()).not.toBe(t);
  });
  it("hashToken is sha256 hex", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
