'use client';

/**
 * Performance Playground Page
 *
 * Visualizes system behavior under concurrent web service requests.
 * Shows "the system breathing under load" — not a traditional monitoring dashboard.
 *
 * ## Design Principle
 * This page communicates engineering behavior in a simple, elegant, understandable way.
 * It does not attempt to be a production observability tool.
 *
 * ## Current State
 * All data is mocked. Future versions will integrate with:
 * - k6 summary output
 * - Grafana dashboard links
 * - Performance report artifacts
 *
 * TODO(v0-export): Component ready for repository integration
 * TODO(api-wire): Replace mock performance adapter with k6/Grafana/report adapter
 * TODO(state): Replace local scenario playback state if needed
 * TODO(types): Replace mock performance types with shared contracts or report DTOs
 * TODO(error-handling): Connect real performance data error handling
 */

import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import {
  fetchPerformanceSnapshot,
  fetchScenarios,
  runScenario,
  haltScenario,
  type PerformanceSnapshot,
  type PerformanceScenario,
} from '@/lib/performance/performance-adapter';
import { ServiceActivityCard } from '@/components/performance/ServiceActivityCard';
import { ScenarioSelector } from '@/components/performance/ScenarioSelector';
import { KPIStrip } from '@/components/performance/KPIStrip';
import { RequestFlowDiagram } from '@/components/performance/RequestFlowDiagram';
import { FutureIntegrationPanel } from '@/components/performance/FutureIntegrationPanel';

export default function PerformancePage() {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [scenarios, setScenarios] = useState<PerformanceScenario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnimated, setIsAnimated] = useState(true);

  // Initial load
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [snap, scen] = await Promise.all([
        fetchPerformanceSnapshot(),
        fetchScenarios(),
      ]);
      setSnapshot(snap);
      setScenarios(scen);
      setIsLoading(false);
    }
    load();
  }, []);

  // Polling for live updates
  useEffect(() => {
    const interval = setInterval(async () => {
      const snap = await fetchPerformanceSnapshot();
      setSnapshot(snap);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleStartScenario = useCallback(async (scenarioId: string) => {
    await runScenario(scenarioId);
    const snap = await fetchPerformanceSnapshot();
    setSnapshot(snap);
  }, []);

  const handleStopScenario = useCallback(async () => {
    await haltScenario();
    const snap = await fetchPerformanceSnapshot();
    setSnapshot(snap);
  }, []);

  return (
    <div className="container py-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="p-2.5 rounded-lg"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1
              className="text-2xl font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              Performance Playground
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="px-2 py-0.5 text-xs font-medium rounded-full"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: 'var(--info)',
                }}
              >
                Mock Data
              </span>
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Simulated load scenarios for design validation
              </span>
            </div>
          </div>
        </div>
        <p style={{ color: 'var(--muted-foreground)' }} className="max-w-2xl text-sm">
          Watch the system breathe under load. Select a scenario below to simulate different
          traffic patterns and observe how services respond with varying latency, throughput,
          and error rates.
        </p>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : snapshot ? (
        <div className="space-y-6">
          {/* KPI Strip */}
          <KPIStrip kpis={snapshot.kpis} />

          {/* Main Grid */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column: Service Cards */}
            <div className="lg:col-span-2 space-y-6">
              {/* Animation Toggle */}
              <div className="flex items-center justify-between">
                <h2
                  className="text-sm font-semibold"
                  style={{ color: 'var(--foreground)' }}
                >
                  Service Activity
                </h2>
                <button
                  onClick={() => setIsAnimated(!isAnimated)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--muted-foreground)',
                  }}
                  aria-pressed={isAnimated}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isAnimated ? 'animate-spin' : ''}`} />
                  {isAnimated ? 'Animations On' : 'Animations Off'}
                </button>
              </div>

              {/* Service Cards Grid */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {snapshot.services.map((service) => (
                  <ServiceActivityCard
                    key={service.name}
                    service={service}
                    isAnimated={isAnimated && snapshot.scenario !== null}
                  />
                ))}
              </div>

              {/* Request Flow Diagram */}
              <RequestFlowDiagram
                flow={snapshot.requestFlow}
                isAnimated={isAnimated && snapshot.scenario !== null}
              />
            </div>

            {/* Right Column: Scenario Selector */}
            <div className="lg:col-span-1 space-y-6">
              <ScenarioSelector
                scenarios={scenarios}
                activeScenario={snapshot.scenario}
                onStart={handleStartScenario}
                onStop={handleStopScenario}
              />

              {/* Future Integration Panel */}
              <FutureIntegrationPanel />
            </div>
          </div>
        </div>
      ) : (
        <ErrorState />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading State
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div
      className="flex items-center justify-center py-16"
      role="status"
      aria-label="Loading performance data"
    >
      <div className="text-center">
        <RefreshCw
          className="h-8 w-8 animate-spin mx-auto mb-3"
          style={{ color: 'var(--primary)' }}
        />
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Loading performance data...
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function ErrorState() {
  return (
    <div
      className="flex items-center justify-center py-16"
      role="alert"
    >
      <div className="text-center max-w-md">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
        >
          <Activity className="h-6 w-6" />
        </div>
        <h3
          className="font-semibold mb-2"
          style={{ color: 'var(--foreground)' }}
        >
          Failed to Load Performance Data
        </h3>
        <p
          className="text-sm"
          style={{ color: 'var(--muted-foreground)' }}
        >
          Could not retrieve performance metrics. Please try refreshing the page.
        </p>
      </div>
    </div>
  );
}
