import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/system/AppShell';
import { CartProvider } from '@/components/cart/CartProvider';

export const metadata: Metadata = {
  title: 'Expresso | Engineering Playground',
  description: 'A mini-commerce engineering playground for software development, architecture, and AI-assisted engineering practices.',
  keywords: ['engineering', 'playground', 'coffee', 'commerce', 'demo'],
};

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-[var(--background)]">
      <body>
        <CartProvider>
          <AppShell>{children}</AppShell>
        </CartProvider>
      </body>
    </html>
  );
}
