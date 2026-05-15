import { describe, expect, it } from "vitest";
import { VisualizationService } from "./visualization.service";

const VALID_TYPES = new Set(["cube", "sphere", "marker"]);
const VALID_STATUSES = new Set(["ok", "warn", "error", "idle"]);

describe("VisualizationService", () => {
  it("returns a non-empty items array", () => {
    const svc = new VisualizationService();
    const { items } = svc.list();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it("every item conforms to the VisualizationItem DTO shape", () => {
    const svc = new VisualizationService();
    const { items } = svc.list();

    for (const item of items) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.label).toBe("string");
      expect(item.label.length).toBeGreaterThan(0);
      expect(VALID_TYPES.has(item.type)).toBe(true);
      expect(typeof item.value).toBe("number");
      expect(Number.isFinite(item.value)).toBe(true);
      expect(VALID_STATUSES.has(item.status)).toBe(true);

      expect(item.positionHint).toBeDefined();
      expect(typeof item.positionHint.x).toBe("number");
      expect(typeof item.positionHint.y).toBe("number");
      expect(typeof item.positionHint.z).toBe("number");
      expect(Number.isFinite(item.positionHint.x)).toBe(true);
      expect(Number.isFinite(item.positionHint.y)).toBe(true);
      expect(Number.isFinite(item.positionHint.z)).toBe(true);

      expect(item.metadata).toBeDefined();
      expect(typeof item.metadata).toBe("object");
    }
  });

  it("returns a deterministic mock set across calls", () => {
    const svc = new VisualizationService();
    const first = svc.list();
    const second = svc.list();

    expect(second.items.length).toBe(first.items.length);
    expect(second.items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));
  });
});
