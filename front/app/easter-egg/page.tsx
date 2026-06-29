'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, DoorOpen } from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { StatusMessage } from '@/components/ui';

type EggStatus = {
  keys?: Record<string, boolean>;
  unlockedCount?: number;
  total?: number;
  allKeys?: boolean;
  visited?: boolean;
};

function EasterEggContent() {
  const [status, setStatus] = useState<EggStatus | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setStatus(await apiGet<EggStatus>('/easter-egg/status'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Statut indisponible');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function visit() {
    try {
      await apiPost('/easter-egg/visit', {});
      setMessage('Visite enregistree.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible');
    }
  }

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Easter egg</h1>
          <p>Une salle cachee pour les joueurs qui ont explore tous les jeux.</p>
        </div>
      </div>
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage type="success">{message}</StatusMessage> : null}
      <div className="grid two">
        <section className="panel">
          <h2>Cles</h2>
          <div className="grid">
            {Object.entries(status?.keys ?? { slots: false, blackjack: false, roulette: false, poker: false }).map(([key, value]) => (
              <div className="table-card" key={key}>
                <h3>{key}</h3>
                <div className="table-meta">
                  <span className="chip">{value ? <Check size={14} /> : null}{value ? 'Debloquee' : 'A trouver'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Salle secrete</h2>
          <p>{status?.allKeys ? 'Toutes les cles sont reunies.' : 'Continue a jouer pour completer le trousseau.'}</p>
          <div className="table-meta">
            <span className="chip">{status?.unlockedCount ?? 0}/{status?.total ?? 4}</span>
            <span className="chip">{status?.visited ? 'Deja visitee' : 'Non visitee'}</span>
          </div>
          {status?.allKeys ? (
            <button className="button" onClick={() => void visit()} type="button">
              <DoorOpen size={18} /> Marquer visitee
            </button>
          ) : (
            <Link className="button secondary" href="/dashboard">Retour dashboard</Link>
          )}
        </section>
      </div>
    </section>
  );
}

export default function EasterEggPage() {
  return (
    <RequireAuth>
      <EasterEggContent />
    </RequireAuth>
  );
}
