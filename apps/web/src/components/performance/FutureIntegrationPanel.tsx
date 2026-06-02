'use client';

/**
 * FutureIntegrationPanel - Information panel for potential data adapters
 *
 * Explains that the Performance Playground is currently mock-driven.
 * Redesigned with a clean, modern interface.
 */

import { useState } from 'react';
import {
  Info,
  ChevronDown,
  ChevronUp,
  BarChart3,
  FileJson,
  Link2,
  Database,
  FlaskConical,
} from 'lucide-react';

export function FutureIntegrationPanel() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4" style={{ color: 'var(--info)' }} />
          <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
            Data Sources
          </span>
          <span
            className="px-1.5 py-0.5 text-[9px] font-medium rounded uppercase tracking-wide"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--info)',
            }}
          >
            Mock
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
        ) : (
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t pt-4 space-y-4" style={{ borderColor: 'var(--border)' }}>
          {/* Current State */}
          <div>
            <h3
              className="text-[10px] font-medium uppercase tracking-wider mb-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Current State
            </h3>
            <div 
              className="flex items-start gap-2 p-3 rounded-lg"
              style={{ backgroundColor: 'var(--secondary)' }}
            >
              <FlaskConical className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--info)' }} />
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                All metrics shown are deterministic mock data for design validation.
                This does not represent live telemetry or real performance data.
              </p>
            </div>
          </div>

          {/* Potential Integrations */}
          <div>
            <h3
              className="text-[10px] font-medium uppercase tracking-wider mb-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Potential Adapters
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <IntegrationCard
                icon={FileJson}
                title="k6 Reports"
                status="planned"
              />
              <IntegrationCard
                icon={BarChart3}
                title="Metrics"
                status="planned"
              />
              <IntegrationCard
                icon={Link2}
                title="CI Artifacts"
                status="planned"
              />
              <IntegrationCard
                icon={Database}
                title="Storage"
                status="planned"
              />
            </div>
          </div>

          {/* Source files */}
          <div>
            <h3
              className="text-[10px] font-medium uppercase tracking-wider mb-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Source
            </h3>
            <div
              className="p-2 rounded-lg font-mono text-[10px]"
              style={{
                backgroundColor: 'var(--background)',
                color: 'var(--muted-foreground)',
              }}
            >
              <div>lib/performance/mock-performance-data.ts</div>
              <div>lib/performance/performance-adapter.ts</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationCard({
  icon: Icon,
  title,
  status: _status,
}: {
  icon: typeof FileJson;
  title: string;
  status: 'planned' | 'in-progress' | 'ready';
}) {
  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
      <span className="text-[10px] font-medium" style={{ color: 'var(--foreground)' }}>
        {title}
      </span>
    </div>
  );
}
