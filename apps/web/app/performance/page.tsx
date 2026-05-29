'use client';

/**
 * Performance Playground Page
 *
 * Visualizes simulated behavior under concurrent web service requests.
 * This is a design evaluation surface using deterministic mock data.
 *
 * IMPORTANT: All data is simulated. This page does not represent live
 * telemetry, real Grafana data, or actual k6 execution results.
 */

import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, FlaskConical, Info } from 'lucide-react';
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

  // Refresh the locally simulated snapshot
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
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-lg"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1
                className="text-2xl font-semibold tracking-tight"
                style={{ color: 'var(--foreground)' }}
              >
                Performance Playground
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-md uppercase tracking-wider"
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    color: 'var(--info)',
                  }}
                >
                  <FlaskConical className="h-3 w-3" />
                  Simulated Data
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Mock data notice */}
        <div 
          className="flex items-start gap-3 p-4 rounded-xl mb-6"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
        >
          <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--info)' }} />
          <div>
            <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--foreground)' }}>
              This is a design evaluation surface
            </p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              All performance data shown is deterministic mock data for demonstration purposes. 
              This does not represent live telemetry, real Grafana data, or actual k6 execution results.
            </p>
          </div>
        </div>

        <p className="text-sm max-w-2xl" style={{ color: 'var(--muted-foreground)' }}>
          Select a scenario to simulate different traffic patterns and observe how services 
          respond with varying latency, throughput, and error rates.
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
                  className="text-sm font-medium"
                  style={{ color: 'var(--foreground)' }}
                >
                  Service Activity
                </h2>
                <button
                  onClick={() => setIsAnimated(!isAnimated)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: isAnimated ? 'var(--primary)' : 'var(--secondary)',
                    color: isAnimated ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  }}
                  aria-pressed={isAnimated}
                >
                  <RefreshCw className={`h-3 w-3 ${isAnimated ? 'animate-spin' : ''}`} />
                  {isAnimated ? 'Live' : 'Paused'}
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

function ErrorState() {
  return (
    <div
      className="flex items-center justify-center py-16"
      role="alert"
    >
      <div className="text-center max-w-md">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
        >
          <Activity className="h-6 w-6" />
        </div>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
          Failed to Load Performance Data
        </h3>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Could not retrieve performance metrics. Please try refreshing the page.
        </p>
      </div>
    </div>
  );
}
