'use client';

/**
 * KPIStrip - Compact performance KPI indicator strip
 *
 * Displays key performance indicators in a horizontal strip format.
 * Shows virtual users, request rate, latency, error rate, and success rate.
 */

import { Users, Activity, Clock, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import type { KPISnapshot } from '@/lib/performance/performance-adapter';
import { formatCompact, formatLatency, formatPercent } from '@/lib/performance/performance-adapter';

interface KPIStripProps {
  kpis: KPISnapshot;
}

export function KPIStrip({ kpis }: KPIStripProps) {
  const hasActivity = kpis.activeScenario !== null;

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: 'var(--card)',
        borderColor: hasActivity ? 'var(--success)' : 'var(--border)',
        boxShadow: hasActivity ? '0 0 0 1px rgba(34, 197, 94, 0.2)' : 'none',
      }}
    >
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        {/* Active Scenario Badge */}
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded-md relative"
            style={{
              backgroundColor: hasActivity
                ? 'rgba(34, 197, 94, 0.15)'
                : 'var(--secondary)',
            }}
          >
            <Zap
              className="h-4 w-4"
              style={{
                color: hasActivity ? 'var(--success)' : 'var(--muted-foreground)',
              }}
            />
            {hasActivity && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--success)' }}
              />
            )}
          </div>
          <div>
            <div
              className="text-[10px] uppercase tracking-wide"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Scenario
            </div>
            <div
              className="text-sm font-semibold"
              style={{ color: hasActivity ? 'var(--success)' : 'var(--muted-foreground)' }}
            >
              {kpis.activeScenario ?? 'Idle'}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div
          className="hidden sm:block w-px h-10"
          style={{ backgroundColor: 'var(--border)' }}
        />

        {/* KPI Items */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <KPIItem
            icon={Users}
            label="Virtual Users"
            value={kpis.virtualUsers.toString()}
            active={hasActivity}
          />
          <KPIItem
            icon={Activity}
            label="req/s"
            value={formatCompact(kpis.requestsPerSecond)}
            active={hasActivity}
            highlight={hasActivity && kpis.requestsPerSecond > 300}
            highlightColor="var(--warning)"
          />
          <KPIItem
            icon={Clock}
            label="p95 Latency"
            value={formatLatency(kpis.latencyP95Ms)}
            active={hasActivity}
            highlight={kpis.latencyP95Ms > 200}
            highlightColor="var(--warning)"
          />
          <KPIItem
            icon={AlertTriangle}
            label="Error Rate"
            value={formatPercent(kpis.errorRate)}
            active={hasActivity}
            highlight={kpis.errorRate > 0.01}
            highlightColor="var(--destructive)"
          />
          <KPIItem
            icon={CheckCircle}
            label="Success"
            value={formatPercent(kpis.successRate)}
            active={hasActivity}
            highlight={kpis.successRate < 0.99 && hasActivity}
            highlightColor={kpis.successRate < 0.95 ? 'var(--destructive)' : 'var(--warning)'}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPIItem({
  icon: Icon,
  label,
  value,
  active = false,
  highlight = false,
  highlightColor = 'var(--primary)',
}: {
  icon: typeof Users;
  label: string;
  value: string;
  active?: boolean;
  highlight?: boolean;
  highlightColor?: string;
}) {
  const valueColor = highlight
    ? highlightColor
    : active
      ? 'var(--foreground)'
      : 'var(--muted-foreground)';

  return (
    <div className="flex items-center gap-2">
      <Icon
        className="h-4 w-4 hidden sm:block"
        style={{ color: 'var(--muted-foreground)' }}
        aria-hidden="true"
      />
      <div>
        <div
          className="text-[10px] uppercase tracking-wide"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {label}
        </div>
        <div
          className="text-sm font-mono font-semibold"
          style={{ color: valueColor }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
