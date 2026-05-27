'use client';

/**
 * ScenarioSelector - Scenario selection and control panel
 *
 * Displays available performance scenarios with descriptions and allows
 * starting/stopping scenario playback.
 */

import { Play, Square, Zap, Users, Clock, Activity } from 'lucide-react';
import type { PerformanceScenario, ScenarioIntensity } from '@/lib/performance/performance-adapter';
import { getIntensityColor, formatCompact } from '@/lib/performance/performance-adapter';

interface ScenarioSelectorProps {
  scenarios: PerformanceScenario[];
  activeScenario: PerformanceScenario | null;
  onStart: (scenarioId: string) => void;
  onStop: () => void;
}

export function ScenarioSelector({
  scenarios,
  activeScenario,
  onStart,
  onStop,
}: ScenarioSelectorProps) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <Zap className="h-3.5 w-3.5" />
          Performance Scenarios
        </h2>
        {activeScenario && (
          <span
            className="px-2 py-1 text-[10px] font-medium rounded-full animate-pulse"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: 'var(--success)' }}
          >
            SIMULATED
          </span>
        )}
      </div>

      {/* Quick scenario hint */}
      {!activeScenario && (
        <p
          className="text-xs mb-3 p-2 rounded-md"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
        >
          Click a scenario to start simulating load
        </p>
      )}

      <div className="grid gap-3">
        {scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            isActive={activeScenario?.id === scenario.id}
            onStart={() => onStart(scenario.id)}
            onStop={onStop}
          />
        ))}
      </div>

      {/* Active Scenario Info */}
      {activeScenario && (
        <div
          className="mt-4 p-3 rounded-md border"
          style={{
            backgroundColor: 'var(--secondary)',
            borderColor: getIntensityColor(activeScenario.intensity),
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--success)' }}
              />
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                Active mock: {activeScenario.name}
              </span>
            </div>
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--destructive)',
                color: 'var(--destructive-foreground)',
              }}
              aria-label="Stop scenario"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {activeScenario.description}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScenarioCard({
  scenario,
  isActive,
  onStart,
  onStop,
}: {
  scenario: PerformanceScenario;
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const intensityColor = getIntensityColor(scenario.intensity);

  return (
    <button
      onClick={isActive ? onStop : onStart}
      className="w-full text-left p-3 rounded-md border transition-all"
      style={{
        backgroundColor: isActive ? 'var(--secondary)' : 'var(--background)',
        borderColor: isActive ? intensityColor : 'var(--border)',
        boxShadow: isActive ? `0 0 0 1px ${intensityColor}` : 'none',
      }}
      aria-pressed={isActive}
      aria-label={`${scenario.name}: ${isActive ? 'Stop' : 'Start'} scenario`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="font-medium text-sm"
              style={{ color: 'var(--foreground)' }}
            >
              {scenario.name}
            </span>
            <IntensityBadge intensity={scenario.intensity} />
          </div>
          <p
            className="text-xs line-clamp-2"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {scenario.description}
          </p>
          
          {/* Scenario Stats */}
          <div className="flex items-center gap-4 mt-2">
            <ScenarioStat icon={Users} label="VUs" value={scenario.virtualUsers} />
            <ScenarioStat icon={Activity} label="req/s" value={scenario.requestRate} />
            <ScenarioStat icon={Clock} label="dur" value={`${scenario.durationSeconds}s`} />
          </div>
        </div>

        {/* Play/Stop button */}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
          style={{
            backgroundColor: isActive ? 'var(--destructive)' : 'var(--primary)',
            color: isActive ? 'var(--destructive-foreground)' : 'var(--primary-foreground)',
          }}
        >
          {isActive ? (
            <Square className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </div>
      </div>
    </button>
  );
}

function IntensityBadge({ intensity }: { intensity: ScenarioIntensity }) {
  const color = getIntensityColor(intensity);
  const labels: Record<ScenarioIntensity, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    stress: 'Stress',
  };

  return (
    <span
      className="px-1.5 py-0.5 text-[10px] font-medium rounded uppercase tracking-wide"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {labels[intensity]}
    </span>
  );
}

function ScenarioStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
}) {
  const displayValue = typeof value === 'number' ? formatCompact(value) : value;
  
  return (
    <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
      <Icon className="h-3 w-3" />
      <span>{displayValue}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}
