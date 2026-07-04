'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Coins, Gamepad2, Home, LayoutDashboard, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { BALANCE_FEEDBACK_EVENT, type BalanceDeltaDetail } from '@/lib/balance-events';

const nav = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/games', label: 'Games', icon: Gamepad2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [balancePulse, setBalancePulse] = useState<'gain' | 'loss' | ''>('');
  const [balanceFlashes, setBalanceFlashes] = useState<Array<{ delta: number; id: number }>>([]);

  useEffect(() => {
    function handleBalanceDelta(event: Event) {
      const { delta } = (event as CustomEvent<BalanceDeltaDetail>).detail ?? {};
      if (!Number.isFinite(delta) || delta === 0) return;

      const id = Date.now() + Math.random();
      setBalancePulse(delta > 0 ? 'gain' : 'loss');
      setBalanceFlashes((current) => [...current.slice(-3), { delta: Math.trunc(delta), id }]);

      window.setTimeout(() => {
        setBalanceFlashes((current) => current.filter((item) => item.id !== id));
      }, 1050);
      window.setTimeout(() => setBalancePulse(''), 520);
    }

    window.addEventListener(BALANCE_FEEDBACK_EVENT, handleBalanceDelta);
    return () => window.removeEventListener(BALANCE_FEEDBACK_EVENT, handleBalanceDelta);
  }, []);

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="THE RIVER">
          <Image src="/assets/logo-the-river.png" alt="" width={72} height={72} priority />
          <span>THE RIVER</span>
        </Link>

        <nav className="topnav" aria-label="Navigation principale">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/games' ? pathname.startsWith('/games') : pathname === item.href;
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
              <Link className={balancePulse ? `balance-pill ${balancePulse}` : 'balance-pill'} href="/dashboard">
                <Coins size={17} />
                <span>{user.credits} credits</span>
                <span className="balance-flash-stack" aria-hidden="true">
                  {balanceFlashes.map((item) => (
                    <span className={item.delta > 0 ? 'balance-flash gain' : 'balance-flash loss'} key={item.id}>
                      {item.delta > 0 ? '+' : ''}{item.delta}
                    </span>
                  ))}
                </span>
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
