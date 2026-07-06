import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/auth/auth-context';
import { AppShell } from '@/components/app-shell';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'THE RIVER',
  description: 'Casino social - poker, blackjack, roulette et slots',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'THE RIVER',
  },
  icons: {
    icon: '/assets/logo-the-river.png',
    apple: '/assets/logo-the-river.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#050d13',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <PwaRegister />
        </AuthProvider>
      </body>
    </html>
  );
}
