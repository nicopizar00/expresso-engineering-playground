import { describe, expect, it } from "vitest";
import { WorkflowTrafficController } from "./workflow-traffic.controller";
import { WorkflowTrafficService } from "./workflow-traffic.service";
import type { MessageEvent } from "@nestjs/common";

describe("WorkflowTrafficController", () => {
  describe("POST /workflow-traffic/events", () => {
    it("records the posted event and accepts immediately", () => {
      const svc = new WorkflowTrafficService();
      const controller = new WorkflowTrafficController(svc);
      const result = controller.ingest({
        runId: "run-1",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "iter-1",
        outcome: "started",
      });
      expect(result).toEqual({ accepted: true });
      expect(svc.recentHistory()).toHaveLength(1);
      expect(svc.recentHistory()[0].iterationId).toBe("iter-1");
    });
  });

  describe("GET /workflow-traffic-updates", () => {
    it("replays buffered history to a new subscriber", async () => {
      const svc = new WorkflowTrafficService();
      svc.record({
        runId: "run-1",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "iter-1",
        outcome: "started",
      });
      const controller = new WorkflowTrafficController(svc);
      const first = await new Promise<MessageEvent>((resolve) => {
        controller.updates().subscribe((message) => resolve(message));
      });
      expect((first.data as { iterationId: string }).iterationId).toBe("iter-1");
    });

    it("streams new events to an existing subscriber", () => {
      const svc = new WorkflowTrafficService();
      const controller = new WorkflowTrafficController(svc);
      const messages: MessageEvent[] = [];
      controller.updates().subscribe((message) => messages.push(message));
      svc.record({
        runId: "run-1",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "iter-2",
        outcome: "succeeded",
      });
      expect(messages).toHaveLength(1);
      expect((messages[0].data as { iterationId: string }).iterationId).toBe("iter-2");
    });

    it("replays only the current run's buffered history, not a prior run's tail", () => {
      const svc = new WorkflowTrafficService();
      svc.record({
        runId: "run-0",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "old-1",
        outcome: "succeeded",
      });
      svc.record({
        runId: "run-1",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "iter-1",
        outcome: "started",
      });
      const controller = new WorkflowTrafficController(svc);
      const messages: MessageEvent[] = [];
      controller.updates().subscribe((message) => messages.push(message));
      expect(messages).toHaveLength(1);
      expect((messages[0].data as { iterationId: string }).iterationId).toBe("iter-1");
    });

    it("does not replay a stale run's buffered history to a new subscriber", () => {
      const svc = new WorkflowTrafficService();
      svc.record({
        runId: "run-old",
        useCaseId: "commerce.purchase",
        useCaseVersion: 1,
        iterationId: "stale-1",
        outcome: "succeeded",
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      });
      const controller = new WorkflowTrafficController(svc);
      const messages: MessageEvent[] = [];
      controller.updates().subscribe((message) => messages.push(message));
      expect(messages).toHaveLength(0);
    });
  });
});
