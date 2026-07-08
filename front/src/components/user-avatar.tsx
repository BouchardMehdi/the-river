import { avatarSrc } from '@/lib/avatar';

export function UserAvatar({
  avatarUrl,
  className = 'user-avatar',
  label,
}: {
  avatarUrl?: string | null;
  className?: string;
  label: string;
}) {
  const src = avatarSrc(avatarUrl);
  const initial = label.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <span className={className}>
      {src ? <img alt="" src={src} /> : initial}
    </span>
  );
}
