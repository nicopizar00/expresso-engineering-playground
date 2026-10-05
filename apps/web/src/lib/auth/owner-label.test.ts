import { describe, expect, it } from "vitest";
import { ownerLabel } from "./owner-label";

describe("ownerLabel", () => {
  it.each([
    [{ username: "ana" }, "for ana"],
    [{ email: "cara@example.test" }, "for cara@example.test"],
    [null, "guest"],
  ])("%j → %s", (owner, label) => {
    expect(ownerLabel(owner)).toBe(label);
  });
});
