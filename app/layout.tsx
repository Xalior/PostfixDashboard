import '@/styles/globals.scss';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { ThemeBootstrapScript, ThemeProvider } from '@/components/theme/ThemeProvider';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: {
    default: env.brand.name,
    template: `%s · ${env.brand.name}`,
  },
  description: 'Manage your Postfix/Dovecot mail server — domains, mailboxes, aliases, and more.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#212529' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeBootstrapScript defaultMode={env.brand.defaultTheme} />
      </head>
      <body>
        <ThemeProvider defaultMode={env.brand.defaultTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
