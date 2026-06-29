'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, clearToken, getToken, setToken } from '@/api/client';
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
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const me = await apiGet<User>('/auth/me');
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      const out = await apiPost<AuthResponse>('/auth/login', { username, password }, false);
      setToken(out.access_token);
      setUser(out.user);
      return out;
    },
    [],
  );

  const register = useCallback(
    async (payload: { email: string; username: string; password: string }) => {
      const out = await apiPost<AuthResponse>('/auth/register', payload, false);
      setToken(out.access_token);
      setUser(out.user);
      return out;
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
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
