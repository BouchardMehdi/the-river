'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Coins, Home, LayoutDashboard, LogIn, LogOut, Trophy } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';

const nav = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/games/poker', label: 'Poker', icon: Trophy },
  { href: '/games/slots', label: 'Slots', icon: Coins },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="THE RIVER">
          <Image src="/assets/logo-the-river.png" alt="" width={42} height={42} priority />
          <span>THE RIVER</span>
        </Link>

        <nav className="topnav" aria-label="Navigation principale">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={active ? 'navlink active' : 'navlink'}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="account-zone">
          {user ? (
            <>
              <Link className="balance-pill" href="/dashboard">
                <Coins size={17} />
                <span>{user.credits} crédits</span>
              </Link>
              <button className="icon-button" onClick={logout} title="Se deconnecter" type="button">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link className="button small" href="/login">
              <LogIn size={17} />
              <span>Connexion</span>
            </Link>
          )}
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
