import { describe, expect, it } from "vitest";
import { buildOrderFor, defaultOrderForChoice } from "./order-for";

describe("defaultOrderForChoice", () => {
  it("is self when signed in, guest otherwise", () => {
    expect(defaultOrderForChoice(true)).toBe("self");
    expect(defaultOrderForChoice(false)).toBe("guest");
  });
});

describe("buildOrderFor", () => {
  it("builds self only when signed in", () => {
    expect(buildOrderFor("self", "", true)).toEqual({
      ok: true,
      value: { type: "self" },
    });
    expect(buildOrderFor("self", "", false)).toEqual({
      ok: false,
      error: "Sign in to order for yourself",
    });
  });
  it("builds guest", () => {
    expect(buildOrderFor("guest", "ignored", false)).toEqual({
      ok: true,
      value: { type: "guest" },
    });
  });
  it("sends the trimmed recipient as typed when valid", () => {
    expect(buildOrderFor("user", " Cara@Example.test ", false)).toEqual({
      ok: true,
      value: { type: "user", recipient: "Cara@Example.test" },
    });
  });
  it.each(["", "x", "bad@"])("rejects recipient %j", (r) => {
    expect(buildOrderFor("user", r, true)).toEqual({
      ok: false,
      error: "Enter a username (3-32 chars) or an email",
    });
  });
});
