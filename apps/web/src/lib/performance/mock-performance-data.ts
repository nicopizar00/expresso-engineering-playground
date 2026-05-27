/**
 * Mock Performance Data for the Performance Playground
 *
 * This module provides deterministic mock data for visualizing system behavior
 * under concurrent load. These local presentation types are intentionally not
 * part of the public HTTP contracts package.
 *
 * ## Design Principle
 * Show simulated request pressure without implying live monitoring.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceName = 'catalog' | 'cart' | 'checkout' | 'orders' | 'bff' | 'persistence';

export type HealthState = 'healthy' | 'degraded' | 'critical' | 'idle';

export type ScenarioIntensity = 'low' | 'medium' | 'high' | 'stress';

export interface ServiceMetrics {
  name: ServiceName;
  displayName: string;
  requestsPerSecond: number;
  latencyP95Ms: number;
  errorRate: number;
  healthState: HealthState;
  activeConnections: number;
}

export interface PerformanceScenario {
  id: string;
  name: string;
  description: string;
  virtualUsers: number;
  requestRate: number;
  durationSeconds: number;
  intensity: ScenarioIntensity;
  affectedServices: ServiceName[];
}

export interface KPISnapshot {
  virtualUsers: number;
  requestsPerSecond: number;
  latencyP95Ms: number;
  errorRate: number;
  successRate: number;
  activeScenario: string | null;
}

export interface RequestFlowStep {
  from: string;
  to: string;
  requestsPerSecond: number;
  latencyMs: number;
  errorRate: number;
}

export interface PerformanceSnapshot {
  timestamp: string;
  kpis: KPISnapshot;
  services: ServiceMetrics[];
  requestFlow: RequestFlowStep[];
  scenario: PerformanceScenario | null;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const PERFORMANCE_SCENARIOS: PerformanceScenario[] = [
  {
    id: 'browsing-load',
    name: 'Browsing Load',
    description: 'Simulates typical user browsing behavior - catalog views, product details, light cart activity.',
    virtualUsers: 25,
    requestRate: 150,
    durationSeconds: 120,
    intensity: 'low',
    affectedServices: ['catalog', 'bff'],
  },
  {
    id: 'checkout-spike',
    name: 'Checkout Spike',
    description: 'High-volume checkout activity simulating a flash sale or peak hour.',
    virtualUsers: 100,
    requestRate: 450,
    durationSeconds: 60,
    intensity: 'high',
    affectedServices: ['checkout', 'cart', 'orders', 'persistence', 'bff'],
  },
  {
    id: 'mixed-journey',
    name: 'Mixed User Journey',
    description: 'Realistic mix of browsing, adding to cart, checkout, and order lookups.',
    virtualUsers: 50,
    requestRate: 280,
    durationSeconds: 180,
    intensity: 'medium',
    affectedServices: ['catalog', 'cart', 'checkout', 'orders', 'bff'],
  },
  {
    id: 'catalog-stress',
    name: 'Catalog Stress',
    description: 'Heavy catalog reads simulating search indexing or scraper traffic.',
    virtualUsers: 200,
    requestRate: 800,
    durationSeconds: 90,
    intensity: 'stress',
    affectedServices: ['catalog', 'bff', 'persistence'],
  },
  {
    id: 'order-lookup-pressure',
    name: 'Order Lookup Pressure',
    description: 'High volume of order status checks - typical after a promotion ends.',
    virtualUsers: 75,
    requestRate: 320,
    durationSeconds: 120,
    intensity: 'medium',
    affectedServices: ['orders', 'bff', 'persistence'],
  },
  {
    id: 'error-injection',
    name: 'Error Injection',
    description: 'Simulates degraded state with elevated error rates across services.',
    virtualUsers: 30,
    requestRate: 100,
    durationSeconds: 60,
    intensity: 'low',
    affectedServices: ['catalog', 'cart', 'checkout', 'orders', 'bff'],
  },
];

// ---------------------------------------------------------------------------
// Service Display Names
// ---------------------------------------------------------------------------

export const SERVICE_DISPLAY_NAMES: Record<ServiceName, string> = {
  catalog: 'Catalog',
  cart: 'Cart',
  checkout: 'Checkout',
  orders: 'Orders',
  bff: 'BFF Gateway',
  persistence: 'Persistence',
};

// ---------------------------------------------------------------------------
// Mock Data Generation
// ---------------------------------------------------------------------------

function getHealthState(errorRate: number, latencyMs: number): HealthState {
  if (errorRate > 0.1) return 'critical';
  if (errorRate > 0.02 || latencyMs > 500) return 'degraded';
  if (latencyMs < 10) return 'idle';
  return 'healthy';
}

function generateServiceMetrics(
  scenario: PerformanceScenario | null,
  elapsed: number
): ServiceMetrics[] {
  const services: ServiceName[] = ['bff', 'catalog', 'cart', 'checkout', 'orders', 'persistence'];
  const isErrorScenario = scenario?.id === 'error-injection';

  return services.map((name) => {
    const isAffected = scenario?.affectedServices.includes(name) ?? false;
    const baseLoad = isAffected ? scenario!.requestRate / scenario!.affectedServices.length : 0;
    
    // Add time-based variation (simulated breathing)
    const timeFactor = Math.sin(elapsed * 0.1) * 0.2 + 1;
    const requestsPerSecond = Math.round(baseLoad * timeFactor);
    
    // Calculate latency based on load
    const baseLatency = name === 'persistence' ? 15 : name === 'bff' ? 5 : 25;
    const loadFactor = isAffected ? (scenario?.intensity === 'stress' ? 4 : scenario?.intensity === 'high' ? 2 : 1.2) : 1;
    const latencyP95Ms = Math.round(baseLatency * loadFactor * (1 + Math.random() * 0.3));
    
    // Calculate error rate
    let errorRate = 0;
    if (isErrorScenario && isAffected) {
      errorRate = 0.05 + Math.random() * 0.08;
    } else if (scenario?.intensity === 'stress' && isAffected) {
      errorRate = 0.01 + Math.random() * 0.02;
    }

    return {
      name,
      displayName: SERVICE_DISPLAY_NAMES[name],
      requestsPerSecond,
      latencyP95Ms,
      errorRate,
      healthState: getHealthState(errorRate, latencyP95Ms),
      activeConnections: Math.round(requestsPerSecond * 0.1),
    };
  });
}

function generateRequestFlow(
  scenario: PerformanceScenario | null,
  services: ServiceMetrics[]
): RequestFlowStep[] {
  if (!scenario) return [];

  const bff = services.find((s) => s.name === 'bff')!;
  const affected = services.filter((s) => scenario.affectedServices.includes(s.name) && s.name !== 'bff');

  const flow: RequestFlowStep[] = [
    {
      from: 'Users',
      to: 'BFF Gateway',
      requestsPerSecond: scenario.requestRate,
      latencyMs: bff.latencyP95Ms,
      errorRate: bff.errorRate,
    },
  ];

  affected.forEach((service) => {
    flow.push({
      from: 'BFF Gateway',
      to: service.displayName,
      requestsPerSecond: service.requestsPerSecond,
      latencyMs: service.latencyP95Ms,
      errorRate: service.errorRate,
    });
  });

  // Add persistence connections where applicable
  const persistenceConnected: ServiceName[] = ['catalog', 'orders', 'checkout'];
  const persistence = services.find((s) => s.name === 'persistence')!;
  
  affected
    .filter((s) => persistenceConnected.includes(s.name))
    .forEach((service) => {
      flow.push({
        from: service.displayName,
        to: 'Persistence',
        requestsPerSecond: Math.round(service.requestsPerSecond * 0.8),
        latencyMs: persistence.latencyP95Ms,
        errorRate: persistence.errorRate,
      });
    });

  return flow;
}

function generateKPIs(
  scenario: PerformanceScenario | null,
  services: ServiceMetrics[]
): KPISnapshot {
  if (!scenario) {
    return {
      virtualUsers: 0,
      requestsPerSecond: 0,
      latencyP95Ms: 0,
      errorRate: 0,
      successRate: 1,
      activeScenario: null,
    };
  }

  const totalRequests = services.reduce((sum, s) => sum + s.requestsPerSecond, 0);
  const avgLatency = services.length > 0
    ? Math.round(services.reduce((sum, s) => sum + s.latencyP95Ms, 0) / services.length)
    : 0;
  const avgErrorRate = services.length > 0
    ? services.reduce((sum, s) => sum + s.errorRate, 0) / services.length
    : 0;

  return {
    virtualUsers: scenario.virtualUsers,
    requestsPerSecond: Math.round(totalRequests / 2), // Deduplicate BFF routing
    latencyP95Ms: avgLatency,
    errorRate: Math.round(avgErrorRate * 1000) / 1000,
    successRate: Math.round((1 - avgErrorRate) * 1000) / 1000,
    activeScenario: scenario.name,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Default to "Mixed User Journey" scenario for UX demonstration
// This ensures the Performance Playground shows simulated activity on first load.
const DEFAULT_SCENARIO_ID = 'mixed-journey';

let activeScenario: PerformanceScenario | null = PERFORMANCE_SCENARIOS.find(
  (s) => s.id === DEFAULT_SCENARIO_ID
) ?? null;
let scenarioStartTime: number | null = Date.now();

/**
 * Start a performance scenario.
 * The scenario will remain active until stopped or a new scenario is started.
 */
