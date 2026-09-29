export interface TextSummaryOptions {
  indent?: string;
  enableColors?: boolean;
  summaryTimeUnit?: string | null;
  summaryTrendStats?: string[] | null;
}

export function textSummary(data: unknown, options?: TextSummaryOptions): string;
