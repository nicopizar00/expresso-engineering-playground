import { ReactNode } from 'react';
import { Coffee, ShoppingCart, Package, Search, FileQuestion } from 'lucide-react';
import Link from 'next/link';

type EmptyVariant = 'products' | 'cart' | 'orders' | 'search' | 'generic';

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

const variantConfig: Record<EmptyVariant, { icon: typeof Coffee; defaultTitle: string; defaultDescription: string }> = {
  products: {
    icon: Coffee,
    defaultTitle: 'No products available',
    defaultDescription: 'The catalog is empty. Products will appear here once they are added to the system.',
  },
  cart: {
    icon: ShoppingCart,
    defaultTitle: 'Your cart is empty',
    defaultDescription: 'Add some products to your cart to get started.',
  },
  orders: {
    icon: Package,
    defaultTitle: 'No orders found',
    defaultDescription: 'Orders placed through checkout will appear here. Note: Orders reset when the BFF restarts.',
  },
  search: {
    icon: Search,
    defaultTitle: 'No results found',
    defaultDescription: 'Try adjusting your search or filter criteria.',
  },
  generic: {
    icon: FileQuestion,
    defaultTitle: 'Nothing here yet',
    defaultDescription: 'This section is empty.',
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
      <div 
        className="flex items-center justify-center w-16 h-16 rounded-full mb-4"
        style={{ backgroundColor: 'var(--secondary)' }}
      >
        <Icon 
          className="w-8 h-8" 
          style={{ color: 'var(--muted-foreground)' }}
          aria-hidden="true"
        />
      </div>
      
      <h3 
        className="text-lg font-semibold mb-2"
        style={{ color: 'var(--foreground)' }}
      >
        {displayTitle}
      </h3>
      
      <p 
        className="max-w-md text-sm mb-6"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {displayDescription}
      </p>

      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            {action.label}
          </button>
        )
      )}

      {children}
    </div>
  );
}
