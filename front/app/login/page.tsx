'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { LogIn } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-shell">
      <form className="auth-panel" onSubmit={onSubmit}>
        <div>
          <h1>Connexion</h1>
          <p>Reprends ta session et retourne aux tables.</p>
        </div>
        {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
        <label className="field">
          <span>Nom utilisateur</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button className="button" disabled={loading} type="submit">
          <LogIn size={18} />
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
        <p>
          Pas encore de compte ? <Link href="/register">Inscription</Link>
        </p>
      </form>
    </section>
  );
}
