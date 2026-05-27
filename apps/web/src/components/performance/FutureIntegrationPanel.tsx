'use client';

/**
 * FutureIntegrationPanel - Information panel for k6/Grafana integration readiness
 *
 * Explains that the Performance Playground is currently mock-driven and prepared
 * for future integration with real observability tools.
 *
 * TODO(v0-export): Component ready for repository integration
 * TODO(api-wire): Update when real integrations are available
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BarChart3,
  FileJson,
  Link2,
  Database,
  Activity,
  Box,
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
            Future k6 / Grafana Integration
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
              Planned Integrations
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <IntegrationCard
                icon={FileJson}
                title="k6 Summary Output"
                description="Parse k6 JSON summary reports for post-test analysis and historical comparison."
                status="planned"
              />
              <IntegrationCard
                icon={BarChart3}
                title="Grafana Dashboards"
                description="Link to live Grafana dashboards for real-time service metrics."
                status="planned"
              />
              <IntegrationCard
                icon={Link2}
                title="CI/CD Artifacts"
                description="Fetch performance report artifacts from CI pipelines."
                status="planned"
              />
              <IntegrationCard
                icon={Database}
                title="Service Metrics"
                description="Connect to Prometheus/metrics endpoints for live service health."
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
              Expected Data Sources
            </h3>
            <ul
              className="space-y-1.5 text-xs"
              style={{ color: 'var(--muted-foreground)' }}
            >
              <li className="flex items-start gap-2">
                <Activity className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>
                  <code className="font-mono" style={{ color: 'var(--foreground)' }}>
                    k6 run --out json=report.json
                  </code>{' '}
                  — scenario execution summary
                </span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart3 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>
                  <code className="font-mono" style={{ color: 'var(--foreground)' }}>
                    Grafana API /api/dashboards
                  </code>{' '}
                  — dashboard metadata and links
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Database className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>
                  <code className="font-mono" style={{ color: 'var(--foreground)' }}>
                    /metrics
                  </code>{' '}
                  — Prometheus-format service metrics
                </span>
              </li>
            </ul>
          </div>

          {/* 3D Visualizer Link */}
          <div
            className="p-3 rounded-md"
            style={{ backgroundColor: 'var(--secondary)' }}
          >
            <div className="flex items-start gap-3">
              <Box className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
              <div>
                <h4 className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>
                  3D Visualizer Integration
                </h4>
                <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
                  Future versions may use the 3D room as an ambient system-load visualization
                  surface, showing activity and pressure through visual effects in the scene.
                </p>
                <Link
                  href="/visualizer"
                  className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
                  style={{ color: 'var(--primary)' }}
                >
                  View 3D Visualizer
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* Technical Notes */}
          <div>
            <h3
              className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Integration Points (Code TODOs)
            </h3>
            <div
              className="p-3 rounded-md font-mono text-xs overflow-x-auto"
              style={{
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',
              }}
            >
              <pre className="whitespace-pre-wrap">
{`// TODO(api-wire): Replace mock adapter
src/lib/performance/performance-adapter.ts

// TODO(types): Shared contracts
src/lib/performance/mock-performance-data.ts

// TODO(state): Scenario playback state
// TODO(error-handling): Real data errors`}
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
