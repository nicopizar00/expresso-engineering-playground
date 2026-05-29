// Cross-cutting in-process event bus. Domain services publish a coarse
// "state changed" signal here; the visualization module subscribes to drive
// its SSE snapshot. Keeping this in core/ ensures that domain modules
// (cart, orders, checkout) depend on infrastructure, not on presentation.

import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

@Injectable()
export class DomainEventsService {
  private readonly _changed$ = new Subject<void>();
  readonly changed$: Observable<void> = this._changed$.asObservable();

  emit(): void {
    this._changed$.next();
  }
}
