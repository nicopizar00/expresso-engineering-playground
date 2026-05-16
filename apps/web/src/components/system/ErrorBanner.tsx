import { AlertTriangle, RefreshCw, WifiOff, ServerCrash } from 'lucide-react';

type ErrorVariant = 'network' | 'server' | 'notFound' | 'generic';

interface ErrorBannerProps {
  variant?: ErrorVariant;
  title?: string;
  message?: string;
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}

const variantConfig: Record<ErrorVariant, { icon: typeof AlertTriangle; defaultTitle: string; color: string }> = {
  network: {
    icon: WifiOff,
    defaultTitle: 'Connection Error',
    color: 'var(--warning)',
  },
  server: {
    icon: ServerCrash,
    defaultTitle: 'Server Error',
    color: 'var(--destructive)',
  },
  notFound: {
    icon: AlertTriangle,
    defaultTitle: 'Not Found',
    color: 'var(--warning)',
  },
  generic: {
    icon: AlertTriangle,
    defaultTitle: 'Something went wrong',
    color: 'var(--destructive)',
  },
};

export function ErrorBanner({
  variant = 'generic',
  title,
  message,
  error,
  onRetry,
  className = '',
}: ErrorBannerProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  const displayTitle = title ?? config.defaultTitle;
  const displayMessage = message ?? error?.message ?? 'An unexpected error occurred. Please try again.';

  return (
    <div 
      className={`rounded-lg border p-4 ${className}`}
      style={{ 
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        borderColor: 'rgba(239, 68, 68, 0.2)',
      }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon 
          className="h-5 w-5 flex-shrink-0 mt-0.5" 
          style={{ color: config.color }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h4 
            className="font-medium text-sm"
            style={{ color: 'var(--foreground)' }}
          >
            {displayTitle}
          </h4>
          <p 
            className="text-sm mt-1"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {displayMessage}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--primary)' }}
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <p 
      className="text-sm flex items-center gap-1.5"
      style={{ color: 'var(--destructive)' }}
      role="alert"
    >
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      {message}
    </p>
  );
}

export function PageErrorState({
  title = 'Something went wrong',
  message = 'We encountered an error loading this page.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div 
      className="flex flex-col items-center justify-center py-24 px-4 text-center"
      role="alert"
    >
      <div 
        className="flex items-center justify-center w-16 h-16 rounded-full mb-4"
        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
      >
        <AlertTriangle 
          className="w-8 h-8" 
          style={{ color: 'var(--destructive)' }}
          aria-hidden="true"
        />
      </div>
      
      <h3 
        className="text-lg font-semibold mb-2"
        style={{ color: 'var(--foreground)' }}
      >
        {title}
      </h3>
      
      <p 
        className="max-w-md text-sm mb-6"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {message}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      )}
    </div>
  );
}
