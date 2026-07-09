'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Gamepad2, Home, LayoutDashboard, LogIn, LogOut } from 'lucide-react';
import { apiGet, getToken } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { BALANCE_FEEDBACK_EVENT, type BalanceDeltaDetail } from '@/lib/balance-events';
import { playGameSound, unlockAudio } from '@/lib/sound-engine';
import { GAME_SOUND_EVENT, type GameSound } from '@/lib/sound-events';
import { applyThemePreference, isThemePreference, readCachedTheme, THEME_EVENT, type ThemePreference } from '@/lib/theme';
import type { UserSettings } from '@/types/api';
import { CurrencyAmount } from './currency-amount';
import { UserAvatar } from './user-avatar';

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
    const cached = readCachedTheme();
    if (cached) applyThemePreference(cached, false);

    let alive = true;

    async function loadTheme() {
      if (!getToken()) {
        if (!cached) applyThemePreference('system', false);
        return;
      }

      try {
        const settings = await apiGet<UserSettings>('/settings');
        if (alive) applyThemePreference(settings.interface.theme, false);
      } catch {
        if (alive && !cached) applyThemePreference('system', false);
      }
    }

    function handleThemeEvent(event: Event) {
      const theme = (event as CustomEvent<{ theme?: ThemePreference }>).detail?.theme;
      if (isThemePreference(theme)) applyThemePreference(theme, false);
    }

    window.addEventListener(THEME_EVENT, handleThemeEvent);
    void loadTheme();

    return () => {
      alive = false;
      window.removeEventListener(THEME_EVENT, handleThemeEvent);
    };
  }, []);

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

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const control = target.closest('button, a, input, select, textarea, [role="button"]');
      if (!control || control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true') return;
      void unlockAudio();
      if (control.matches('input, textarea')) return;
      if (control.matches('select')) {
        playGameSound('toggle');
        return;
      }
      playGameSound(control.classList.contains('icon-button') ? 'toggle' : 'button');
    }

    function handleGameSound(event: Event) {
      const sound = (event as CustomEvent<{ sound?: GameSound }>).detail?.sound;
      if (sound) playGameSound(sound);
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener(GAME_SOUND_EVENT, handleGameSound);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener(GAME_SOUND_EVENT, handleGameSound);
    };
  }, []);

  function renderNavLinks() {
    return nav.map((item) => {
      const Icon = item.icon;
      const active = item.href === '/games' ? pathname.startsWith('/games') : pathname === item.href;
      return (
        <Link key={item.href} href={item.href} className={active ? 'navlink active' : 'navlink'}>
          <Icon size={18} />
          <span>{item.label}</span>
        </Link>
      );
    });
  }

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="THE RIVER">
          <Image src="/assets/logo-the-river.png" alt="" width={72} height={72} priority />
          <span>THE RIVER</span>
        </Link>

        <nav className="topnav" aria-label="Navigation principale">
          {renderNavLinks()}
        </nav>

        <div className="account-zone">
          {user ? (
            <>
              <UserAvatar avatarUrl={user.avatarUrl} className="topbar-avatar" label={user.username} />
              <Link className={balancePulse ? `balance-pill ${balancePulse}` : 'balance-pill'} href="/dashboard">
                <CurrencyAmount value={user.credits} />
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
      <nav className="mobile-app-nav" aria-label="Navigation mobile">
        {renderNavLinks()}
      </nav>
    </>
  );
}
