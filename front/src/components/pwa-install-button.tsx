'use client';

import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as any).standalone);
}

export function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  if (installed) {
    return (
      <div className="pwa-install-card installed">
        <Smartphone size={28} />
        <div>
          <strong>Application installee</strong>
          <span>THE RIVER est pret depuis ton ecran d'accueil.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pwa-install-card">
      <Smartphone size={30} />
      <div>
        <strong>Installer THE RIVER</strong>
        <span>Ajoute le casino a ton ecran d'accueil pour une experience plein ecran.</span>
      </div>
      <button className="button small" disabled={!promptEvent} onClick={() => void install()} type="button">
        <Download size={16} />
        <span>{promptEvent ? 'Installer' : 'Disponible depuis le menu'}</span>
      </button>
    </div>
  );
}
