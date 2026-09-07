import { describe, expect, it } from "vitest";
import { WorkflowTrafficService } from "./workflow-traffic.service";
import type { WorkflowTrafficEventInput } from "./workflow-traffic.types";

function makeEvent(overrides: Partial<WorkflowTrafficEventInput> = {}): WorkflowTrafficEventInput {
  return {
    runId: "run-1",
    useCaseId: "commerce.purchase",
    useCaseVersion: 1,
    iterationId: "iter-1",
    outcome: "started",
    ...overrides,
  };
}

describe("WorkflowTrafficService", () => {
  it("records an event and stamps a timestamp when none is given", () => {
    const svc = new WorkflowTrafficService();
    const event = svc.record(makeEvent());
    expect(event.iterationId).toBe("iter-1");
    expect(typeof event.timestamp).toBe("string");
  });

  it("keeps a caller-supplied timestamp", () => {
    const svc = new WorkflowTrafficService();
    const event = svc.record(makeEvent({ timestamp: "2026-01-01T00:00:00.000Z" }));
    expect(event.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns buffered events in arrival order", () => {
    const svc = new WorkflowTrafficService();
    svc.record(makeEvent({ iterationId: "iter-1", outcome: "started" }));
    svc.record(makeEvent({ iterationId: "iter-1", outcome: "succeeded" }));
    const history = svc.recentHistory();
    expect(history.map((e) => e.outcome)).toEqual(["started", "succeeded"]);
  });

  it("caps the buffer at 500 events, dropping the oldest first", () => {
    const svc = new WorkflowTrafficService();
    for (let i = 0; i < 501; i++) {
      svc.record(makeEvent({ iterationId: `iter-${i}` }));
    }
    const history = svc.recentHistory();
    expect(history).toHaveLength(500);
    expect(history[0].iterationId).toBe("iter-1");
    expect(history[499].iterationId).toBe("iter-500");
  });

  it("emits recorded events on events$", () => {
    const svc = new WorkflowTrafficService();
    const received: string[] = [];
    svc.events$.subscribe((event) => received.push(event.iterationId));
    svc.record(makeEvent({ iterationId: "iter-live" }));
    expect(received).toEqual(["iter-live"]);
  });
});