export function startScenario(scenarioId: string): PerformanceScenario | null {
  const scenario = PERFORMANCE_SCENARIOS.find((s) => s.id === scenarioId);
  if (scenario) {
    activeScenario = scenario;
    scenarioStartTime = Date.now();
  }
  return scenario ?? null;
}

/**
 * Stop the currently active scenario.
 */
export function stopScenario(): void {
  activeScenario = null;
  scenarioStartTime = null;
}

/**
 * Get the current performance snapshot.
 * This is the main data source for the Performance Playground UI.
 */
export function getPerformanceSnapshot(): PerformanceSnapshot {
  const elapsed = scenarioStartTime ? (Date.now() - scenarioStartTime) / 1000 : 0;
  const services = generateServiceMetrics(activeScenario, elapsed);
  const requestFlow = generateRequestFlow(activeScenario, services);
  const kpis = generateKPIs(activeScenario, services);

  return {
    timestamp: new Date().toISOString(),
    kpis,
    services,
    requestFlow,
    scenario: activeScenario,
  };
}

/**
 * Get all available performance scenarios.
 */
export function getScenarios(): PerformanceScenario[] {
  return PERFORMANCE_SCENARIOS;
}

/**
 * Get the currently active scenario.
 */
export function getActiveScenario(): PerformanceScenario | null {
  return activeScenario;
}

/**
 * Check if a scenario is currently running.
 */
export function isScenarioRunning(): boolean {
  return activeScenario !== null;
}
