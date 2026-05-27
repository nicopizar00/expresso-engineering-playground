'use client';

/**
 * RequestFlowDiagram - Visual representation of request flow through services
 *
 * Shows requests moving from users through BFF to services and persistence.
 * Redesigned with a clean, modern interface.
 */

import { useEffect, useState } from 'react';
import { Users, ArrowRight, Database, Server, Activity } from 'lucide-react';
import type { RequestFlowStep } from '@/lib/performance/performance-adapter';
import { formatCompact, formatLatency, formatPercent } from '@/lib/performance/performance-adapter';

interface RequestFlowDiagramProps {
  flow: RequestFlowStep[];
  isAnimated?: boolean;
}

export function RequestFlowDiagram({ flow, isAnimated = true }: RequestFlowDiagramProps) {
  const hasFlow = flow.length > 0;

  // Group flows by layer
  const userToBff = flow.find((f) => f.from === 'Users' && f.to === 'BFF Gateway');
  const bffToServices = flow.filter((f) => f.from === 'BFF Gateway' && f.to !== 'Persistence');
  const servicesToPersistence = flow.filter((f) => f.to === 'Persistence');

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div 
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <Activity className="h-4 w-4" style={{ color: 'var(--primary)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          Request Flow
        </span>
      </div>

      <div className="p-4">
        {!hasFlow ? (
          <div
            className="text-center py-8"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Start a scenario to see request flow</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Layer 1: Users -> BFF */}
            <FlowLayer>
              <FlowNode type="users" label="Users" isAnimated={isAnimated} />
              {userToBff && (
                <>
                  <FlowConnection step={userToBff} isAnimated={isAnimated} />
                  <FlowNode type="bff" label="BFF Gateway" isAnimated={isAnimated} />
                </>
              )}
            </FlowLayer>

            {/* Layer 2: BFF -> Services */}
            {bffToServices.length > 0 && (
              <FlowLayer>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {bffToServices.map((step) => (
                    <ServiceFlowCard
                      key={step.to}
                      step={step}
                      isAnimated={isAnimated}
                    />
                  ))}
                </div>
              </FlowLayer>
            )}

            {/* Layer 3: Services -> Persistence */}
            {servicesToPersistence.length > 0 && (
              <FlowLayer>
                <div className="flex items-center justify-center gap-4 w-full">
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    <span>from services</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                  <FlowNode type="persistence" label="PostgreSQL" isAnimated={isAnimated}>
                    <div className="text-[10px] mt-1 font-mono" style={{ color: 'var(--muted-foreground)' }}>
                      {formatCompact(
                        servicesToPersistence.reduce((sum, s) => sum + s.requestsPerSecond, 0)
                      )}{' '}
                      req/s
                    </div>
                  </FlowNode>
                </div>
              </FlowLayer>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowLayer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-4 flex-wrap">
      {children}
    </div>
  );
}

function FlowNode({
  type,
  label,
  isAnimated,
  children,
}: {
  type: 'users' | 'bff' | 'persistence';
  label: string;
  isAnimated: boolean;
  children?: React.ReactNode;
}) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!isAnimated) return;
    
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 300);
    }, 1500);

    return () => clearInterval(interval);
  }, [isAnimated]);

  const icons = {
    users: Users,
    bff: Server,
    persistence: Database,
  };
  const Icon = icons[type];

  return (
    <div
      className="flex flex-col items-center p-3 rounded-lg border transition-all duration-200"
      style={{
        backgroundColor: 'var(--secondary)',
        borderColor: pulse ? 'var(--primary)' : 'var(--border)',
      }}
    >
      <Icon className="h-5 w-5 mb-1" style={{ color: 'var(--primary)' }} />
      <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function FlowConnection({
  step,
  isAnimated,
}: {
  step: RequestFlowStep;
  isAnimated: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2">
      {/* Animated dots */}
      <div className="flex items-center gap-1">
        {isAnimated &&
          [0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                backgroundColor: 'var(--primary)',
                animationDelay: `${i * 200}ms`,
              }}
            />
          ))}
        <ArrowRight className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
      </div>
      {/* Metrics */}
      <div className="text-[10px] text-center font-mono" style={{ color: 'var(--muted-foreground)' }}>
        <div>{formatCompact(step.requestsPerSecond)} req/s</div>
        <div>{formatLatency(step.latencyMs)}</div>
      </div>
    </div>
  );
}

function ServiceFlowCard({
  step,
  isAnimated,
}: {
  step: RequestFlowStep;
  isAnimated: boolean;
}) {
  const [pulse, setPulse] = useState(false);
  const hasErrors = step.errorRate > 0.01;

  useEffect(() => {
    if (!isAnimated) return;
    
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 200);
    }, 800 + Math.random() * 400);

    return () => clearInterval(interval);
  }, [isAnimated]);

  return (
    <div
      className="p-2 rounded-lg border text-center transition-all duration-200"
      style={{
        backgroundColor: 'var(--background)',
        borderColor: pulse
          ? hasErrors
            ? 'var(--destructive)'
            : 'var(--success)'
          : 'var(--border)',
      }}
    >
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--foreground)' }}>
        {step.to}
      </div>
      <div className="flex items-center justify-center gap-2 text-[10px] font-mono">
        <span style={{ color: 'var(--muted-foreground)' }}>
          {formatCompact(step.requestsPerSecond)}/s
        </span>
        {hasErrors && (
          <span style={{ color: 'var(--destructive)' }}>
            {formatPercent(step.errorRate)}
          </span>
        )}
      </div>
    </div>
  );
}
