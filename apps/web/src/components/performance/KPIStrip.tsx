'use client';

/**
 * KPIStrip - Compact performance KPI indicator strip
 *
 * Displays key performance indicators in a horizontal strip format.
 * Redesigned with a clean, modern interface.
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
      className="rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--card)',
        borderColor: hasActivity ? 'var(--success)' : 'var(--border)',
      }}
    >
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        {/* Active Scenario Badge */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg relative"
            style={{
              backgroundColor: hasActivity
                ? 'rgba(34, 197, 94, 0.15)'
                : 'var(--secondary)',
            }}
          >
            <Zap
              className="h-5 w-5"
              style={{
                color: hasActivity ? 'var(--success)' : 'var(--muted-foreground)',
              }}
            />
            {hasActivity && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--success)' }}
              />
            )}
          </div>
          <div>
            <div
              className="text-[10px] uppercase tracking-wider font-medium"
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
            label="VUs"
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
            label="p95"
            value={formatLatency(kpis.latencyP95Ms)}
            active={hasActivity}
            highlight={kpis.latencyP95Ms > 200}
            highlightColor="var(--warning)"
          />
          <KPIItem
            icon={AlertTriangle}
            label="err"
            value={formatPercent(kpis.errorRate)}
            active={hasActivity}
            highlight={kpis.errorRate > 0.01}
            highlightColor="var(--destructive)"
          />
          <KPIItem
            icon={CheckCircle}
            label="ok"
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
          className="text-[10px] uppercase tracking-wider font-medium"
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
