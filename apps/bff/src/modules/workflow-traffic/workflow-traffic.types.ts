export type WorkflowTrafficOutcome = "started" | "succeeded" | "failed";

export interface WorkflowTrafficEvent {
  readonly runId: string;
  readonly useCaseId: string;
  readonly useCaseVersion: number;
  readonly iterationId: string;
  readonly outcome: WorkflowTrafficOutcome;
  readonly timestamp: string;
}

export interface WorkflowTrafficEventInput {
  runId: string;
  useCaseId: string;
  useCaseVersion: number;
  iterationId: string;
  outcome: WorkflowTrafficOutcome;
  timestamp?: string;
}
