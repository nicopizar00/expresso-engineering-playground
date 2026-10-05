import { describe, expect, it } from "vitest";
import { pickVisible } from "./visible";

const snap = {
  status: { hotCount: 1, nextCoolsAt: "x", serverTime: "y" },
  skewMs: 0,
};

describe("pickVisible", () => {
  it("shows a snapshot with at least one hot coffee", () => {
    expect(pickVisible(true, snap, undefined)).toBe(snap);
  });
  it("hides when signed out", () => {
    expect(pickVisible(false, snap, undefined)).toBeNull();
  });
  it("hides stale data while the last fetch failed", () => {
    expect(pickVisible(true, snap, new Error("503"))).toBeNull();
  });
  it("hides with zero hot coffees or no data yet", () => {
    expect(
      pickVisible(
        true,
        { ...snap, status: { ...snap.status, hotCount: 0 } },
        undefined,
      ),
    ).toBeNull();
    expect(pickVisible(true, undefined, undefined)).toBeNull();
  });
});
