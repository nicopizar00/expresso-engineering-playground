/**
 * Performance Data Adapter
 *
 * Abstraction layer between the UI components and the data source.
 * Currently backed by mock data, designed for future k6/Grafana integration.
 *
 * ## Integration Points
 *
 * Future integrations will replace these functions while keeping the same shape:
 * - k6 summary JSON output (post-test reports)
 * - Grafana dashboard API (live metrics)
 * - Performance report artifacts from CI
 *
 * TODO(api-wire): Replace mock adapter with k6/Grafana/report adapter
 * TODO(types): Import performance types from shared contracts once promoted
 */

import {
  getPerformanceSnapshot,
  getScenarios,
  startScenario,
  stopScenario,
  isScenarioRunning,
  getActiveScenario,
  type PerformanceSnapshot,
  type PerformanceScenario,
  type ServiceMetrics,
  type KPISnapshot,
  type RequestFlowStep,
  type ServiceName,
  type HealthState,
  type ScenarioIntensity,
} from './mock-performance-data';

// Re-export types for consumers
export type {
  PerformanceSnapshot,
  PerformanceScenario,
  ServiceMetrics,
  KPISnapshot,
  RequestFlowStep,
  ServiceName,
  HealthState,
  ScenarioIntensity,
};

// ---------------------------------------------------------------------------
// Adapter Configuration
// ---------------------------------------------------------------------------

export interface PerformanceAdapterConfig {
  /**
   * Polling interval for live updates in milliseconds.
   * Default: 1000ms (1 second)
   */
  pollingIntervalMs: number;

  /**
   * Whether to use mock data or attempt real integration.
   * Currently always true; future versions may read from environment.
   *
   * TODO(api-wire): Read from NEXT_PUBLIC_PERF_DATA_SOURCE env var
   */
  useMockData: boolean;
}

const DEFAULT_CONFIG: PerformanceAdapterConfig = {
  pollingIntervalMs: 1000,
  useMockData: true,
};

let config: PerformanceAdapterConfig = { ...DEFAULT_CONFIG };

/**
 * Configure the performance adapter.
 * Call this during app initialization if custom config is needed.
 */
export function configurePerformanceAdapter(newConfig: Partial<PerformanceAdapterConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get the current adapter configuration.
 */
export function getAdapterConfig(): PerformanceAdapterConfig {
  return { ...config };
}

// ---------------------------------------------------------------------------
// Public Adapter API
// ---------------------------------------------------------------------------

/**
 * Fetch the current performance snapshot.
 * This is the main entry point for UI components.
 *
 * TODO(api-wire): Add real data source integration
 */
export async function fetchPerformanceSnapshot(): Promise<PerformanceSnapshot> {
  // Simulate async behavior for future API compatibility
  return Promise.resolve(getPerformanceSnapshot());
}

/**
 * Fetch all available performance scenarios.
 *
 * TODO(api-wire): May fetch from CI artifacts or k6 config
 */
export async function fetchScenarios(): Promise<PerformanceScenario[]> {
  return Promise.resolve(getScenarios());
}

/**
 * Start a performance scenario by ID.
 * Returns the started scenario or null if not found.
 *
 * TODO(api-wire): May trigger actual k6 execution in future
 */
export async function runScenario(scenarioId: string): Promise<PerformanceScenario | null> {
  return Promise.resolve(startScenario(scenarioId));
}

/**
 * Stop the currently running scenario.
 *
 * TODO(api-wire): May stop actual k6 execution in future
 */
export async function haltScenario(): Promise<void> {
  stopScenario();
  return Promise.resolve();
}

/**
 * Check if any scenario is currently active.
 */
export function hasActiveScenario(): boolean {
  return isScenarioRunning();
}

/**
 * Get the currently running scenario.
 */
export function getCurrentScenario(): PerformanceScenario | null {
  return getActiveScenario();
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Format a number as a compact string (e.g., 1.2k, 3.5M)
 */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toFixed(0);
}

/**
 * Format latency in milliseconds to a readable string
 */
export function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms}ms`;
}

/**
 * Format a percentage (0-1) to a display string
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Get CSS color variable for health state
 */
export function getHealthColor(state: HealthState): string {
  switch (state) {
    case 'healthy':
      return 'var(--success)';
    case 'degraded':
      return 'var(--warning)';
    case 'critical':
      return 'var(--destructive)';
    case 'idle':
    default:
      return 'var(--muted-foreground)';
  }
}

/**
 * Get CSS color variable for scenario intensity
 */
export function getIntensityColor(intensity: ScenarioIntensity): string {
  switch (intensity) {
    case 'stress':
      return 'var(--destructive)';
    case 'high':
      return 'var(--warning)';
    case 'medium':
      return 'var(--info)';
    case 'low':
    default:
      return 'var(--success)';
  }
}

// ---------------------------------------------------------------------------
// Future Integration Notes
// ---------------------------------------------------------------------------

/**
 * Future k6 Integration
 *
 * k6 outputs summary data in JSON format after test completion.
 * The adapter would parse this format:
 *
 * {
 *   "metrics": {
 *     "http_req_duration": { "avg": 45.2, "p(95)": 120.5, ... },
 *     "http_reqs": { "count": 15000, "rate": 250.0 },
 *     "http_req_failed": { "rate": 0.02 }
 *   },
 *   "root_group": { ... }
 * }
 *
 * TODO(api-wire): Implement k6JsonAdapter.parseReport(json)
 */

/**
 * Future Grafana Integration
 *
 * Grafana provides a REST API for querying dashboards and panels.
 * The adapter would call:
 *
 * GET /api/datasources/proxy/:id/api/v1/query_range
 *
 * With PromQL queries for each metric we want to display.
 *
 * TODO(api-wire): Implement GrafanaAdapter.fetchMetrics(dashboardId, timeRange)
 */
