import { describe, expect, it } from "vitest";
import {
  DEFAULT_COOL_DOWN_SECONDS,
  coolsAt,
  parseCoolDownSeconds,
  temperatureOf,
} from "./order-temperature";

const PLACED = new Date("2026-10-04T12:00:00.000Z");
const FIVE_MIN = 5 * 60 * 1000;
const at = (ms: number) => new Date(PLACED.getTime() + ms);

describe("temperatureOf", () => {
  it("is hot right after placement", () => {
    expect(temperatureOf(PLACED, at(0), FIVE_MIN)).toBe("hot");
  });

  it("is hot at 4:59.999", () => {
    expect(temperatureOf(PLACED, at(FIVE_MIN - 1), FIVE_MIN)).toBe("hot");
  });

  it("is cold exactly at the 5:00 boundary", () => {
    expect(temperatureOf(PLACED, at(FIVE_MIN), FIVE_MIN)).toBe("cold");
  });

  it("is cold after the boundary", () => {
    expect(temperatureOf(PLACED, at(FIVE_MIN + 60_000), FIVE_MIN)).toBe("cold");
  });

  it("treats a clock behind placedAt as hot", () => {
    expect(temperatureOf(PLACED, at(-1000), FIVE_MIN)).toBe("hot");
  });
});

describe("coolsAt", () => {
  it("adds the cool-down to placedAt", () => {
    expect(coolsAt(PLACED, FIVE_MIN).toISOString()).toBe("2026-10-04T12:05:00.000Z");
  });
});

describe("parseCoolDownSeconds", () => {
  it("defaults to 300 when unset or empty", () => {
    expect(parseCoolDownSeconds(undefined)).toBe(DEFAULT_COOL_DOWN_SECONDS);
    expect(parseCoolDownSeconds("")).toBe(300);
  });

  it("accepts a positive integer", () => {
    expect(parseCoolDownSeconds("20")).toBe(20);
  });

  it.each(["0", "-5", "1.5", "abc", "10s", " 7 "])("rejects %j", (raw) => {
    expect(() => parseCoolDownSeconds(raw)).toThrow(
      /ORDER_COOL_DOWN_SECONDS must be a positive integer/,
    );
  });
});
