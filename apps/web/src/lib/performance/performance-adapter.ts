/**
 * Performance Data Adapter
 *
 * Abstraction layer between the UI components and the data source.
 * This implementation is intentionally backed by deterministic frontend mocks.
 *
 * ## Integration Points
 *
 * A future product decision could supply saved performance artifacts or
 * observable metric data through the same presentation interface. The mock
 * shapes remain local while this route does not consume a runtime API.
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
   * Polling interval for simulated snapshot refreshes in milliseconds.
   * Default: 1000ms (1 second)
   */
  pollingIntervalMs: number;

  /**
   * Whether to use mock data. This surface currently supports mock data only.
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
 */
export async function fetchPerformanceSnapshot(): Promise<PerformanceSnapshot> {
  // Simulate async behavior for future API compatibility
  return Promise.resolve(getPerformanceSnapshot());
}

/**
 * Fetch all available performance scenarios.
 */
export async function fetchScenarios(): Promise<PerformanceScenario[]> {
  return Promise.resolve(getScenarios());
}

/**
 * Start a performance scenario by ID.
 * Returns the started scenario or null if not found.
 * This starts local playback only; it does not execute a load test.
 */
export async function runScenario(scenarioId: string): Promise<PerformanceScenario | null> {
  return Promise.resolve(startScenario(scenarioId));
}

/**
 * Stop the currently running scenario.
 * This stops local playback only.
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
// Potential Adapter Notes
// ---------------------------------------------------------------------------

/**
 * A future saved-artifact adapter could parse completed k6 output without
 * starting tests from this view. The existing k6 scenarios are currently
 * independent of this frontend demonstration.
 *
 * Example saved metric shape:
 *
 * {
 *   "metrics": {
 *     "http_req_duration": { "avg": 45.2, "p(95)": 120.5, ... },
 *     "http_reqs": { "count": 15000, "rate": 250.0 },
 *     "http_req_failed": { "rate": 0.02 }
 *   },
 *   "root_group": { ... }
 * }
 */
