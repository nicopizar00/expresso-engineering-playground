import { ReactNode } from 'react';
import { Coffee, ShoppingCart, Package, Search, FileQuestion, AlertCircle } from 'lucide-react';
import Link from 'next/link';

type EmptyVariant = 'products' | 'cart' | 'orders' | 'search' | 'generic' | 'error';

interface EmptyStateProps {
  variant?: EmptyVariant;
  title?: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  children?: ReactNode;
}

const variantConfig: Record<EmptyVariant, { icon: typeof Coffee; defaultTitle: string; defaultDescription: string; iconClass: string }> = {
  products: {
    icon: Coffee,
    defaultTitle: 'No products available',
    defaultDescription: 'The catalog is empty. Products will appear here once added.',
    iconClass: 'text-muted-foreground',
  },
  cart: {
    icon: ShoppingCart,
    defaultTitle: 'Your cart is empty',
    defaultDescription: 'Browse the catalog to find something you love.',
    iconClass: 'text-muted-foreground',
  },
  orders: {
    icon: Package,
    defaultTitle: 'No orders found',
    defaultDescription: 'Complete a checkout to see your orders here. Orders are persistent.',
    iconClass: 'text-muted-foreground',
  },
  search: {
    icon: Search,
    defaultTitle: 'No results found',
    defaultDescription: 'Try adjusting your search or filter criteria.',
    iconClass: 'text-muted-foreground',
  },
  generic: {
    icon: FileQuestion,
    defaultTitle: 'Nothing here yet',
    defaultDescription: 'This section is empty.',
    iconClass: 'text-muted-foreground',
  },
  error: {
    icon: AlertCircle,
    defaultTitle: 'Something went wrong',
    defaultDescription: 'Please try again or contact support if the problem persists.',
    iconClass: 'text-warning',
  },
};

export function EmptyState({
  variant = 'generic',
  title,
  description,
  action,
  children,
}: EmptyStateProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  const displayTitle = title ?? config.defaultTitle;
  const displayDescription = description ?? config.defaultDescription;

  return (
    <div 
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
      role="status"
    >
      <div className={`icon-badge icon-badge-lg mb-4 ${variant === 'error' ? 'bg-warning/10' : 'bg-secondary/50'}`}>
        <Icon 
          className={`icon-lg ${config.iconClass}`}
          aria-hidden="true"
        />
      </div>
      
      <h3 className="text-lg font-semibold mb-2">
        {displayTitle}
      </h3>
      
      <p className="max-w-md text-sm text-muted-foreground mb-6">
        {displayDescription}
      </p>

      {action && (
        action.href ? (
          <Link href={action.href} className="btn btn-primary">
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className="btn btn-primary">
            {action.label}
          </button>
        )
      )}

      {children}
    </div>
  );
}
