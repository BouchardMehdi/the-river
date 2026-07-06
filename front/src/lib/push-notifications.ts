import { apiGet, apiPost } from '@/api/client';

type PushConfig = {
  enabled: boolean;
  publicKey: string;
};

type PushStatus = {
  subscribed: boolean;
  subscriptions: number;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function pushSupported() {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function getPushRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

export async function getPushStatus() {
  if (!pushSupported()) return { permission: 'unsupported' as const, subscribed: false };
  const permission = Notification.permission;
  const registration = await getPushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  const server = await apiGet<PushStatus>('/notifications/status').catch(() => ({ subscribed: false, subscriptions: 0 }));

  return {
    permission,
    subscribed: Boolean(subscription && server.subscribed),
  };
}

export async function enablePushNotifications() {
  if (!pushSupported()) throw new Error('Notifications non supportees sur ce navigateur.');

  const config = await apiGet<PushConfig>('/notifications/config', false);
  if (!config.enabled || !config.publicKey) throw new Error('Notifications indisponibles cote serveur.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission notifications refusee.');

  const registration = await getPushRegistration();
  const previous = await registration.pushManager.getSubscription();
  const subscription =
    previous ??
    (await registration.pushManager.subscribe({
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      userVisibleOnly: true,
    }));

  await apiPost('/notifications/subscribe', { subscription: subscription.toJSON() });
  await apiPost('/notifications/test', {});
  return { subscribed: true };
}

export async function disablePushNotifications() {
  if (!pushSupported()) return { subscribed: false };

  const registration = await getPushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  await apiPost('/notifications/unsubscribe', { endpoint: subscription?.endpoint });
  await subscription?.unsubscribe();

  return { subscribed: false };
}

export async function sendPushTest() {
  await apiPost('/notifications/test', {});
}
