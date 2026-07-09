'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Send, UserPlus } from 'lucide-react';
import { apiPost } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const { register, login } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({ email, username, password });
      setMessage('Code envoyé par email.');
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inscription impossible. Vérifie les champs puis réessaie.');
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiPost('/auth/verify-email', { email, code }, false);
      await login(username, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vérification impossible. Le code est peut-être invalide ou expiré.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-shell">
      {step === 'form' ? (
        <form className="auth-panel" onSubmit={onRegister}>
          <div>
            <h1>Inscription</h1>
            <p>Démarre avec 1000 crédits et débloque les quêtes.</p>
          </div>
          {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Nom utilisateur</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <button className="button" disabled={loading} type="submit">
            <UserPlus size={18} />
            {loading ? 'Création...' : 'Créer le compte'}
          </button>
          <p>
            Deja inscrit ? <Link href="/login">Connexion</Link>
          </p>
        </form>
      ) : (
        <form className="auth-panel" onSubmit={onVerify}>
          <div>
            <h1>Verification</h1>
            <p>Entre le code recu pour activer ton compte.</p>
          </div>
          {message ? <StatusMessage type="success">{message}</StatusMessage> : null}
          {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
          <label className="field">
            <span>Code email</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required />
          </label>
          <button className="button" disabled={loading} type="submit">
            <Send size={18} />
            {loading ? 'Verification...' : 'Valider'}
          </button>
        </form>
      )}
    </section>
  );
}
