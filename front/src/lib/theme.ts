import type { UserSettings } from '@/types/api';

export type ThemePreference = UserSettings['interface']['theme'];

export const THEME_STORAGE_KEY = 'the-river-theme';
export const THEME_EVENT = 'the-river-theme-change';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function applyThemePreference(theme: ThemePreference, emit = true) {
  if (typeof document === 'undefined') return;

  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = theme;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (emit) window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
  }
}

export function readCachedTheme(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : null;
}
