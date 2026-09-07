import { Body, Controller, HttpCode, MessageEvent, Post, Sse } from "@nestjs/common";
import { Observable, concat, from } from "rxjs";
import { map } from "rxjs/operators";
import { WorkflowTrafficService } from "./workflow-traffic.service";
import type { WorkflowTrafficEventInput } from "./workflow-traffic.types";

const REPLAY_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes — stale-run guard so a client
// connecting long after a campaign ended doesn't resurrect its HUD/cups.

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
  //
  // The buffer is also never cleared, so "most recent event" alone is not
  // enough: hours after a campaign ends its tail is still the newest thing
  // buffered. Replay is therefore bounded by REPLAY_MAX_AGE_MS *before* the
  // current run is derived, so a client connecting with no campaign running
  // gets an empty replay and its HUD stays hidden.
  @Sse("workflow-traffic-updates")
  updates(): Observable<MessageEvent> {
    const cutoff = Date.now() - REPLAY_MAX_AGE_MS;
    const history = this.trafficService
      .recentHistory()
      .filter((event) => Date.parse(event.timestamp) >= cutoff);
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
