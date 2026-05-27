'use client';

/**
 * ScenarioSelector - Scenario selection and control panel
 *
 * Displays available performance scenarios with descriptions and allows
 * starting/stopping scenario playback.
 * Redesigned with a clean, modern interface.
 */

import { Play, Square, Zap, Users, Clock, Activity, FlaskConical } from 'lucide-react';
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
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            Load Scenarios
          </span>
        </div>
        {activeScenario && (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-md animate-pulse"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: 'var(--success)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
            Running
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Mock data notice */}
        <div 
          className="flex items-start gap-2 p-3 rounded-lg text-xs"
          style={{ backgroundColor: 'var(--secondary)' }}
        >
          <FlaskConical className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--info)' }} />
          <span style={{ color: 'var(--muted-foreground)' }}>
            Scenarios simulate mock load patterns for design validation
          </span>
        </div>

        {/* Scenario cards */}
        <div className="space-y-2">
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
            className="p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--secondary)',
              border: `1px solid ${getIntensityColor(activeScenario.intensity)}`,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--success)' }}
                />
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  {activeScenario.name}
                </span>
              </div>
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
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
    </div>
  );
}

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
      className="w-full text-left p-3 rounded-lg border transition-all"
      style={{
        backgroundColor: isActive ? 'var(--secondary)' : 'var(--background)',
        borderColor: isActive ? intensityColor : 'var(--border)',
      }}
      aria-pressed={isActive}
      aria-label={`${scenario.name}: ${isActive ? 'Stop' : 'Start'} scenario`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
              {scenario.name}
            </span>
            <IntensityBadge intensity={scenario.intensity} />
          </div>
          <p className="text-xs line-clamp-1 mb-2" style={{ color: 'var(--muted-foreground)' }}>
            {scenario.description}
          </p>
          
          {/* Scenario Stats */}
          <div className="flex items-center gap-3">
            <ScenarioStat icon={Users} value={scenario.virtualUsers} label="VUs" />
            <ScenarioStat icon={Activity} value={scenario.requestRate} label="req/s" />
            <ScenarioStat icon={Clock} value={`${scenario.durationSeconds}s`} label="dur" />
          </div>
        </div>

        {/* Play/Stop button */}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          style={{
            backgroundColor: isActive ? 'var(--destructive)' : 'var(--primary)',
            color: isActive ? 'var(--destructive-foreground)' : 'var(--primary-foreground)',
          }}
        >
          {isActive ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
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
    medium: 'Med',
    high: 'High',
    stress: 'Stress',
  };

  return (
    <span
      className="px-1.5 py-0.5 text-[9px] font-medium rounded uppercase tracking-wide"
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
  value,
  label,
}: {
  icon: typeof Users;
  value: number | string;
  label: string;
}) {
  const displayValue = typeof value === 'number' ? formatCompact(value) : value;
  
  return (
    <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
      <Icon className="h-3 w-3" />
      <span className="font-mono font-medium">{displayValue}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}
