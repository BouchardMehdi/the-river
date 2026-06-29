import type { ApiError } from '@/types/api';

const TOKEN_KEY = 'the-river-token';

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || '/api';
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
}

function formatApiError(payload: ApiError | string, fallback: string) {
  if (typeof payload === 'string') return payload || fallback;
  if (Array.isArray(payload.message)) return payload.message.join(', ');
  return payload.message || payload.error || fallback;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(formatApiError(payload, `Erreur API ${res.status}`));
  }

  return payload as T;
}

export function apiGet<T>(path: string, auth = true) {
  return apiFetch<T>(path, { method: 'GET', auth });
}

export function apiPost<T>(path: string, body?: unknown, auth = true) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    auth,
  });
}
