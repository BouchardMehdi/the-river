'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, clearToken, getToken, setToken } from '@/api/client';
import { BALANCE_DELTA_EVENT, emitBalanceFeedback, type BalanceDeltaDetail } from '@/lib/balance-events';
import type { AuthResponse, User } from '@/types/api';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  login: (username: string, password: string) => Promise<AuthResponse>;
  register: (payload: { email: string; username: string; password: string }) => Promise<AuthResponse>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      userRef.current = null;
      setLoading(false);
      return;
    }

    try {
      const me = await apiGet<User>('/auth/me');
      const previous = userRef.current;
      const delta = previous && Number.isFinite(previous.credits) && Number.isFinite(me.credits)
        ? Number(me.credits) - Number(previous.credits)
        : 0;

      userRef.current = me;
      setUser(me);

      if (delta !== 0) {
        window.setTimeout(() => emitBalanceFeedback(delta, 'server-sync'), 0);
      }
    } catch {
      clearToken();
      userRef.current = null;
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    function handleBalanceDelta(event: Event) {
      const { delta } = (event as CustomEvent<BalanceDeltaDetail>).detail ?? {};
      if (!Number.isFinite(delta) || delta === 0) return;

      setUser((current) => {
        if (!current) return current;
        const next = {
          ...current,
          credits: Math.max(0, Number(current.credits ?? 0) + Math.trunc(delta)),
        };
        userRef.current = next;
        return next;
      });
    }

    window.addEventListener(BALANCE_DELTA_EVENT, handleBalanceDelta);
    return () => window.removeEventListener(BALANCE_DELTA_EVENT, handleBalanceDelta);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const out = await apiPost<AuthResponse>('/auth/login', { username, password }, false);
      setToken(out.access_token);
      userRef.current = out.user;
      setUser(out.user);
      return out;
    },
    [],
  );

  const register = useCallback(
    async (payload: { email: string; username: string; password: string }) => {
      const out = await apiPost<AuthResponse>('/auth/register', payload, false);
      setToken(out.access_token);
      userRef.current = out.user;
      setUser(out.user);
      return out;
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    userRef.current = null;
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, refreshUser, login, register, logout }),
    [user, loading, refreshUser, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
