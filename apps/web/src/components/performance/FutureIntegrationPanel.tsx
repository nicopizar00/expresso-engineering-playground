'use client';

/**
 * FutureIntegrationPanel - Information panel for potential data adapters
 *
 * Explains that the Performance Playground is currently mock-driven. Candidate
 * adapters are future product work, not active integrations.
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
  Activity,
} from 'lucide-react';

export function FutureIntegrationPanel() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="rounded-lg border"
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
            Potential Data Adapters
          </span>
          <span
            className="px-2 py-0.5 text-[10px] font-medium rounded-full"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--info)',
            }}
          >
            Mock Data
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
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Current State
            </h3>
            <p className="text-sm" style={{ color: 'var(--foreground)' }}>
              This Performance Playground is currently powered by deterministic mock data. All
              scenarios, metrics, and visualizations are simulated for demonstration and design
              validation purposes.
            </p>
          </div>

          {/* Planned Integrations */}
          <div>
            <h3
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Future Options
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <IntegrationCard
                icon={FileJson}
                title="Saved k6 Output"
                description="Read completed test artifacts for later visual comparison."
                status="planned"
              />
              <IntegrationCard
                icon={BarChart3}
                title="Observable Metrics"
                description="Represent measured service signals after an explicit product decision."
                status="planned"
              />
              <IntegrationCard
                icon={Link2}
                title="CI Artifacts"
                description="Read published performance reports from a future pipeline."
                status="planned"
              />
              <IntegrationCard
                icon={Database}
                title="Metric Storage"
                description="Query stored measurements through a deliberately designed adapter."
                status="planned"
              />
            </div>
          </div>

          {/* Data Contracts */}
          <div>
            <h3
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Candidate Inputs
            </h3>
            <ul
              className="space-y-1.5 text-xs"
              style={{ color: 'var(--muted-foreground)' }}
            >
              <li className="flex items-start gap-2">
                <Activity className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>
                  <code className="font-mono" style={{ color: 'var(--foreground)' }}>
                    saved k6 report artifact
                  </code>{' '}
                  - completed test summary, not executed by this page
                </span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart3 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>
                  <code className="font-mono" style={{ color: 'var(--foreground)' }}>
                    observable metric source
                  </code>{' '}
                  - future decision only
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Database className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>
                  <code className="font-mono" style={{ color: 'var(--foreground)' }}>
                    CI performance artifact
                  </code>{' '}
                  - future published report
                </span>
              </li>
            </ul>
          </div>

          {/* Technical Notes */}
          <div>
            <h3
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Current Frontend Boundary
            </h3>
            <div
              className="p-3 rounded-md font-mono text-xs overflow-x-auto"
              style={{
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',
              }}
            >
              <pre className="whitespace-pre-wrap">
{`Local fixture source:
src/lib/performance/mock-performance-data.ts

Presentation adapter:
src/lib/performance/performance-adapter.ts

No runtime endpoints or public contracts are added by this view.`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function IntegrationCard({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof FileJson;
  title: string;
  description: string;
  status: 'planned' | 'in-progress' | 'ready';
}) {
  const statusConfig = {
    planned: { label: 'Planned', color: 'var(--muted-foreground)' },
    'in-progress': { label: 'In Progress', color: 'var(--warning)' },
    ready: { label: 'Ready', color: 'var(--success)' },
  };
  const config = statusConfig[status];

  return (
    <div
      className="p-3 rounded-md border"
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
              {title}
            </span>
            <span
              className="px-1.5 py-0.5 text-[10px] font-medium rounded"
              style={{
                backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
                color: config.color,
              }}
            >
              {config.label}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
