import { Body, Controller, HttpCode, MessageEvent, Post, Sse } from "@nestjs/common";
import { Observable, concat, from } from "rxjs";
import { map } from "rxjs/operators";
import { WorkflowTrafficService } from "./workflow-traffic.service";
import type { WorkflowTrafficEventInput } from "./workflow-traffic.types";

@Controller()
export class WorkflowTrafficController {
  constructor(private readonly trafficService: WorkflowTrafficService) {}

  @Post("workflow-traffic/events")
  @HttpCode(202)
  ingest(@Body() body: WorkflowTrafficEventInput): { accepted: true } {
    this.trafficService.record(body);
    return { accepted: true };
  }

  // Event-based, not snapshot-based: each SSE message is one workflow-traffic
  // event, distinct from /visualization-updates' recomputed full-state model.
  //
  // The service's buffer is a single global FIFO, not partitioned by run
  // (Task 1). A new subscriber must see only "the current run's recent
  // history" (spec RUN-005), so replay is filtered here to the runId of the
  // most recently buffered event — a prior run's tail is never replayed.
  @Sse("workflow-traffic-updates")
  updates(): Observable<MessageEvent> {
    const history = this.trafficService.recentHistory();
    const lastEvent = history.length > 0 ? history[history.length - 1] : null;
    const currentRunId = lastEvent ? lastEvent.runId : null;
    const currentRunHistory = currentRunId === null
      ? []
      : history.filter((event) => event.runId === currentRunId);
    return concat(
      from(currentRunHistory),
      this.trafficService.events$,
    ).pipe(map((event) => ({ data: event }) as MessageEvent));
  }
}
