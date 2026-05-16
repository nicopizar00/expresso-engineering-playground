'use client';

import { useEffect, useState } from 'react';
import { Activity, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { expressoApi, HealthReport } from '@/lib/api/expresso-api';

type HealthStatus = 'loading' | 'healthy' | 'unhealthy';

export function HealthBadge() {
  const [status, setStatus] = useState<HealthStatus>('loading');
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    async function checkHealth() {
      try {
        const report = await expressoApi.getHealth();
        if (mounted) {
          setHealth(report);
          setStatus(report.status === 'ok' ? 'healthy' : 'unhealthy');
        }
      } catch {
        if (mounted) {
          setStatus('unhealthy');
          setHealth(null);
        }
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Poll every 30s

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const statusConfig = {
    loading: {
      icon: Loader2,
      color: 'var(--muted-foreground)',
      bg: 'var(--secondary)',
      label: 'Checking...',
      iconClass: 'animate-spin',
    },
    healthy: {
      icon: CheckCircle,
      color: 'var(--success)',
      bg: 'rgba(34, 197, 94, 0.1)',
      label: 'API Online',
      iconClass: '',
    },
    unhealthy: {
      icon: AlertCircle,
      color: 'var(--destructive)',
      bg: 'rgba(239, 68, 68, 0.1)',
      label: 'API Offline',
      iconClass: '',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
        style={{ 
          backgroundColor: config.bg,
          color: config.color,
        }}
        aria-label={`API status: ${config.label}`}
        aria-expanded={showDetails}
      >
        <Icon className={`h-3.5 w-3.5 ${config.iconClass}`} />
        <span className="hidden sm:inline">{config.label}</span>
      </button>

      {/* Details popover */}
      {showDetails && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDetails(false)}
            aria-hidden="true"
          />
          <div 
            className="absolute right-0 top-full mt-2 w-64 rounded-lg border p-4 shadow-lg z-50 animate-fadeIn"
            style={{ 
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
            }}
            role="dialog"
            aria-label="API Health Details"
          >
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4" style={{ color: 'var(--primary)' }} />
              <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                API Health
              </h3>
            </div>
            
            {health ? (
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt style={{ color: 'var(--muted-foreground)' }}>Status</dt>
                  <dd className="font-medium" style={{ color: config.color }}>{health.status.toUpperCase()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: 'var(--muted-foreground)' }}>Service</dt>
                  <dd className="font-mono" style={{ color: 'var(--foreground)' }}>{health.service}</dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: 'var(--muted-foreground)' }}>Version</dt>
                  <dd className="font-mono" style={{ color: 'var(--foreground)' }}>{health.version}</dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: 'var(--muted-foreground)' }}>Uptime</dt>
                  <dd className="font-mono" style={{ color: 'var(--foreground)' }}>
                    {formatUptime(health.uptimeSeconds)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt style={{ color: 'var(--muted-foreground)' }}>Database</dt>
                  <dd 
                    className="font-medium"
                    style={{ 
                      color: health.checks.db === 'ok' 
                        ? 'var(--success)' 
                        : health.checks.db === 'skipped' 
                          ? 'var(--warning)' 
                          : 'var(--destructive)' 
                    }}
                  >
                    {health.checks.db.toUpperCase()}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Unable to connect to the BFF. Make sure it&apos;s running on port 3001.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
