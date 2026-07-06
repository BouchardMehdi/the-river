'use client';

import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
  pushSupported,
  sendPushTest,
} from '@/lib/push-notifications';

type NotificationState = 'checking' | 'unsupported' | 'denied' | 'idle' | 'subscribed' | 'busy';

export function NotificationButton({ className = 'icon-button' }: { className?: string }) {
  const { user } = useAuth();
  const [state, setState] = useState<NotificationState>('checking');

  useEffect(() => {
    let alive = true;

    async function refresh() {
      if (!user) {
        if (alive) setState('idle');
        return;
      }
      if (!pushSupported()) {
        if (alive) setState('unsupported');
        return;
      }

      const status = await getPushStatus();
      if (!alive) return;
      if (status.permission === 'denied') setState('denied');
      else setState(status.subscribed ? 'subscribed' : 'idle');
    }

    void refresh();
    return () => {
      alive = false;
    };
  }, [user]);

  async function handleClick() {
    if (state === 'unsupported') {
      window.alert('Ce navigateur ne supporte pas les notifications Web Push.');
      return;
    }
    if (state === 'denied') {
      window.alert('Les notifications sont bloquees dans les reglages du navigateur.');
      return;
    }

    const previous = state;
    setState('busy');
    try {
      if (previous === 'subscribed') {
        await sendPushTest();
        setState('subscribed');
      } else {
        await enablePushNotifications();
        setState('subscribed');
      }
    } catch (error) {
      setState(previous === 'subscribed' ? 'subscribed' : 'idle');
      window.alert(error instanceof Error ? error.message : 'Notifications indisponibles.');
    }
  }

  async function handleContextMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (state !== 'subscribed') return;
    setState('busy');
    await disablePushNotifications().catch(() => undefined);
    setState('idle');
  }

  const subscribed = state === 'subscribed';
  const Icon = subscribed ? BellRing : Bell;

  return (
    <button
      className={`${className} notification-button ${subscribed ? 'subscribed' : ''} ${state === 'busy' ? 'busy' : ''}`}
      disabled={state === 'checking' || state === 'busy'}
      onClick={() => void handleClick()}
      onContextMenu={(event) => void handleContextMenu(event)}
      title={subscribed ? 'Envoyer une notification test. Clic droit pour desactiver.' : 'Activer les notifications'}
      type="button"
    >
      <Icon size={18} />
    </button>
  );
}
