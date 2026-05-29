import { Controller, Get, MessageEvent, Sse } from "@nestjs/common";
import { Observable, merge, of } from "rxjs";
import { debounceTime, map } from "rxjs/operators";
import { VisualizationEventsService } from "./visualization-events.service";
import { VisualizationService } from "./visualization.service";
import type { VisualizationDataResponse } from "./visualization.types";

@Controller()
export class VisualizationController {
  constructor(
    private readonly visualization: VisualizationService,
    private readonly events: VisualizationEventsService,
  ) {}

  @Get("visualization-data")
  list(): VisualizationDataResponse {
    return this.visualization.list();
  }

  // SSE stream — pushes a full snapshot immediately on connect, then on each
  // domain mutation. debounceTime(50) coalesces rapid bursts (e.g. checkout
  // emits twice: create order + clear cart).
  @Sse("visualization-updates")
  updates(): Observable<MessageEvent> {
    return merge(
      of(null),
      this.events.changed$.pipe(debounceTime(50)),
    ).pipe(
      map(() => ({ data: this.visualization.list() } as MessageEvent)),
    );
  }
}
