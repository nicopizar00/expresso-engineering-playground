import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import type { WorkflowTrafficEvent, WorkflowTrafficEventInput } from "./workflow-traffic.types";

const BUFFER_LIMIT = 500;

@Injectable()
export class WorkflowTrafficService {
  private readonly buffer: WorkflowTrafficEvent[] = [];
  private readonly _events$ = new Subject<WorkflowTrafficEvent>();
  readonly events$: Observable<WorkflowTrafficEvent> = this._events$.asObservable();

  record(input: WorkflowTrafficEventInput): WorkflowTrafficEvent {
    const event: WorkflowTrafficEvent = {
      runId: input.runId,
      useCaseId: input.useCaseId,
      useCaseVersion: input.useCaseVersion,
      iterationId: input.iterationId,
      outcome: input.outcome,
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    this.buffer.push(event);
    if (this.buffer.length > BUFFER_LIMIT) this.buffer.shift();
    this._events$.next(event);
    return event;
  }

  recentHistory(): readonly WorkflowTrafficEvent[] {
    return this.buffer;
  }
}
