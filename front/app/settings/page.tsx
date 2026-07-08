'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Gamepad2,
  Laptop,
  LogOut,
  Mail,
  MonitorCog,
  Moon,
  RotateCcw,
  Save,
  Send,
  Shield,
  SlidersHorizontal,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { apiGet, apiPatch, apiPost, apiPostForm, setToken } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { UserAvatar } from '@/components/user-avatar';
import { StatusMessage } from '@/components/ui';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
  pushSupported,
  sendPushTest,
} from '@/lib/push-notifications';
import { applyThemePreference } from '@/lib/theme';
import type { UserSettings } from '@/types/api';

const defaultSettings: UserSettings = {
  notifications: {
    enabled: true,
    questReady: true,
    questRecharge: true,
    questClaimed: true,
    dailyBonus: true,
    turnReminder: true,
    weeklySummary: true,
    leaderboard: false,
    easterEgg: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    frequency: 'instant',
  },
  gameplay: {
    defaultBet: 25,
    confirmLargeBet: true,
    largeBetThreshold: 100,
    reducedAnimations: false,
    autoOpenRules: false,
  },
  interface: {
    theme: 'system',
    showLeaderboardByDefault: true,
    compactStats: true,
    highContrast: false,
    favoriteGames: ['SLOTS', 'ROULETTE', 'POKER', 'BLACKJACK'],
  },
  privacy: {
    showInLeaderboard: true,
    publicTableName: true,
  },
};

const gameOptions = [
  { key: 'SLOTS', label: 'Slots' },
  { key: 'ROULETTE', label: 'Roulette' },
  { key: 'POKER', label: 'Poker' },
  { key: 'BLACKJACK', label: 'Blackjack' },
  { key: 'CRAPS', label: 'Craps' },
  { key: 'PACHINKO', label: 'Pachinko' },
  { key: 'HILO', label: 'Hi-Lo' },
  { key: 'MINES', label: 'Mines' },
  { key: 'KENO', label: 'Keno' },
  { key: 'BACCARAT', label: 'Baccarat' },
  { key: 'WHEEL', label: 'Wheel' },
  { key: 'CRASH', label: 'Crash' },
];

type AccountUpdateResponse = {
  access_token: string;
  emailVerificationSent?: boolean;
  user: {
    userId: number;
    username: string;
    email: string;
    emailVerified: boolean;
    credits: number;
    points: number;
    avatarUrl?: string | null;
  };
};

