import { describe, expect, it } from "vitest";
import {
  isValidPassword,
  normalizeEmail,
  normalizeUsername,
  parseRecipient,
} from "./identity";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Ana.B-1_ ")).toBe("ana.b-1_");
  });
  it.each(["ab", "a".repeat(33), "ana b", "ana@x", "ñandu", ""])(
    "rejects %j",
    (raw) => expect(normalizeUsername(raw)).toBeNull(),
  );
  it("accepts the 3 and 32 char bounds", () => {
    expect(normalizeUsername("abc")).toBe("abc");
    expect(normalizeUsername("a".repeat(32))).toBe("a".repeat(32));
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail(" Ana@Example.TEST ")).toBe("ana@example.test");
  });
  it.each([
    "ana",
    "ana@",
    "@example.test",
    "ana@example",
    "a b@example.test",
    "",
  ])("rejects %j", (raw) => expect(normalizeEmail(raw)).toBeNull());
  it("rejects more than 254 chars", () => {
    const local = "a".repeat(64);
    const domain = `${"d".repeat(185)}.test`; // 64 + 1 + 190 = 255
    expect(normalizeEmail(`${local}@${domain}`)).toBeNull();
  });
});

describe("parseRecipient", () => {
  it("routes @ to email", () => {
    expect(parseRecipient(" Cara@Example.test")).toEqual({
      email: "cara@example.test",
    });
  });
  it("routes everything else to username", () => {
    expect(parseRecipient("Ben ")).toEqual({ username: "ben" });
  });
  it("returns null for an invalid recipient", () => {
    expect(parseRecipient("x")).toBeNull();
    expect(parseRecipient("bad@")).toBeNull();
  });
});

describe("isValidPassword", () => {
  it("enforces 8..200 chars without trimming", () => {
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
    expect(isValidPassword("        ")).toBe(true);
    expect(isValidPassword("x".repeat(201))).toBe(false);
  });
});
