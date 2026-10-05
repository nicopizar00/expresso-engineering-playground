import { describe, expect, it } from "vitest";
import { readCookie } from "./cookies";

describe("readCookie", () => {
  it("returns undefined without a header", () => {
    expect(readCookie(undefined, "sid")).toBeUndefined();
  });
  it("finds a cookie among several and decodes it", () => {
    expect(readCookie("a=1; auth=x%2By; sid=abc", "auth")).toBe("x+y");
  });
  it("does not match a cookie whose name only ends with the target", () => {
    expect(readCookie("xauth=1", "auth")).toBeUndefined();
  });
  it("treats an empty value as absent", () => {
    expect(readCookie("auth=", "auth")).toBeUndefined();
  });
});
