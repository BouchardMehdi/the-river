export function avatarSrc(url?: string | null) {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return url.startsWith('/') ? url : `/${url}`;
}