function SettingsToggle({
  checked,
  description,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={disabled ? 'settings-toggle disabled' : 'settings-toggle'}>
      <span>
        <strong>{label}</strong>
        <em>{description}</em>
      </span>
      <input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function SettingsContent() {
  const { logout, refreshUser, user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pushState, setPushState] = useState<'checking' | 'unsupported' | 'denied' | 'idle' | 'subscribed' | 'busy'>('checking');
  const [accountForm, setAccountForm] = useState({ username: '', email: '', password: '' });
  const [accountSaving, setAccountSaving] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSaving, setVerificationSaving] = useState(false);

  const notificationsEnabled = settings.notifications.enabled;

  useEffect(() => {
    if (!user) return;
    setAccountForm((current) => ({
      username: current.username || user.username,
      email: current.email || user.email,
      password: '',
    }));
  }, [user]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const out = await apiGet<UserSettings>('/settings');
        if (alive) setSettings(out);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Parametres indisponibles.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function refreshPush() {
      if (!pushSupported()) {
        if (alive) setPushState('unsupported');
        return;
      }
      const status = await getPushStatus();
      if (!alive) return;
      if (status.permission === 'denied') setPushState('denied');
      else setPushState(status.subscribed ? 'subscribed' : 'idle');
    }

    void refreshPush();
    return () => {
      alive = false;
    };
  }, []);

  async function savePatch(patch: Partial<UserSettings>, optimistic: UserSettings) {
    setSettings(optimistic);
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const out = await apiPatch<UserSettings>('/settings', patch);
      setSettings(out);
      setMessage('Parametres sauvegardes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sauvegarde impossible.');
    } finally {
      setSaving(false);
    }
  }

  function updateSection<K extends keyof UserSettings>(section: K, value: Partial<UserSettings[K]>) {
    const optimistic = {
      ...settings,
      [section]: {
        ...settings[section],
        ...value,
      },
    };
    void savePatch({ [section]: value } as Partial<UserSettings>, optimistic);
  }

  async function togglePushSubscription() {
    setPushState('busy');
    setError('');
    setMessage('');
    try {
      if (pushState === 'subscribed') {
        await disablePushNotifications();
        setPushState('idle');
        setMessage('Notifications navigateur desactivees.');
      } else {
        await enablePushNotifications();
        setPushState('subscribed');
        setMessage('Notifications navigateur activees.');
        if (!settings.notifications.enabled) {
          updateSection('notifications', { enabled: true });
        }
      }
    } catch (err) {
      setPushState(pushState === 'subscribed' ? 'subscribed' : 'idle');
      setError(err instanceof Error ? err.message : 'Action notification impossible.');
    }
  }

  async function testPush() {
    setPushState('busy');
    setError('');
    setMessage('');
    try {
      await sendPushTest();
      setPushState('subscribed');
      setMessage('Notification test envoyee.');
    } catch (err) {
      setPushState('subscribed');
      setError(err instanceof Error ? err.message : 'Notification test impossible.');
    }
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;
    setError('');
    setMessage('');
    const form = new FormData();
    form.append('avatar', file);
    try {
      await apiPostForm('/profile/avatar', form);
      await refreshUser();
      setMessage('Photo de profil mise a jour.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload impossible.');
    }
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    const username = accountForm.username.trim();
    const email = accountForm.email.trim().toLowerCase();
    const password = accountForm.password;

    if (!username || !email || !password) {
      setError('Pseudo, email et mot de passe sont requis.');
      return;
    }

    setAccountSaving(true);
    try {
      const out = await apiPost<AccountUpdateResponse>('/auth/update-account', { username, email, password });
      setToken(out.access_token);
      await refreshUser();
      setAccountForm((current) => ({ ...current, password: '' }));
      if (out.emailVerificationSent) {
        setVerificationEmail(out.user.email);
        setVerificationCode('');
        setMessage('Compte mis a jour. Un code de verification a ete envoye au nouveau mail.');
      } else {
        setMessage('Compte mis a jour.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Modification du compte impossible.');
    } finally {
      setAccountSaving(false);
    }
  }

  async function resendVerification() {
    if (!user?.email) return;
    setError('');
    setMessage('');
    try {
      await apiPost('/auth/resend-verification', { email: user.email });
      if (!user.emailVerified) {
        setVerificationEmail(user.email);
        setVerificationCode('');
      }
      setMessage('Code de verification envoye.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi de verification impossible.');
    }
  }

  async function verifyEmailCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = verificationCode.trim();
    if (!verificationEmail || !code) {
      setError('Code de verification requis.');
      return;
    }

    setVerificationSaving(true);
    setError('');
    setMessage('');
    try {
      await apiPost('/auth/verify-email', { email: verificationEmail, code });
      await refreshUser();
      setVerificationEmail('');
      setVerificationCode('');
      setMessage('Nouvelle adresse email verifiee.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code de verification invalide.');
    } finally {
      setVerificationSaving(false);
    }
  }

  const pushLabel = useMemo(() => {
    if (pushState === 'unsupported') return 'Non supporte';
    if (pushState === 'denied') return 'Bloque navigateur';
    if (pushState === 'subscribed') return 'Actives';
    if (pushState === 'busy') return 'Action...';
    return 'Inactives';
  }, [pushState]);

  if (loading) return <div className="panel loading-panel">Chargement...</div>;

  return (
    <section className="settings-page">
      <header className="settings-hero interactive-card">
        <div>
          <span className="welcome-pill"><SlidersHorizontal size={15} /> Parametres</span>
          <h1>Controle ton espace.</h1>
          <p>Notifications, preferences de jeu, interface et confidentialite au meme endroit.</p>
        </div>
        <div className="settings-hero-status">
          <span>Notifications</span>
          <strong>{pushLabel}</strong>
        </div>
      </header>

      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {saving ? <StatusMessage>Synchronisation des parametres...</StatusMessage> : null}

      <div className="settings-grid">
        <section className="settings-panel settings-panel-wide settings-account-panel interactive-card">
          <div className="card-heading">
            <h2>Compte</h2>
            <UserRound size={19} />
          </div>
          <div className="settings-account-layout">
            <div>
              <div className="settings-profile-photo">
                <UserAvatar avatarUrl={user?.avatarUrl} className="settings-avatar-preview" label={user?.username ?? 'Joueur'} />
                <label className="button secondary">
                  Changer la photo
                  <input accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void uploadAvatar(event.target.files?.[0])} type="file" />
                </label>
              </div>
              <div className="settings-account">
                <span>Verification <strong>{user?.emailVerified ? 'Email verifie' : 'Email non verifie'}</strong></span>
              </div>
            </div>

            <form className="settings-account-form" onSubmit={(event) => void saveAccount(event)}>
              <label>
                <span>Pseudo</span>
                <input
                  autoComplete="username"
                  minLength={3}
                  maxLength={30}
                  type="text"
                  value={accountForm.username}
                  onChange={(event) => setAccountForm((current) => ({ ...current, username: event.target.value }))}
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  autoComplete="email"
                  type="email"
                  value={accountForm.email}
                  onChange={(event) => setAccountForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="settings-account-password">
                <span>Mot de passe</span>
                <input
                  autoComplete="current-password"
                  placeholder="Confirme avec ton mot de passe"
                  type="password"
                  value={accountForm.password}
                  onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <button className="button" disabled={accountSaving} type="submit">
                <Save size={18} /> {accountSaving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </form>
          </div>

          <div className="button-row settings-account-actions">
            <button className="button secondary" onClick={() => void resendVerification()} type="button">
              <Mail size={18} /> Renvoyer verification
            </button>
            <button className="button danger" onClick={logout} type="button">
              <LogOut size={18} /> Deconnexion
            </button>
          </div>
        </section>

        <section className="settings-panel interactive-card settings-panel-wide">
          <div className="card-heading">
            <h2>Notifications</h2>
            <Bell size={19} />
          </div>
          <div className="settings-push-card">
            <div>
              <strong>Notifications Web Push</strong>
              <span>Autorise le navigateur puis choisis les categories utiles.</span>
            </div>
            <div className="settings-push-actions">
              <button className="button" disabled={pushState === 'busy' || pushState === 'unsupported'} onClick={() => void togglePushSubscription()} type="button">
                {pushState === 'subscribed' ? <BellOff size={18} /> : <Bell size={18} />}
                {pushState === 'subscribed' ? 'Desactiver' : 'Activer'}
              </button>
              <button className="button secondary" disabled={pushState !== 'subscribed'} onClick={() => void testPush()} type="button">
                <Send size={18} /> Test
              </button>
            </div>
          </div>

          <div className="settings-list">
            <SettingsToggle
              checked={notificationsEnabled}
              description="Coupe toutes les notifications applicatives sans supprimer l'autorisation navigateur."
              label="Notifications applicatives"
              onChange={(checked) => updateSection('notifications', { enabled: checked })}
            />
            <SettingsToggle checked={settings.notifications.questReady} description="Quand une recompense peut etre recuperee." disabled={!notificationsEnabled} label="Quetes pretes" onChange={(checked) => updateSection('notifications', { questReady: checked })} />
            <SettingsToggle checked={settings.notifications.questRecharge} description="Quand une quete deja recuperee redevient disponible." disabled={!notificationsEnabled} label="Recharge des quetes" onChange={(checked) => updateSection('notifications', { questRecharge: checked })} />
            <SettingsToggle checked={settings.notifications.questClaimed} description="Confirmation apres recuperation d'une recompense." disabled={!notificationsEnabled} label="Quete recuperee" onChange={(checked) => updateSection('notifications', { questClaimed: checked })} />
            <SettingsToggle checked={settings.notifications.dailyBonus} description="Bonus quotidien et rappels legers." disabled={!notificationsEnabled} label="Bonus quotidien" onChange={(checked) => updateSection('notifications', { dailyBonus: checked })} />
            <SettingsToggle checked={settings.notifications.turnReminder} description="Poker et blackjack quand une action t'attend." disabled={!notificationsEnabled} label="Tour de jeu" onChange={(checked) => updateSection('notifications', { turnReminder: checked })} />
            <SettingsToggle checked={settings.notifications.weeklySummary} description="Resume des performances de la semaine." disabled={!notificationsEnabled} label="Resume hebdo" onChange={(checked) => updateSection('notifications', { weeklySummary: checked })} />
            <SettingsToggle checked={settings.notifications.leaderboard} description="Mouvements importants au classement." disabled={!notificationsEnabled} label="Leaderboard" onChange={(checked) => updateSection('notifications', { leaderboard: checked })} />
            <SettingsToggle checked={settings.notifications.easterEgg} description="Indices secrets et evenements rares." disabled={!notificationsEnabled} label="Easter egg" onChange={(checked) => updateSection('notifications', { easterEgg: checked })} />
          </div>

          <div className="settings-inline-controls">
            <SettingsToggle checked={settings.notifications.quietHoursEnabled} description="Suspend les notifications pendant une plage horaire." disabled={!notificationsEnabled} label="Mode silencieux" onChange={(checked) => updateSection('notifications', { quietHoursEnabled: checked })} />
            <label>
              <span>Debut</span>
              <input disabled={!settings.notifications.quietHoursEnabled || !notificationsEnabled} type="time" value={settings.notifications.quietHoursStart} onChange={(event) => updateSection('notifications', { quietHoursStart: event.target.value })} />
            </label>
            <label>
              <span>Fin</span>
              <input disabled={!settings.notifications.quietHoursEnabled || !notificationsEnabled} type="time" value={settings.notifications.quietHoursEnd} onChange={(event) => updateSection('notifications', { quietHoursEnd: event.target.value })} />
            </label>
            <label>
              <span>Frequence</span>
              <select disabled={!notificationsEnabled} value={settings.notifications.frequency} onChange={(event) => updateSection('notifications', { frequency: event.target.value as UserSettings['notifications']['frequency'] })}>
                <option value="instant">Immediat</option>
                <option value="digest">Resume groupe</option>
                <option value="minimal">Minimal</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-panel interactive-card">
          <div className="card-heading">
            <h2>Jeu</h2>
            <Gamepad2 size={19} />
          </div>
          <div className="settings-form-grid">
            <label>
              <span>Mise par defaut</span>
              <input min={1} type="number" value={settings.gameplay.defaultBet} onChange={(event) => updateSection('gameplay', { defaultBet: Number(event.target.value) })} />
            </label>
            <label>
              <span>Seuil grosse mise</span>
              <input min={1} type="number" value={settings.gameplay.largeBetThreshold} onChange={(event) => updateSection('gameplay', { largeBetThreshold: Number(event.target.value) })} />
            </label>
          </div>
          <div className="settings-list compact">
            <SettingsToggle checked={settings.gameplay.confirmLargeBet} description="Demande confirmation au-dessus du seuil choisi." label="Confirmer les grosses mises" onChange={(checked) => updateSection('gameplay', { confirmLargeBet: checked })} />
            <SettingsToggle checked={settings.gameplay.reducedAnimations} description="Reduit les animations longues et les effets visuels." label="Animations reduites" onChange={(checked) => updateSection('gameplay', { reducedAnimations: checked })} />
            <SettingsToggle checked={settings.gameplay.autoOpenRules} description="Ouvre les regles au premier lancement d'un jeu." label="Regles au demarrage" onChange={(checked) => updateSection('gameplay', { autoOpenRules: checked })} />
          </div>
        </section>

        <section className="settings-panel interactive-card">
          <div className="card-heading">
            <h2>Interface</h2>
            <MonitorCog size={19} />
          </div>
          <div className="settings-theme-picker" aria-label="Theme de l'interface">
            {[
              { key: 'system', label: 'Systeme', icon: Laptop },
              { key: 'light', label: 'Light', icon: Sun },
              { key: 'dark', label: 'Dark', icon: Moon },
            ].map((theme) => {
              const Icon = theme.icon;
              const active = settings.interface.theme === theme.key;
              return (
                <button
                  className={active ? 'selected' : ''}
                  key={theme.key}
                  onClick={() => {
                    const nextTheme = theme.key as UserSettings['interface']['theme'];
                    applyThemePreference(nextTheme);
                    updateSection('interface', { theme: nextTheme });
                  }}
                  type="button"
                >
                  <Icon size={17} />
                  <span>{theme.label}</span>
                </button>
              );
            })}
          </div>
          <div className="settings-list compact">
            <SettingsToggle checked={settings.interface.showLeaderboardByDefault} description="Affiche le classement directement sur le dashboard." label="Leaderboard par defaut" onChange={(checked) => updateSection('interface', { showLeaderboardByDefault: checked })} />
            <SettingsToggle checked={settings.interface.compactStats} description="Garde les blocs stats dans un format plus dense." label="Stats compactes" onChange={(checked) => updateSection('interface', { compactStats: checked })} />
            <SettingsToggle checked={settings.interface.highContrast} description="Renforce les contrastes pour la lisibilite." label="Contraste eleve" onChange={(checked) => updateSection('interface', { highContrast: checked })} />
          </div>
          <h3 className="settings-subtitle">Jeux favoris</h3>
          <div className="settings-game-picker">
            {gameOptions.map((game) => {
              const active = settings.interface.favoriteGames.includes(game.key);
              return (
                <button
                  className={active ? 'selected' : ''}
                  key={game.key}
                  onClick={() => {
                    const next = active
                      ? settings.interface.favoriteGames.filter((item) => item !== game.key)
                      : [...settings.interface.favoriteGames, game.key];
                    updateSection('interface', { favoriteGames: next });
                  }}
                  type="button"
                >
                  {game.label}
                  {active ? <Check size={15} /> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-panel interactive-card">
          <div className="card-heading">
            <h2>Confidentialite</h2>
            <Shield size={19} />
          </div>
          <div className="settings-list compact">
            <SettingsToggle checked={settings.privacy.showInLeaderboard} description="Autorise ton pseudo dans les classements publics." label="Visible dans le leaderboard" onChange={(checked) => updateSection('privacy', { showInLeaderboard: checked })} />
            <SettingsToggle checked={settings.privacy.publicTableName} description="Utilise ton pseudo dans les tables publiques." label="Pseudo sur tables publiques" onChange={(checked) => updateSection('privacy', { publicTableName: checked })} />
          </div>
        </section>

        <section className="settings-panel interactive-card">
          <div className="card-heading">
            <h2>Raccourcis</h2>
            <RotateCcw size={19} />
          </div>
          <div className="settings-shortcuts">
            <Link className="button secondary" href="/dashboard">Retour dashboard</Link>
            <Link className="button secondary" href="/games">Choisir un jeu</Link>
          </div>
        </section>
      </div>

      {verificationEmail ? (
        <div className="settings-verification-backdrop" role="presentation">
          <form className="settings-verification-modal interactive-card" onSubmit={(event) => void verifyEmailCode(event)}>
            <div className="card-heading">
              <div>
                <h2>Verifier le nouveau mail</h2>
                <p>Entre le code envoye a {verificationEmail}.</p>
              </div>
              <button className="icon-button" onClick={() => setVerificationEmail('')} type="button" aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <label>
              <span>Code de verification</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            <div className="button-row">
              <button className="button" disabled={verificationSaving || verificationCode.trim().length < 6} type="submit">
                <Check size={18} /> {verificationSaving ? 'Verification...' : 'Valider'}
              </button>
              <button className="button secondary" onClick={() => void resendVerification()} type="button">
                <Mail size={18} /> Renvoyer
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}
