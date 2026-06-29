import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/auth/auth-context';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'THE RIVER',
  description: 'Casino social - poker, blackjack, roulette et slots',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
