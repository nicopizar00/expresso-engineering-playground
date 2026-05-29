import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

@Injectable()
export class VisualizationEventsService {
  private readonly _changed$ = new Subject<void>();
  readonly changed$: Observable<void> = this._changed$.asObservable();

  emit(): void {
    this._changed$.next();
  }
}
