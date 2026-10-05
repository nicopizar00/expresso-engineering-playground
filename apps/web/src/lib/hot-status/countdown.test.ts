import { describe, expect, it } from "vitest";
import {
  clockSkewMs,
  coolsInText,
  formatRemaining,
  hotCountText,
  refetchDelayMs,
  remainingMs,
} from "./countdown";

const T = Date.parse("2026-10-05T12:00:00.000Z");

describe("clockSkewMs", () => {
  it("is server minus client", () => {
    expect(clockSkewMs("2026-10-05T12:00:10.000Z", T)).toBe(10_000);
    expect(clockSkewMs("2026-10-05T11:59:50.000Z", T)).toBe(-10_000);
  });
  it("is 0 for an unparseable serverTime", () => {
    expect(clockSkewMs("nope", T)).toBe(0);
  });
});

describe("remainingMs", () => {
  it("measures against server time via skew", () => {
    // Client clock 60 s behind the server: 3 min left on the server clock.
    expect(remainingMs("2026-10-05T12:04:00.000Z", T, 60_000)).toBe(180_000);
  });
  it("clamps at 0 once passed", () => {
    expect(remainingMs("2026-10-05T11:59:00.000Z", T, 0)).toBe(0);
  });
  it("is 0 for an unparseable nextCoolsAt", () => {
    expect(remainingMs("nope", T, 0)).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("renders m:ss, rounding up partial seconds", () => {
    expect(formatRemaining(192_000)).toBe("3:12");
    expect(formatRemaining(1)).toBe("0:01");
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(3_600_000)).toBe("60:00");
  });
  it("never renders NaN", () => {
    expect(formatRemaining(Number.NaN)).toBe("0:00");
    expect(formatRemaining(-5)).toBe("0:00");
  });
});

describe("refetchDelayMs", () => {
  it("fires 500 ms after nextCoolsAt", () => {
    expect(refetchDelayMs("2026-10-05T12:00:05.000Z", T, 0, 15_000)).toBe(
      5_500,
    );
  });
  it("fires 500 ms from now when already passed", () => {
    expect(refetchDelayMs("2026-10-05T11:00:00.000Z", T, 0, 15_000)).toBe(500);
  });
  it("returns null when polling will get there first (also avoids setTimeout overflow)", () => {
    expect(refetchDelayMs("2026-10-05T12:00:20.000Z", T, 0, 15_000)).toBe(null);
    expect(refetchDelayMs("2027-10-05T12:00:00.000Z", T, 0, 15_000)).toBe(null);
  });
  it("returns null for an unparseable nextCoolsAt", () => {
    expect(refetchDelayMs("nope", T, 0, 15_000)).toBe(null);
  });
});

describe("copy", () => {
  it("singular", () => {
    expect(hotCountText(1)).toBe("1 hot coffee");
    expect(coolsInText(1)).toBe("cools in");
  });
  it("plural", () => {
    expect(hotCountText(2)).toBe("2 hot coffees");
    expect(coolsInText(2)).toBe("next one cools in");
  });
});
