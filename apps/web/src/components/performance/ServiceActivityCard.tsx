'use client';

/**
 * ServiceActivityCard - Displays service health and activity metrics
 *
 * Shows current activity, request pressure, health state, latency, and errors
 * for a single service in the Performance Playground.
 *
 * TODO(v0-export): Component ready for repository integration
 * TODO(api-wire): Replace mock data display when real metrics available
 */

import { useEffect, useState } from 'react';
import {
  Activity,
  Database,
  ShoppingCart,
  CreditCard,
  Package,
  Server,
  Layers,
} from 'lucide-react';
import type { ServiceMetrics, ServiceName } from '@/lib/performance/performance-adapter';
import { getHealthColor, formatCompact, formatLatency, formatPercent } from '@/lib/performance/performance-adapter';

interface ServiceActivityCardProps {
  service: ServiceMetrics;
  isAnimated?: boolean;
}

const SERVICE_ICONS: Record<ServiceName, typeof Activity> = {
  catalog: Layers,
  cart: ShoppingCart,
  checkout: CreditCard,
  orders: Package,
  bff: Server,
  persistence: Database,
};

export function ServiceActivityCard({ service, isAnimated = true }: ServiceActivityCardProps) {
  const [pulse, setPulse] = useState(false);
  const Icon = SERVICE_ICONS[service.name];
  const healthColor = getHealthColor(service.healthState);
  const hasActivity = service.requestsPerSecond > 0;

  // Pulse effect when receiving requests
  useEffect(() => {
    if (!isAnimated || !hasActivity) return;
    
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 200);
    }, 1000 + Math.random() * 500);

    return () => clearInterval(interval);
  }, [isAnimated, hasActivity]);

  return (
    <div
      className="rounded-lg border p-4 transition-all duration-200"
      style={{
        backgroundColor: 'var(--card)',
        borderColor: pulse ? healthColor : 'var(--border)',
        boxShadow: pulse ? `0 0 12px ${healthColor}20` : 'none',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded-md"
            style={{
              backgroundColor: `color-mix(in srgb, ${healthColor} 15%, transparent)`,
            }}
          >
            <Icon className="h-4 w-4" style={{ color: healthColor }} />
          </div>
          <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
            {service.displayName}
          </span>
        </div>
        <HealthBadge state={service.healthState} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricItem
          label="req/s"
          value={formatCompact(service.requestsPerSecond)}
          highlight={service.requestsPerSecond > 100}
        />
        <MetricItem
          label="p95"
          value={formatLatency(service.latencyP95Ms)}
          highlight={service.latencyP95Ms > 200}
          highlightColor="var(--warning)"
        />
        <MetricItem
          label="errors"
          value={formatPercent(service.errorRate)}
          highlight={service.errorRate > 0.01}
          highlightColor="var(--destructive)"
        />
        <MetricItem
          label="conns"
          value={service.activeConnections.toString()}
        />
      </div>

      {/* Activity Bar */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span style={{ color: 'var(--muted-foreground)' }}>Pressure</span>
          <span style={{ color: 'var(--foreground)' }}>
            {Math.min(100, Math.round(service.requestsPerSecond / 3))}%
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--secondary)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.round(service.requestsPerSecond / 3))}%`,
              backgroundColor: healthColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthBadge({ state }: { state: ServiceMetrics['healthState'] }) {
  const color = getHealthColor(state);
  const labels: Record<ServiceMetrics['healthState'], string> = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    critical: 'Critical',
    idle: 'Idle',
  };

  return (
    <span
      className="px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
      role="status"
      aria-label={`Service status: ${labels[state]}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {labels[state]}
    </span>
  );
}

function MetricItem({
  label,
  value,
  highlight = false,
  highlightColor = 'var(--primary)',
}: {
  label: string;
  value: string;
  highlight?: boolean;
  highlightColor?: string;
}) {
  return (
    <div>
      <div
        className="text-xs uppercase tracking-wide"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {label}
      </div>
      <div
        className="text-sm font-mono font-medium"
        style={{ color: highlight ? highlightColor : 'var(--foreground)' }}
      >
        {value}
      </div>
    </div>
  );
}
