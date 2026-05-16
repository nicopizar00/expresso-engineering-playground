import { Loader2 } from 'lucide-react';

interface LoadingSkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'avatar' | 'button';
}

export function LoadingSkeleton({ className = '', variant = 'text' }: LoadingSkeletonProps) {
  const baseStyles = 'animate-pulse rounded';
  
  const variantStyles = {
    text: 'h-4 w-full',
    card: 'h-48 w-full',
    avatar: 'h-10 w-10 rounded-full',
    button: 'h-10 w-24',
  };

  return (
    <div 
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={{ backgroundColor: 'var(--muted)' }}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export function LoadingSpinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeStyles = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <Loader2 
      className={`animate-spin ${sizeStyles[size]} ${className}`}
      style={{ color: 'var(--muted-foreground)' }}
      aria-hidden="true"
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div 
      className="rounded-lg border p-4 space-y-3"
      style={{ 
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
      role="status"
      aria-label="Loading product"
    >
      <LoadingSkeleton variant="card" className="h-40" />
      <LoadingSkeleton variant="text" className="w-3/4" />
      <LoadingSkeleton variant="text" className="w-1/2" />
      <div className="flex justify-between items-center pt-2">
        <LoadingSkeleton variant="text" className="w-20" />
        <LoadingSkeleton variant="button" />
      </div>
      <span className="sr-only">Loading product...</span>
    </div>
  );
}

export function CatalogGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div 
      className="grid gap-4 sm:gap-6"
      style={{ 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      }}
      role="status"
      aria-label="Loading products"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading {count} products...</span>
    </div>
  );
}

export function PageLoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div 
      className="flex flex-col items-center justify-center py-24 gap-4"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="lg" />
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{message}</p>
    </div>
  );
}
